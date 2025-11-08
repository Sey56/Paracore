import json
import os
import traceback
import requests
from langchain_core.messages import AIMessage, ToolMessage, HumanMessage
from .state import AgentState
from .api_helpers import list_scripts_in_workspace, get_script_parameters_from_server, run_script_from_server
from .llm import _get_llm
from .tools import tools
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from .system_prompt import SYSTEM_PROMPT
from langgraph.graph import END, StateGraph

prompt = ChatPromptTemplate.from_messages(
    [
        ("system", SYSTEM_PROMPT),
        MessagesPlaceholder(variable_name="messages"),
    ]
)

def agent_node(state: AgentState) -> AgentState:
    """Invokes the LLM to get the next action, with a robust fail-safe."""
    try:
        # Patch message history to prevent the "invalid parts" error and process get_ui_parameters_tool results
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
                # This seems like a Langchain bug workaround
                patched_messages.append(AIMessage(content=".", tool_calls=msg.tool_calls, id=msg.id))
            else:
                patched_messages.append(msg)

        print(f"agent_node: Messages being sent to LLM: {patched_messages}")
        llm = _get_llm(state)
        llm_with_tools = llm.bind_tools(tools)
        chain = prompt | llm_with_tools
        response = chain.invoke({"messages": patched_messages})
        
        print(f"agent_node: state['selected_script_info'] before processing: {state.get('selected_script_info')}")
        print(f"agent_node: LLM response before additional_kwargs: {response}")

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
        
        print(f"agent_node: LLM response after additional_kwargs: {response}")

        if isinstance(response, AIMessage) and response.content and isinstance(response.content, str):
            processed_content = response.content
            processed_content = processed_content.replace("* ", "\n* ")
            processed_content = processed_content.replace("- ", "\n- ")
            response.content = processed_content.strip()
        
        print(f"agent_node: Final response being returned: {response}")
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
        next_step = current_plan.pop(0)
        tool_calls_to_execute.append({
            'name': next_step['tool_name'],
            'args': next_step['args'],
            'id': f"plan_step_{len(state.get('messages', []))}_{next_step['tool_name']}"
        })
        is_plan_step = True
        state['plan'] = current_plan
        print(f"Executing plan step: {next_step['tool_name']} with args {next_step['args']}")
    else:
        last_message = state['messages'][-1]
        if isinstance(last_message, AIMessage) and last_message.tool_calls:
            tool_calls_to_execute = last_message.tool_calls
        else:
            return {}

    results = []
    selected_script_info_to_update = None 
    for tool_call in tool_calls_to_execute:
        tool_name = tool_call['name']
        tool_args = tool_call['args']
        tool_call_id = tool_call.get('id', 'unknown_id')
        result_json = {"error": "Unknown tool or processing error.", "is_success": False}
        agent_scripts_path = state.get('agent_scripts_path') 
        user_token = state.get('user_token')

        if not agent_scripts_path or not user_token:
            result_json = {"error": "Agent scripts path or user token not set in agent's state.", "is_success": False}
            results.append(ToolMessage(content=json.dumps(result_json), tool_call_id=tool_call_id))
            continue

        if tool_name == 'run_script_by_name':
            results.append(AIMessage(content="", tool_calls=[tool_call]))
            continue
        elif tool_name == 'get_ui_parameters_tool':
            results.append(AIMessage(content="", tool_calls=[tool_call]))
            continue
        elif tool_name == 'list_available_scripts':
            manifest_path = os.path.join(agent_scripts_path, 'cache', 'scripts_manifest.json')
            if not os.path.exists(manifest_path):
                result_json = {"error": f"Manifest file not found at {manifest_path}. Please generate it from the UI.", "is_success": False}
            else:
                with open(manifest_path, 'r', encoding='utf-8') as f:
                    manifest_data = json.load(f)
                state['manifest'] = manifest_data # Store manifest in state
                script_count = len(manifest_data)
                summary = f"Found {script_count} tools. "
                result_json = {"summary": summary, "manifest": manifest_data}
        
        elif tool_name == 'get_script_parameters_tool':
            script_name = tool_args.get('script_name')
            if not script_name:
                result_json = {"error": "Tool 'get_script_parameters_tool' requires a 'script_name' argument.", "is_success": False}
            else:
                # Retrieve manifest from state instead of re-reading file
                all_scripts = state.get('manifest', [])
                if not all_scripts:
                    # Fallback: if manifest not in state, read from file (should not happen if list_available_scripts was called)
                    manifest_path = os.path.join(agent_scripts_path, 'cache', 'scripts_manifest.json')
                    if os.path.exists(manifest_path):
                        with open(manifest_path, 'r') as f:
                            all_scripts = json.load(f)
                    else:
                        result_json = {"error": f"Manifest file not found at {manifest_path}.", "is_success": False}
                        results.append(ToolMessage(content=json.dumps(result_json), tool_call_id=tool_call_id))
                        continue
                    
                    matching_scripts = [s for s in all_scripts if s.get('name') and os.path.splitext(s['name'])[0].lower() == os.path.splitext(script_name)[0].lower()]

                    if len(matching_scripts) == 0:
                        result_json = {"error": f"Script '{script_name}' not found in the manifest.", "is_success": False}
                    elif len(matching_scripts) > 1:
                        result_json = {"error": "multiple_scripts_found", "scripts": [s['name'] for s in matching_scripts]}
                    else:
                        found_script = matching_scripts[0]
                        print(f"tool_node: Found script from manifest: {found_script}")
                        selected_script_info_to_update = {
                            'absolutePath': found_script['absolutePath'],
                            'type': found_script['type']
                        }
                        state['selected_script_info'] = selected_script_info_to_update 
                        print(f"tool_node: selected_script_info_to_update: {selected_script_info_to_update}")
                        print(f"tool_node: state['selected_script_info'] set to: {state['selected_script_info']}")

                        result_json = get_script_parameters_from_server(
                            script_path=found_script['absolutePath'],
                            script_type=found_script['type'],
                            user_token=user_token
                        )
                        if 'parameters' in result_json:
                            state['script_parameters_definitions'] = result_json['parameters']
        results.append(ToolMessage(content=json.dumps(result_json), tool_call_id=tool_call_id))

    return_dict = {"messages": results}
    if selected_script_info_to_update:
        return_dict["selected_script_info"] = selected_script_info_to_update
    
    print(f"tool_node: return_dict being returned: {return_dict}")
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
    script_name = tool_call['args'].get('script_name')
    parameters_dict = tool_call['args'].get('parameters', {})

    if not script_name:
        result_json = {"error": "Tool 'run_script_by_name' requires a 'script_name' argument.", "is_success": False}
    elif not agent_scripts_path:
        result_json = {"error": "Agent scripts path not set.", "is_success": False}
    else:
        manifest_path = os.path.join(agent_scripts_path, 'cache', 'scripts_manifest.json')
        if not os.path.exists(manifest_path):
            result_json = {"error": f"Manifest file not found at {manifest_path}.", "is_success": False}
        else:
            with open(manifest_path, 'r') as f:
                all_scripts = json.load(f)
            
            matching_scripts = [s for s in all_scripts if s.get('name') and os.path.splitext(s['name'])[0].lower() == os.path.splitext(script_name)[0].lower()]

            if len(matching_scripts) == 0:
                result_json = {"error": f"Script '{script_name}' not found.", "is_success": False}
            elif len(matching_scripts) > 1:
                result_json = {"error": "multiple_scripts_found", "scripts": [s['name'] for s in matching_scripts]}
            else:
                found_script = matching_scripts[0]
                absolute_path = found_script['absolutePath']
                script_type = found_script['type']

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

