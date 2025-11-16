from langgraph.graph import StateGraph, END
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.memory import MemorySaver
from .state import AgentState
from .prompt import prompt
from .tools import tools, search_scripts_tool, get_script_parameters_tool, set_active_script_tool, run_script_by_name
import os
from langchain_core.messages import ToolMessage, HumanMessage, AIMessage
from .api_helpers import read_local_script_manifest
import json
from pydantic import BaseModel, Field
from typing import List, Any
import uuid
import re



class RelevantScripts(BaseModel):
    """A list of relevant script IDs."""
    script_ids: List[str] = Field(description="A list of the string IDs of scripts that are relevant to the user's query.")

def _get_llm(state: AgentState):
    """Dynamically creates an LLM instance based on the state."""
    provider = state.get("llm_provider")
    model = state.get("llm_model")
    api_key_value = state.get("llm_api_key_value")

    if not provider:
        raise ValueError("LLM provider not specified in agent state. Please configure it in the settings.")
    if not model:
        raise ValueError("LLM model not specified in agent state. Please configure it in the settings.")
    if not api_key_value:
        raise ValueError("LLM API key not provided in agent state. Please configure it in the settings.")

    if provider.lower() == "google":
        return ChatGoogleGenerativeAI(
            model=model, 
            google_api_key=api_key_value, 
            convert_system_message_to_human=True
        )
    # In the future, other providers can be added here.
    # elif provider == "openai":
    #     return ChatOpenAI(model=model, api_key=api_key_value)
    
    else:
        raise ValueError(f"Unsupported LLM provider: {provider}")

