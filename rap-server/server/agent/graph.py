from langgraph.graph import StateGraph, END
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.memory import MemorySaver
from .state import AgentState
from .prompt import prompt
from .tools import tools, search_scripts_tool, get_script_parameters_tool, set_active_script_tool
import os
from langchain_core.messages import ToolMessage, HumanMessage, AIMessage
from .api_helpers import read_local_script_manifest
import json
from pydantic import BaseModel, Field
from typing import List
import re

class RelevantScripts(BaseModel):
    """A list of relevant script IDs."""
    script_ids: List[str] = Field(description="A list of the string IDs of scripts that are relevant to the user's query.")

def _get_llm(state: AgentState):
    """Dynamically creates an LLM instance based on the state."""
    provider = state.get("llm_provider")
    model = state.get("llm_model")
    api_key_value = state.get("llm_api_key_value")

    if provider == "google":
        api_key = api_key_value or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY environment variable not set or not provided in state.")
        return ChatGoogleGenerativeAI(model=model or "gemini-2.0-flash", google_api_key=api_key, convert_system_message_to_human=True)
    
    api_key = api_key_value or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY environment variable not set or not provided in state.")
    return ChatGoogleGenerativeAI(model="gemini-2.0-flash", google_api_key=api_key, convert_system_message_to_human=True)

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
            
    previous_conversational_action = state.get("next_conversational_action")

    # --- Handle presenting parameters after they've been fetched ---
    if previous_conversational_action == "present_parameters" and state.get('script_parameters_definitions'):
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

    # --- Handle User's Script Selection ---
    if previous_conversational_action == "ask_for_script_confirmation" and current_human_message:
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
    if state.get('identified_scripts_for_choice') and isinstance(state['identified_scripts_for_choice'], list):
        full_manifest = state['identified_scripts_for_choice']
        query = state.get('current_task_description')
        if query and full_manifest:
            try:
                structured_llm = llm.with_structured_output(RelevantScripts)
                scripts_for_llm = [script for script in full_manifest if script.get('name') != 'manifest.json']
                filtering_prompt = f"""You are a script filter. Your task is to identify all scripts that EXACTLY match the user's requested action.
User Query: "{query}"
Review the "Available Scripts" below. For each script, check if its `description` indicates that it performs the user's requested action.
**CRITICAL RULE:** Do NOT select a script if it only contains a keyword but performs the wrong action. For example, if the query is "create a wall", you MUST REJECT a script that "lists wall parameters".
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

    # If no specific semantic search flow was triggered, invoke the main chain
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
