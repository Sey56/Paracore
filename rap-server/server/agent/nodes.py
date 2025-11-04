import json
import os
import traceback
from langchain_core.messages import AIMessage, ToolMessage
from .state import AgentState
from .api_helpers import list_scripts_in_workspace, get_script_parameters_from_server, run_script_from_server
from .llm import _get_llm
from .tools import tools
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from .system_prompt import SYSTEM_PROMPT

prompt = ChatPromptTemplate.from_messages(
    [
        ("system", SYSTEM_PROMPT),
        MessagesPlaceholder(variable_name="messages"),
    ]
)

def agent_node(state: AgentState) -> AgentState:
    """Invokes the LLM to get the next action, with a robust fail-safe."""
    try:
        patched_messages = []
        for msg in state["messages"]:
            if isinstance(msg, ToolMessage) and msg.name == 'get_ui_parameters_tool':
                try:
                    ui_parameters = json.loads(msg.content)
                    state['script_parameters_definitions'] = ui_parameters
                    continue
                except json.JSONDecodeError:
                    print(f"Warning: Could not decode JSON from get_ui_parameters_tool result: {msg.content}")
            
            if isinstance(msg, AIMessage) and msg.tool_calls and not msg.content:
                patched_messages.append(AIMessage(content=".", tool_calls=msg.tool_calls, id=msg.id))
            else:
                patched_messages.append(msg)

        print(f"agent_node: Messages being sent to LLM: {patched_messages}")
        llm = _get_llm(state)
        llm_with_tools = llm.bind_tools(tools)
        chain = prompt | llm_with_tools
        response = chain.invoke({"messages": patched_messages})
        
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
            state['selected_script_info'] = None

        if isinstance(response, AIMessage) and response.content:
            processed_content = response.content
            processed_content = processed_content.replace("* ", "\n* ")
            processed_content = processed_content.replace("- ", "\n- ")
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
        param_defs_from_state = state.get('script_parameters_definitions', [])
        if not param_defs_from_state:
            param_defs_result = get_script_parameters_from_server(
                script_path=found_script['absolutePath'],
                script_type=found_script['type'],
                user_token=user_token
            )
            param_defs_from_state = param_defs_result.get('parameters', [])

        parameters_list = []
        for param_def in param_defs_from_state:
            param_name = param_def['name']
            param_type = param_def['type']
            current_value = param_def.get('value')

            if param_name in parameters_dict:
                current_value = parameters_dict[param_name]

            processed_value = current_value
            try:
                if param_type == 'number':
                    processed_value = float(current_value)
                elif param_type == 'boolean':
                    processed_value = str(current_value).lower() in ['true', '1', 'yes']
            except (ValueError, TypeError):
                processed_value = current_value 
            
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
            parameters=parameters_list,
            user_token=user_token
        )
    
    return {"messages": [ToolMessage(content=json.dumps(result_json), tool_call_id=tool_call['id'])]}

def get_ui_parameters_node(state: AgentState) -> dict:
    """A dummy node to create an interruption point for fetching UI parameters."""
    return {}