def agent_node(state: AgentState):
    """
    The agent node that invokes the LLM.
    This node also performs semantic search if a full manifest is available.
    """
    llm = _get_llm(state)
    llm_with_tools = llm.bind_tools(tools)
    
    current_human_message = None
    for msg in reversed(state["messages"]):
        if isinstance(msg, HumanMessage):
            current_human_message = msg
            break

    # --- Handle Post-Execution Summary ---
    if current_human_message and current_human_message.content == "System: Script execution was successful.":
        
        final_message = "Action completed successfully." # Default message
        summary_data = state.get("execution_summary")
        raw_output_data = state.get("raw_output_for_summary")

        if summary_data:
            # Case 1: A pre-generated summary exists for large output
            prompt_text = ""
            table_summary = summary_data.get('table_summary') or summary_data.get('table')
            console_summary = summary_data.get('console_summary') or summary_data.get('console')

            if table_summary:
                row_count = table_summary.get('row_count', 'an unknown number of')
                prompt_text = f"""The script you ran returned a table with {row_count} rows. 
                Briefly state this and tell the user they can see the full table in the 'Table' tab. 
                Keep the response to a single, user-friendly sentence."""
            elif console_summary:
                line_count = console_summary.get('line_count', 'an unknown number of')
                prompt_text = f"""The script you ran produced {line_count} lines of console output. 
                Briefly state this and tell the user they can see the full output in the 'Console' tab. 
                Keep the response to a single, user-friendly sentence."""
            
            if prompt_text:
                final_message = llm.invoke(prompt_text).content
            else:
                final_message = "Script executed successfully, but the summary format was unrecognized."
        elif raw_output_data:
            # Case 2: No pre-generated summary exists. The agent MUST summarize the raw console output.
            console_output = raw_output_data.get('consoleOutput')

            # Console output is guaranteed to exist due to CodeRunner's success/failure messages.
            # Filter out the default success message from the console log before summarizing
            lines = console_output.strip().split('\n')
            relevant_lines = [line for line in lines if not line.startswith("✅") and not line.startswith("❌")]
            relevant_output = "\n".join(relevant_lines).strip()

            if relevant_output:
                prompt_text = f"""The script ran and produced the following console output:
                ---
                {relevant_output}
                ---
                Summarize this output in a user-friendly, conversational way. Keep the response to 1-2 sentences."""
                final_message = llm.invoke(prompt_text).content
            else:
                # If after filtering, there's no relevant output, just state success.
                final_message = "Script executed successfully."
        # Case 3: No summary and no raw output, use the default "Action completed successfully."

        # Return state to end the conversation
        return {
            "messages": [AIMessage(content=final_message)],
            # Reset state for the next turn
            "selected_script_metadata": None,
            "script_parameters_definitions": None,
            "next_conversational_action": None,
            "identified_scripts_for_choice": None,
            "recommended_script_name": None,
            "script_selected_for_params": None,
            "final_parameters_for_execution": None,
            "ui_parameters": None,
            "execution_summary": None,
            "raw_output_for_summary": None,
        }
            
    previous_conversational_action = state.get("next_conversational_action")

    # --- Handle presenting parameters after they've been fetched ---
    if previous_conversational_action == "present_parameters" and state.get('script_parameters_definitions') is not None:
        selected_script = state.get('selected_script_metadata')
        parameters = state.get('script_parameters_definitions')

        param_summary = "Here are the parameters for **" + selected_script.get('name', 'the selected script') + "**:\n"
        if parameters:
            for param in parameters:
                param_summary += f"- **{param.get('name')}**: Type={param.get('type')}, Default={param.get('defaultValueJson')}\n"
        else:
            param_summary += "No parameters found for this script.\n"
        
        param_summary += "\nDo you want to run it with these parameters, or would you like to change any parameter values?"
        
        return {
            "messages": [AIMessage(content=param_summary)],
            "next_conversational_action": "confirm_execution"
        }

    # --- Handle Parameter Modification from User Chat ---
    elif previous_conversational_action == "confirm_execution" and current_human_message:
        
        class ParameterUpdate(BaseModel):
            """A single parameter update."""
            name: str = Field(description="The name of the parameter to update.")
            value: Any = Field(description="The new value for the parameter.")

        class ParameterUpdates(BaseModel):
            """A list of parameter updates extracted from the user's message."""
            updates: List[ParameterUpdate] = Field(description="A list of parameter updates.")

        extraction_llm = llm.with_structured_output(ParameterUpdates)
        
        current_params = state.get('script_parameters_definitions', [])
        param_names = [p.get('name') for p in current_params]

        extraction_prompt = f"""The user wants to modify parameters for a script. Their request is: "{current_human_message.content}"
        
        Available parameter names are: {param_names}
        
        Your task is to extract the parameter names and their new values from the user's request.
        - The user might refer to parameters by their exact name or a close variation (e.g., "level" for "levelName").
        - The value could be a string, a number, or a boolean.
        - If a parameter name from the user's request does not closely match any of the available parameter names, ignore it.
        
        Return a list of all identified parameter updates.
        """
        
        try:
            extracted_updates_obj = extraction_llm.invoke([HumanMessage(content=extraction_prompt)])
            chat_updates = {item.name: item.value for item in extracted_updates_obj.updates}
        except Exception as e:
            print(f"agent_node: Could not extract parameter updates from user message: {e}")
            chat_updates = {}

        # Merge parameters: UI changes first, then chat changes
        ui_params = state.get('ui_parameters') # This is a dict of {name: value}
        
        # Create a dictionary of current parameters for easy lookup
        params_dict = {p['name']: p for p in current_params}

        # Apply UI updates
        if ui_params:
            for param_name, param_value in ui_params.items():
                if param_name in params_dict:
                    params_dict[param_name]['value'] = param_value
                    params_dict[param_name]['defaultValueJson'] = json.dumps(param_value)

        # Apply chat updates (these take precedence)
        if chat_updates:
            for param_name, param_value in chat_updates.items():
                # Find the correct parameter name (case-insensitive)
                for p_name in params_dict.keys():
                    if p_name.lower() == param_name.lower():
                        params_dict[p_name]['value'] = param_value
                        params_dict[p_name]['defaultValueJson'] = json.dumps(param_value)
                        break

        updated_params_list = list(params_dict.values())

        # Check if the user also wants to run the script
        run_intent_prompt = f"""Does the following user request include a command to run or execute the script? Respond with a single word: YES or NO. User request: "{current_human_message.content}" """
        run_intent_response = llm.invoke([HumanMessage(content=run_intent_prompt)])
        is_run_request = "YES" in run_intent_response.content.strip().upper()

        if is_run_request:
            # Prepare for HITL by calling the run_script_by_name tool
            selected_script = state.get('selected_script_metadata')
            final_params = {p['name']: p['value'] for p in updated_params_list}
            
            tool_call = {
                "name": "run_script_by_name",
                "args": {
                    "script_name": selected_script.get('name'),
                    "parameters": final_params,
                    "is_final_approval": True # Signal to frontend this is the final step
                },
                "id": f"tool_call_{uuid.uuid4()}" # Generate a unique ID
            }
            
            return {
                "messages": [AIMessage(content="", tool_calls=[tool_call])],
                "status": "interrupted", # Signal to frontend to look for tool_call
                "tool_call": tool_call, # Include the tool_call directly in the response data
                "final_parameters_for_execution": updated_params_list, # Keep this for potential frontend use
            }

        else:
            # Just respond with the updated parameters for confirmation
            param_summary = "I've updated the parameters. Here is the new configuration:\n"
            for param in updated_params_list:
                param_summary += f"- **{param.get('name')}**: {param.get('defaultValueJson')}\n"
            param_summary += "\nDo you want to run the script with these settings, or make more changes?"

            return {
                "messages": [AIMessage(content=param_summary)],
                "script_parameters_definitions": updated_params_list,
                "next_conversational_action": "confirm_execution" # Stay in this state
            }

    # --- Handle User's Script Selection ---
    elif previous_conversational_action == "ask_for_script_confirmation" and current_human_message:
        user_selection = current_human_message.content.strip()
        identified_scripts = state.get('identified_scripts_for_choice', [])
        recommended_script_name = state.get('recommended_script_name')
        selected_script = None

        # Prioritize checking for a specific script selection first
        selected_script = None
        
        # Check for a number in the user's response
        numbers_in_response = re.findall(r'\d+', user_selection)
        if numbers_in_response:
            try:
                index = int(numbers_in_response[0]) - 1
                if 0 <= index < len(identified_scripts):
                    selected_script = identified_scripts[index]
            except (ValueError, IndexError):
                pass # Ignore if conversion or indexing fails
        
        # If not a number, check for name
        if not selected_script:
            # Check for a script name (or part of it) in the user's response
            for script in identified_scripts:
                # e.g., "spiral" in "Create_Spiral_Wall.cs"
                script_base_name = script.get('name', '').split('.')[0].lower().replace('_', ' ')
                if script_base_name in user_selection.lower():
                    selected_script = script
                    break # Take the first partial match

        # If no specific script was chosen, check if the user is affirming the recommendation
        if not selected_script:
            affirmation_prompt = f"""The user was asked to confirm a recommended action. Their response is: "{user_selection}"\nIs this response a confirmation or agreement (e.g., yes, proceed, ok, do it, sounds good)?\nRespond with a single word: YES or NO.\n"""
            affirmation_response = llm.invoke([HumanMessage(content=affirmation_prompt)])
            is_affirmation = "YES" in affirmation_response.content.strip().upper()

            if is_affirmation and recommended_script_name:
                selected_script = next((s for s in identified_scripts if s.get('name') == recommended_script_name), None)
        
        if selected_script:
            return {
                "selected_script_metadata": selected_script,
                "script_selected_for_params": True,
                "next_conversational_action": "present_parameters"
            }
        else:
            return {"messages": [AIMessage(content="I couldn't understand your selection. Please respond with the number or exact name of the script you'd like to proceed with.")],
                "next_conversational_action": "ask_for_script_confirmation"
            }

    # --- Perform Semantic Search ---
    elif state.get('identified_scripts_for_choice') and isinstance(state['identified_scripts_for_choice'], list):
        full_manifest = state['identified_scripts_for_choice']
        query = state.get('current_task_description')
        if query and full_manifest:
            try:
                structured_llm = llm.with_structured_output(RelevantScripts)
                scripts_for_llm = [script for script in full_manifest if script.get('name') != 'manifest.json']
                filtering_prompt = f"""You are a script filter. Your task is to identify all scripts that EXACTLY match the user's requested action.
User Query: "{query}"
Review the "Available Scripts" below. For each script, check if its `description` indicates that it performs the user's requested action.
**CRITICAL RULE:** Do NOT select a script if it only contains a keyword but performs the wrong action. For example, if the query is "create a wall", a script that "rotates a wall" is not a match.
**EXAMPLE:**
If the user query is "make a building element" and the available scripts are one that "creates a wall" and another that "creates a floor", you should return the IDs of BOTH scripts.
Available Scripts:
{json.dumps(scripts_for_llm, indent=2)}
Identify ALL scripts that are a direct match for the user's query and return their IDs.
"""
                response_obj = structured_llm.invoke([HumanMessage(content=filtering_prompt)])
                matching_ids = response_obj.script_ids
                semantically_relevant_scripts = [s for s in scripts_for_llm if s.get('id') in matching_ids]

                if len(semantically_relevant_scripts) == 1:
                    return {
                        "selected_script_metadata": semantically_relevant_scripts[0],
                        "script_selected_for_params": True,
                        "next_conversational_action": "present_parameters"
                    }
                elif len(semantically_relevant_scripts) > 1:
                    ranking_prompt = f"""Given the user's query and a list of relevant scripts, which script is the single best fit for the task?
User Query: "{query}"
Relevant Scripts:
{json.dumps(semantically_relevant_scripts, indent=2)}
Your task is to respond with the `name` of the single best script. Only return the name, nothing else.
"""
                    best_fit_response = llm.invoke([HumanMessage(content=ranking_prompt)])
                    best_fit_name = best_fit_response.content.strip().replace('"', '')
                    script_summary_text = "I've found a few scripts that could work:\n"
                    for i, script in enumerate(semantically_relevant_scripts):
                        script_summary_text += f"{i+1}. **{script.get('name', 'Unknown')}**: {script.get('metadata', {}).get('description', 'No description available.')}\n"
                    script_summary_text += f"\nBased on your request, **{best_fit_name}** seems like the best fit. Do you want to proceed with it, or would you like to choose a different one?"
                    return {
                        "messages": [AIMessage(content=script_summary_text)],
                        "identified_scripts_for_choice": semantically_relevant_scripts,
                        "recommended_script_name": best_fit_name,
                        "next_conversational_action": "ask_for_script_confirmation"
                    }
                else:
                    return {"messages": [AIMessage(content="I couldn't find any relevant scripts for your task.")]}
            except Exception as e:
                print(f"agent_node: Error processing LLM response for script filtering: {e}")
                return {"messages": [AIMessage(content="I encountered an error while trying to find relevant scripts. Please try again.")]}

    # If no specific conversational action or semantic search was triggered, invoke the main chain
    else:
        chain = prompt | llm_with_tools
    response = chain.invoke({
        "messages": state["messages"],
        "agent_scripts_path": state.get("agent_scripts_path"),
        "current_task_description": state.get("current_task_description")
    })
    return {"messages": [response]}

