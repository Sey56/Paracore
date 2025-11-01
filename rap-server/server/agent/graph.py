from langchain_core.messages import BaseMessage, HumanMessage, ToolMessage, AIMessage
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_google_genai import ChatGoogleGenerativeAI
from typing_extensions import TypedDict, Annotated
import os
import json
import traceback
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from .tools import run_script_by_name, get_script_parameters_tool, list_available_scripts, set_active_script_source_tool, get_ui_parameters_tool
from .api_helpers import list_scripts_in_workspace, run_script_from_server, get_script_parameters_from_server

# --- 1. Define Agent State ---
class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], lambda x, y: x + y]
    workspace_path: str
    user_token: str
    script_to_run: dict | None
    script_parameters_definitions: list | None
    selected_script_info: dict | None # New field to store selected script details

# --- 2. Setup Tools, Prompt, and LLM ---

tools = [run_script_by_name, get_script_parameters_tool, list_available_scripts, set_active_script_source_tool, get_ui_parameters_tool]

google_api_key = os.getenv("GOOGLE_API_KEY")
if not google_api_key:
    raise ValueError("GOOGLE_API_KEY not found in environment variables.")

llm = ChatGoogleGenerativeAI(
    model="gemini-2.0-flash", 
    api_key=google_api_key,
    convert_system_message_to_human=True # Important for Gemini 1.5
)

llm_with_tools = llm.bind_tools(tools)

prompt = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """You are a specialized Revit assistant named Paracore Agent. Your primary function is to help users by executing scripts to accomplish Revit tasks. You are the expert, and the user is not expected to know the names of your scripts/tools.

## CORE LOGIC
- **Understand the Goal:** Your first step is to understand what the user wants to accomplish in Revit.
- **Find the Right Tool:** Based on the user's request, you must find a relevant script from your workspace. Use the `list_available_scripts` tool to get a list of available scripts. **You must prioritize the `description` of the script over its `name` when determining relevance.** The description provides the most important information about what the script does.
- **Get All Parameters:** Once a script is identified, use the `get_script_parameters_tool` to get the full list of its parameters and their default values. Present these to the user in a clear, formatted list. **After presenting the parameters, you must explicitly ask the user if they want to change any of them and wait for their response before proceeding.**
- **Sync and Confirm before Execution:** Every single time the user asks you to run the script or proceed with execution, you **must** perform the following synchronization steps, even if you have done them before:
    1.  Call the `get_ui_parameters_tool` to get the latest parameter values from the user interface.
    2.  Take the result of that tool as the new baseline for the parameters.
    3.  Apply any parameter changes from the user's most recent conversational message.
    4.  If the user's instruction was to run the script directly (e.g., "...and run it"), you can proceed to call `run_script_by_name` with the merged parameters.
    5.  Otherwise, you must present the complete, final list of merged parameters to the user for one last confirmation before proceeding.
- **Update and Send All Parameters:** When the user asks to run the script, update your list of parameters with their specific changes. Then, call the `run_script_by_name` tool with the **complete, updated list of ALL parameters** (both changed and default).
- **Handle Ambiguity:** If you are unsure which script to run, or if the user's request is unclear, ask for clarification. Do not guess.
- **If No Tool is Found:** If you don't have a tool to accomplish the user's request, you must inform them of this and ask if they would like you to create one.
- **Confirm Success:** After running a script, confirm to the user that it was executed and report the result."""
        ),
        MessagesPlaceholder(variable_name="messages"),
    ]
)

chain = prompt | llm_with_tools

# --- 3. Define Graph Nodes ---

