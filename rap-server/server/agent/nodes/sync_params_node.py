from langchain_core.messages import ToolMessage
from ..state import AgentState
import json

def sync_params_node(state: AgentState):
    """
    Synchronizes parameters from the UI and conversational modifications.
    """
    print("sync_params_node: Entry")
    user_modifications = state.get("user_provided_param_modifications", {})
    selected_script_metadata = state.get("selected_script_metadata")

    if not selected_script_metadata:
        error_message = "No script selected for parameter synchronization."
        print(f"sync_params_node: Error - {error_message}")
        return {
            "messages": [ToolMessage(content=error_message, tool_call_id="sync_params_no_script")],
            "next_conversational_action": "handle_error"
        }

    # Get current UI parameters from the last ToolMessage (from get_ui_parameters_tool)
    last_message = state['messages'][-1]
    ui_parameters = {}
    tool_call_id = "sync_params_error"
    if isinstance(last_message, ToolMessage) and last_message.name == "get_ui_parameters_tool":
        tool_call_id = last_message.tool_call_id
        try:
            # The content of the ToolMessage from the UI is a JSON string of the parameters
            ui_parameters = json.loads(last_message.content)
            print(f"sync_params_node: Received UI parameters: {ui_parameters}")
        except json.JSONDecodeError:
            print("sync_params_node: Could not decode UI parameters from ToolMessage content.")

    # Start with the script's default parameters
    final_params = {p['name']: p.get('defaultValueJson') for p in selected_script_metadata.get('parameters', [])}

    # Apply UI parameters (these are usually the most up-to-date from the frontend)
    for param in ui_parameters:
        final_params[param['name']] = param['value']

    # Apply user-provided modifications (these override both defaults and UI values)
    if user_modifications:
        for param_name, param_value in user_modifications.items():
            if param_name in final_params:
                final_params[param_name] = param_value
                print(f"sync_params_node: Applied user modification for {param_name}: {param_value}")
            else:
                print(f"sync_params_node: Warning - User tried to modify non-existent parameter: {param_name}")

    # Convert back to the list[dict] format expected by run_script_by_name
    final_parameters_list = [{'name': k, 'value': v} for k, v in final_params.items()]

    print(f"sync_params_node: Final parameters: {final_parameters_list}")
    return {
        "final_parameters_for_execution": final_parameters_list,
        "user_provided_param_modifications": None, # Clear after applying
        "next_conversational_action": "confirm_execution",
        "messages": [ToolMessage(content=json.dumps(final_parameters_list), tool_call_id=tool_call_id)]
    }
