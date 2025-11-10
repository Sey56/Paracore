import json
from langchain_core.messages import ToolMessage
from ..state import AgentState
from ..api_helpers import handle_run_script_by_name

async def run_script_node(state: AgentState) -> dict:
    """
    Executes the 'run_script_by_name' tool.
    This node triggers the execution of the selected script with the final parameters.
    """
    print("--- run_script_node called ---")
    results = []
    last_message = state["messages"][-1]

    selected_script_metadata = state.get('selected_script_metadata')
    final_parameters_for_execution = state.get('final_parameters_for_execution')

    if not selected_script_metadata or not final_parameters_for_execution:
        error_msg = "Missing script metadata or final parameters for execution."
        results.append(ToolMessage(content=json.dumps({"error": error_msg, "is_success": False}), tool_call_id="run_script_error"))
        state['next_conversational_action'] = "handle_error"
        return {"messages": results, "next_conversational_action": state['next_conversational_action']}

    for tool_call in last_message.tool_calls:
        script_name = selected_script_metadata.get("name")
        
        print(f"--- run_script_node executing script: {script_name} with parameters: {final_parameters_for_execution} ---")
        
        # The handle_run_script_by_name expects tool_args with script_name and parameters
        tool_args = {
            "script_name": script_name,
            "parameters": final_parameters_for_execution
        }
        result_content = await handle_run_script_by_name(state, tool_args)
        results.append(ToolMessage(content=json.dumps(result_content), tool_call_id=tool_call["id"]))

        if result_content.get("execution_result", {}).get("is_success"):
            state['execution_result'] = result_content.get("execution_result")
            state['next_conversational_action'] = "summarize_result"
        else:
            state['execution_result'] = result_content.get("execution_result")
            state['next_conversational_action'] = "handle_error"
            
    # Clear execution-related state after processing
    state['selected_script_metadata'] = None
    state['script_parameters_definitions'] = None
    state['user_provided_param_modifications'] = None
    state['final_parameters_for_execution'] = None
    state['current_task_description'] = None # Clear the task description as it's completed

    return {"messages": results, "execution_result": state['execution_result'], "next_conversational_action": state['next_conversational_action']}