def agent_node(state: AgentState) -> AgentState:
    """Invokes the LLM to get the next action, with a robust fail-safe."""
    try:
        # Patch message history to prevent the "invalid parts" error
        patched_messages = []
        for msg in state["messages"]:
            if isinstance(msg, ToolMessage) and msg.name == 'get_ui_parameters_tool':
                try:
                    ui_parameters = json.loads(msg.content)
                    state['script_parameters_definitions'] = ui_parameters
                    # Do not add this ToolMessage to patched_messages, as it's processed internally
                    continue
                except json.JSONDecodeError:
                    print(f"Warning: Could not decode JSON from get_ui_parameters_tool result: {msg.content}")
            
            if isinstance(msg, AIMessage) and msg.tool_calls and not msg.content:
                patched_messages.append(AIMessage(content=".", tool_calls=msg.tool_calls, id=msg.id))
            else:
                patched_messages.append(msg)

        print(f"agent_node: Messages being sent to LLM: {patched_messages}")
        response = chain.invoke({"messages": patched_messages})
        
        # If selected_script_info is present in the state, create a new AIMessage with it
        if state.get('selected_script_info') and isinstance(response, AIMessage):
            new_additional_kwargs = response.additional_kwargs.copy()
            new_additional_kwargs['selected_script_info'] = state['selected_script_info']
            response = AIMessage(
                content=response.content,
                tool_calls=response.tool_calls,
                additional_kwargs=new_additional_kwargs,
                response_metadata=response.response_metadata,
                id=response.id,
                name=response.name
            )
            # Clear selected_script_info from the state to avoid sending it again
            state['selected_script_info'] = None

        # Post-process the response to ensure proper formatting for lists
        if isinstance(response, AIMessage) and response.content:
            # Aggressively ensure list items are on new lines
            processed_content = response.content
            
            # Replace common list item prefixes with newline + prefix
            processed_content = processed_content.replace("* ", "\n* ")
            processed_content = processed_content.replace("- ", "\n- ")
            
            # Clean up any leading newlines that might result from the split
            response.content = processed_content.strip()

        return {"messages": [response]}

    except Exception as e:
        print("--- AGENT NODE CRITICAL ERROR ---")
        traceback.print_exc()
        print("---------------------------------")
        error_message = "I'm sorry, but I've encountered a critical internal error. I cannot proceed with your request."
        return {"messages": [AIMessage(content=error_message)]}

def tool_node(state: AgentState) -> dict:

    """This node executes tools by orchestrating calls to API helpers."""

    tool_calls = state['messages'][-1].tool_calls

    if not tool_calls:

        return {}



    results = []

    selected_script_info_to_update = None

    for tool_call in tool_calls:

        tool_name = tool_call['name']

        tool_args = tool_call['args']



        result_json = {"error": "Unknown tool or processing error.", "is_success": False}

        workspace_path = state.get('workspace_path')

        user_token = state.get('user_token')



        if not workspace_path or not user_token:

            result_json = {"error": "Workspace path or user token not set in agent's state.", "is_success": False}

            results.append(ToolMessage(content=json.dumps(result_json), tool_call_id=tool_call['id']))

            continue



        if tool_name == 'run_script_by_name':

            results.append(AIMessage(content="", tool_calls=[tool_call]))

            continue

        elif tool_name == 'get_ui_parameters_tool':

            results.append(AIMessage(content="", tool_calls=[tool_call]))

            continue

        elif tool_name == 'get_script_parameters_tool':

            script_name = tool_args.get('script_name', '')

            all_scripts = list_scripts_in_workspace(workspace_path)

            matching_scripts = [s for s in all_scripts if os.path.splitext(s['name'])[0].lower() == os.path.splitext(script_name)[0].lower()]



            if len(matching_scripts) == 0:

                result_json = {"error": f"Script '{script_name}' not found.", "is_success": False}

            elif len(matching_scripts) > 1:

                result_json = {"error": "multiple_scripts_found", "scripts": [s['name'] for s in matching_scripts]}

            else:

                found_script = matching_scripts[0]

                selected_script_info_to_update = {

                    'absolutePath': found_script['absolutePath'],

                    'type': found_script['type']

                }



                result_json = get_script_parameters_from_server(

                    script_path=found_script['absolutePath'],

                    script_type=found_script['type'],

                    user_token=user_token

                )

                if 'parameters' in result_json:

                    state['script_parameters_definitions'] = result_json['parameters']

        elif tool_name == 'list_available_scripts':

            scripts = list_scripts_in_workspace(workspace_path)

            summarized_scripts = []

            for script in scripts:

                description = script.get("metadata", {}).get("description", "No description available.")

                summarized_scripts.append({"name": script.get("name"), "description": description})

            result_json = summarized_scripts



        results.append(ToolMessage(content=json.dumps(result_json), tool_call_id=tool_call['id']))



    return_dict = {"messages": results}

    if selected_script_info_to_update:

        return_dict["selected_script_info"] = selected_script_info_to_update

    

    return return_dict