def tool_node(state: AgentState):
    last_message = state['messages'][-1]
    if not hasattr(last_message, 'tool_calls') or not last_message.tool_calls:
        return {}
    state_update = {}
    results = []
    for tool_call in last_message.tool_calls:
        if tool_call['name'] == search_scripts_tool.name:
            # ALWAYS use agent_scripts_path from state, overriding any LLM-generated value
            actual_agent_scripts_path = state.get('agent_scripts_path')
            if not actual_agent_scripts_path:
                error_message = "Agent scripts path is not set in AgentState. Cannot search scripts."
                results.append(ToolMessage(content=json.dumps({"error": error_message}), tool_call_id=tool_call['id']))
                continue

            full_manifest = read_local_script_manifest(agent_scripts_path=actual_agent_scripts_path)
            state_update['identified_scripts_for_choice'] = full_manifest
            results.append(ToolMessage(content=json.dumps(full_manifest), tool_call_id=tool_call['id']))
        elif tool_call['name'] == run_script_by_name.name:
            result = run_script_by_name.invoke(tool_call['args'])
            
            agent_summary = result.get("agent_summary", "Script executed. See Summary tab for details.")
            
            # Create an AIMessage with the agent_summary
            ai_message = AIMessage(content=agent_summary)
            
            # Update state with the AI message and signal END
            return {
                "messages": [ai_message],
                "next_conversational_action": END # Explicitly set END here
            }
        else:
            results.append(ToolMessage(content=f"Unknown or unhandled tool: {tool_call['name']}", tool_call_id=tool_call['id']))
    state_update["messages"] = results
    return state_update