# Define the graph
workflow = StateGraph(AgentState)

# Add nodes for agent and tools
workflow.add_node("agent", agent_node)
workflow.add_node("tools", tool_node)
workflow.add_node("human_in_the_loop", human_in_the_loop_node)
workflow.add_node("get_ui_parameters", get_ui_parameters_node)

# Set the entry point
workflow.set_entry_point("agent")

# Define the conditional edges
def should_continue(state: AgentState):
    """Determines the next step for the agent."""
    last_message = state['messages'][-1]

    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        tool_name = last_message.tool_calls[0]['name']
        if tool_name == 'run_script_by_name':
            return "human_in_the_loop"
        if tool_name == 'get_ui_parameters_tool':
            return "get_ui_parameters"
        # If the LLM calls any other tool, execute it
        return "tools"
    
    # If the last message is a ToolMessage, it means a tool just finished executing.
    # We need to decide what to do next based on which tool just finished.
    # Revert should_continue to c2fdeca's version
    if isinstance(last_message, ToolMessage):
        return "agent" # Always go back to agent after a tool executes in c2fdeca logic
    
    # If no tool calls or tool messages, it means the agent should continue reasoning
    # or it's the start of the conversation.
    return "agent"

workflow.add_conditional_edges(
    "agent",
    should_continue,
    {
        "human_in_the_loop": "human_in_the_loop",
        "get_ui_parameters": "get_ui_parameters",
        "tools": "tools",
        "agent": "agent", # Add agent as a possible transition
    }
)

workflow.add_edge("tools", "agent")
workflow.add_edge("human_in_the_loop", "agent") # Changed from END to agent
workflow.add_edge("get_ui_parameters", "agent")

graph = workflow.compile()
