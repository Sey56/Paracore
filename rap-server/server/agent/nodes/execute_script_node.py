from langchain_core.messages import ToolMessage
from ..state import AgentState
from ..api_helpers import run_script_from_server
import json

def execute_script_node(state: AgentState):
    """Executes the selected script with the final, synchronized parameters."""
    print("execute_script_node: Entry")
    selected_script_metadata = state.get("selected_script_metadata")
    final_parameters_for_execution = state.get("final_parameters_for_execution")
    user_token = state.get("user_token")

    # Get the tool_call_id from the last AIMessage
    last_ai_message = next((msg for msg in reversed(state['messages']) if hasattr(msg, 'tool_calls') and msg.tool_calls), None)
    tool_call_id = last_ai_message.tool_calls[0]['id'] if last_ai_message else "execute_script_error"

    if not selected_script_metadata or not final_parameters_for_execution or not user_token:
        error_message = "Missing script metadata, final parameters, or user token for execution."
        print(f"execute_script_node: Error - {error_message}")
        return {
            "messages": [ToolMessage(content=error_message, tool_call_id=tool_call_id)],
            "next_conversational_action": "handle_error"
        }

    script_name = selected_script_metadata.get("name")
    script_path = selected_script_metadata.get("absolutePath")

    if not script_name or not script_path:
        error_message = "Selected script metadata is incomplete (missing name or path)."
        print(f"execute_script_node: Error - {error_message}")
        return {
            "messages": [ToolMessage(content=error_message, tool_call_id=tool_call_id)],
            "next_conversational_action": "handle_error"
        }

    try:
        print(f"execute_script_node: Running script '{script_name}' from '{script_path}' with parameters: {final_parameters_for_execution}")
        
        # The run_script_from_server function is expected to handle the actual gRPC call
        execution_response_str = run_script_from_server(
            script_path=script_path,
            script_name=script_name,
            parameters=final_parameters_for_execution,
            user_token=user_token,
            is_final_approval=True # This node represents the final execution step
        )
        execution_result = json.loads(execution_response_str)

        if execution_result.get("is_success"):
            print(f"execute_script_node: Script '{script_name}' executed successfully.")
            return {
                "execution_result": execution_result,
                "next_conversational_action": "summarize_result",
                "selected_script_metadata": None, # Clear state after execution
                "final_parameters_for_execution": None, # Clear state after execution
                "current_task_description": None, # Clear task after completion
                "messages": [ToolMessage(content=json.dumps(execution_result), tool_call_id=tool_call_id)]
            }
        else:
            error_message = execution_result.get("error_message", f"Script '{script_name}' execution failed.")
            print(f"execute_script_node: Script execution failed - {error_message}")
            return {
                "execution_result": execution_result,
                "next_conversational_action": "handle_error",
                "messages": [ToolMessage(content=error_message, tool_call_id=tool_call_id)]
            }

    except Exception as e:
        error_message = f"Exception during script execution: {e}"
        print(f"execute_script_node: Error - {error_message}")
        return {
            "messages": [ToolMessage(content=error_message, tool_call_id=tool_call_id)],
            "next_conversational_action": "handle_error"
        }