def get_parameters_node(state: AgentState):
    selected_script = state.get('selected_script_metadata')
    user_token = state.get('user_token')
    if not selected_script or not user_token:
        return {"messages": [AIMessage(content="Error: Script not selected or user not authenticated.")]}
    parameters = get_script_parameters_tool.invoke({
        "script_path": selected_script.get('absolutePath'),
        "script_type": selected_script.get('type'),
        "user_token": user_token
    })
    set_active_script_tool.invoke({"script_metadata": selected_script})
    return {
        "script_parameters_definitions": parameters,
        "next_conversational_action": "present_parameters"
    }

def should_continue(state: AgentState):
    last_message = state['messages'][-1]
    if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
        # If the tool call is for running the script, the agent's job is done.
        # The frontend will take over and show the HITL modal.
        if last_message.tool_calls[0]['name'] == 'run_script_by_name':
            return END
        return "tool_node"
    if state.get("next_conversational_action") == "present_parameters":
        return "get_parameters_node"
    return END

# --- Graph Definition ---
graph_builder = StateGraph(AgentState)

# Define the nodes
graph_builder.add_node("agent", agent_node)
graph_builder.add_node("tool_node", tool_node)
graph_builder.add_node("get_parameters_node", get_parameters_node)

# Set the entry point
graph_builder.set_entry_point("agent")

# Add the conditional edge
graph_builder.add_conditional_edges(
    "agent",
    should_continue,
    {"tool_node": "tool_node", "get_parameters_node": "get_parameters_node", END: END}
)

# Add the edge from the tool node back to the agent
graph_builder.add_edge("tool_node", "agent")
graph_builder.add_edge("get_parameters_node", "agent")

# Compile the graph
memory = MemorySaver()
_app = None

def get_app():
    global _app
    if _app is None:
        _app = graph_builder.compile(checkpointer=memory)
    return _app
