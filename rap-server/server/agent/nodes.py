import json
import os
import traceback
import requests
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
    """This node executes tools by orchestrating calls to API helpers, prioritizing plan execution."""
    current_plan = state.get('plan', [])
    tool_calls_to_execute = []
    is_plan_step = False

    if current_plan:
        # Execute the next step from the plan
        next_step = current_plan.pop(0) # Get and remove the first step
        tool_calls_to_execute.append({
            'name': next_step['tool_name'],
            'args': next_step['args'],
            'id': f"plan_step_{len(state.get('messages', []))}_{next_step['tool_name']}" # Generate a unique ID
        })
        is_plan_step = True
        # Update the plan in the state
        state['plan'] = current_plan
        print(f"Executing plan step: {next_step['tool_name']} with args {next_step['args']}")
    else:
        # Fallback to normal tool execution from the last AIMessage
        last_message = state['messages'][-1]
        if isinstance(last_message, AIMessage) and last_message.tool_calls:
            tool_calls_to_execute = last_message.tool_calls
        else:
            return {} # No tool calls to execute

    results = []
    selected_script_info_to_update = None
    for tool_call in tool_calls_to_execute:
        tool_name = tool_call['name']
        tool_args = tool_call['args']
        tool_call_id = tool_call.get('id', 'unknown_id') # Get tool_call_id
        result_json = {"error": "Unknown tool or processing error.", "is_success": False}
        workspace_path = state.get('workspace_path')
        user_token = state.get('user_token')

        if not workspace_path or not user_token:
            result_json = {"error": "Workspace path or user token not set in agent's state.", "is_success": False}
            results.append(ToolMessage(content=json.dumps(result_json), tool_call_id=tool_call_id))
            continue

        if tool_name == 'run_script_by_name':
            # If it's a plan step, we don't need HITL approval for run_script_by_name
            # The plan itself implies approval.
            if is_plan_step:
                script_name = tool_args.get('script_name', '')
                parameters_dict = tool_args.get('parameters', {})
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
                results.append(ToolMessage(content=json.dumps(result_json), tool_call_id=tool_call_id))
            else:
                # If not a plan step, still require HITL approval for run_script_by_name
                results.append(AIMessage(content="", tool_calls=[tool_call]))
            continue
        elif tool_name == 'get_ui_parameters_tool':
            results.append(AIMessage(content="", tool_calls=[tool_call]))
            continue
        elif tool_name == 'get_script_parameters_tool':
            script_name = tool_args.get('script_name', '')
            agent_scripts_path = state.get('agent_scripts_path')
            if not agent_scripts_path:
                result_json = {"error": "Agent scripts path not set.", "is_success": False}
            else:
                manifest_path = os.path.join(agent_scripts_path, 'scripts_manifest.json')
                if not os.path.exists(manifest_path):
                    result_json = {"error": f"Manifest file not found at {manifest_path}.", "is_success": False}
                else:
                    with open(manifest_path, 'r') as f:
                        all_scripts = json.load(f)
                    
                    matching_scripts = [s for s in all_scripts if os.path.splitext(os.path.basename(s['filePath']))[0].lower() == os.path.splitext(script_name)[0].lower()]

                    if len(matching_scripts) == 0:
                        result_json = {"error": f"Script '{script_name}' not found in the manifest.", "is_success": False}
                    elif len(matching_scripts) > 1:
                        result_json = {"error": "multiple_scripts_found", "scripts": [os.path.basename(s['filePath']) for s in matching_scripts]}
                    else:
                        found_script = matching_scripts[0]
                        absolute_path = os.path.join(agent_scripts_path, found_script['filePath'])
                        selected_script_info_to_update = {
                            'absolutePath': absolute_path,
                            'type': found_script['metadata'].get('DocumentType', 'Project') # Assuming default type
                        }
                        result_json = get_script_parameters_from_server(
                            script_path=absolute_path,
                            script_type=found_script['metadata'].get('DocumentType', 'Project'),
                            user_token=user_token
                        )
                        if 'parameters' in result_json:
                            state['script_parameters_definitions'] = result_json['parameters']
        elif tool_name == 'list_available_scripts':
            agent_scripts_path = state.get('agent_scripts_path')
            if not agent_scripts_path:
                result_json = {"error": "Agent scripts path not set. Please configure it in the settings.", "is_success": False}
            else:
                try:
                    response = requests.post(
                        "http://localhost:8000/agent/script_manifest",
                        json={"agent_scripts_path": agent_scripts_path}
                    )
                    response.raise_for_status()  # Raise an exception for bad status codes
                    manifest_data = response.json()
                    # The manifest data is already in the correct format. 
                    # We can add a summary for the LLM to make it more readable.
                    script_count = len(manifest_data.get('scripts', []))
                    summary = f"Found {script_count} scripts. "
                    result_json = {"summary": summary, "manifest": manifest_data}

                except requests.exceptions.RequestException as e:
                    result_json = {"error": f"Failed to fetch script manifest from server: {str(e)}", "is_success": False}

        results.append(ToolMessage(content=json.dumps(result_json), tool_call_id=tool_call_id))

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

    agent_scripts_path = state.get('agent_scripts_path')
    user_token = state.get('user_token')
    script_name = tool_call['args'].get('script_name', '')
    parameters_dict = tool_call['args'].get('parameters', {})

    if not agent_scripts_path:
        result_json = {"error": "Agent scripts path not set.", "is_success": False}
    else:
        manifest_path = os.path.join(agent_scripts_path, 'scripts_manifest.json')
        if not os.path.exists(manifest_path):
            result_json = {"error": f"Manifest file not found at {manifest_path}.", "is_success": False}
        else:
            with open(manifest_path, 'r') as f:
                all_scripts = json.load(f)
            
            matching_scripts = [s for s in all_scripts if os.path.splitext(os.path.basename(s['filePath']))[0].lower() == os.path.splitext(script_name)[0].lower()]

            if len(matching_scripts) == 0:
                result_json = {"error": f"Script '{script_name}' not found in the manifest.", "is_success": False}
            elif len(matching_scripts) > 1:
                result_json = {"error": "multiple_scripts_found", "scripts": [os.path.basename(s['filePath']) for s in matching_scripts]}
            else:
                found_script = matching_scripts[0]
                absolute_path = os.path.join(agent_scripts_path, found_script['filePath'])
                script_type = found_script['metadata'].get('DocumentType', 'Project')

                param_defs_from_state = state.get('script_parameters_definitions', [])
                if not param_defs_from_state:
                    param_defs_result = get_script_parameters_from_server(
                        script_path=absolute_path,
                        script_type=script_type,
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
                    script_path=absolute_path,
                    script_type=script_type,
                    parameters=parameters_list,
                    user_token=user_token
                )    
    return {"messages": [ToolMessage(content=json.dumps(result_json), tool_call_id=tool_call['id'])]}

def get_ui_parameters_node(state: AgentState) -> dict:
    """A dummy node to create an interruption point for fetching UI parameters.""" 
    return {}