def human_in_the_loop_node(state: AgentState) -> dict:
    """Handles the execution of the run_script_by_name tool after user approval."""
    tool_calls = state['messages'][-1].tool_calls
    if not tool_calls:
        return {}

    tool_call = tool_calls[0]
    if tool_call['name'] != 'run_script_by_name':
        return {}

    workspace_path = state.get('workspace_path')
    user_token = state.get('user_token')
    script_name = tool_call['args'].get('script_name', '')
    parameters_dict = tool_call['args'].get('parameters', {})

    all_scripts = list_scripts_in_workspace(workspace_path)
    matching_scripts = [s for s in all_scripts if os.path.splitext(s['name'])[0].lower() == os.path.splitext(script_name)[0].lower()]

    if len(matching_scripts) == 0:
        result_json = {"error": f"Script '{script_name}' not found.", "is_success": False}
    elif len(matching_scripts) > 1:
        result_json = {"error": "multiple_scripts_found", "scripts": [s['name'] for s in matching_scripts]}
    else:
        found_script = matching_scripts[0]
        
        # Get parameter definitions from the state (or fetch if not present)
        param_defs_from_state = state.get('script_parameters_definitions', [])
        if not param_defs_from_state:
            # Fallback: if not in state, fetch them now
            param_defs_result = get_script_parameters_from_server(
                script_path=found_script['absolutePath'],
                script_type=found_script['type'],
                user_token=user_token
            )
            param_defs_from_state = param_defs_result.get('parameters', [])

        # Create a map of parameter definitions for easy lookup
        param_defs_map = {p['name']: p for p in param_defs_from_state}

        # Build the final parameters_list, merging overrides and performing type conversion
        parameters_list = []
        for param_def in param_defs_from_state:
            param_name = param_def['name']
            param_type = param_def['type']
            
            # Start with the value from the UI (which is now in param_def)
            current_value = param_def.get('value')

            # Apply override from LLM if present
            if param_name in parameters_dict:
                current_value = parameters_dict[param_name]

            # Perform type conversion on the final value
            processed_value = current_value
            try:
                if param_type == 'number':
                    processed_value = float(current_value)
                elif param_type == 'boolean':
                    processed_value = str(current_value).lower() in ['true', '1', 'yes']
            except (ValueError, TypeError):
                # If conversion fails, keep original value and let the engine handle it
                processed_value = current_value 
            
            # Append the full ScriptParameter object with the updated value
            parameters_list.append({
                "name": param_name,
                "type": param_type,
                "value": processed_value,
                "defaultValueJson": param_def['defaultValueJson'],
                "description": param_def['description'],
                "options": param_def['options']
            })

        result_json = run_script_from_server(
            script_path=found_script['absolutePath'],
            script_type=found_script['type'],
            parameters=parameters_list, # Send the complete, correctly formatted and typed list
            user_token=user_token
        )
    
    return {"messages": [ToolMessage(content=json.dumps(result_json), tool_call_id=tool_call['id'])]}

# --- 4. Wire up the Graph ---

def get_ui_parameters_node(state: AgentState) -> dict:
    """A dummy node to create an interruption point for fetching UI parameters."""
    return {}

graph_builder = StateGraph(AgentState)

graph_builder.add_node("agent", agent_node)

graph_builder.add_node("tools", tool_node)

graph_builder.add_node("human_in_the_loop", human_in_the_loop_node)

graph_builder.add_node("get_ui_parameters", get_ui_parameters_node)


graph_builder.set_entry_point("agent")

def should_continue(state: AgentState):
    """Determines the next step for the agent."""
    last_message = state['messages'][-1]
    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        tool_name = last_message.tool_calls[0]['name']
        if tool_name == 'run_script_by_name':
            return "human_in_the_loop"
        if tool_name == 'get_ui_parameters_tool':
            return "get_ui_parameters"
        return "tools"
    return END

graph_builder.add_conditional_edges(
    "agent",
    should_continue,
    {
        "human_in_the_loop": "human_in_the_loop",
        "get_ui_parameters": "get_ui_parameters",
        "tools": "tools",
        END: END,
    }
)

graph_builder.add_edge("tools", "agent")

graph_builder.add_edge("human_in_the_loop", "agent")

graph_builder.add_edge("get_ui_parameters", "agent")

# --- 5. Compile the Graph ---

memory = MemorySaver()

app = graph_builder.compile(
    checkpointer=memory,
    interrupt_before=["human_in_the_loop", "get_ui_parameters"]
)