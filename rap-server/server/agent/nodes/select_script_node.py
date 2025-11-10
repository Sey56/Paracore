from langchain_core.messages import ToolMessage
from ..state import AgentState

def select_script_node(state: AgentState):
    """Selects a script based on user confirmation and updates the state with its metadata."""
    print("select_script_node: Entry")
    last_message = state['messages'][-1]
    script_name_to_select = None

    if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
        tool_call = last_message.tool_calls[0]
        if tool_call['name'] == 'select_script_tool':
            script_name_to_select = tool_call['args'].get('script_name')

    if not script_name_to_select:
        error_message = "No script name provided for selection."
        print(f"select_script_node: Error - {error_message}")
        return {
            "messages": [ToolMessage(content=error_message, tool_call_id=last_message.tool_calls[0]['id'])],
            "next_conversational_action": "handle_error"
        }

    identified_scripts = state.get("identified_scripts_for_choice", [])
    selected_script = next((s for s in identified_scripts if s.get("name") == script_name_to_select), None)

    if selected_script:
        print(f"select_script_node: Script '{script_name_to_select}' selected successfully.")
        return {
            "selected_script_metadata": selected_script,
            "script_selected_for_params": script_name_to_select,
            "next_conversational_action": "present_parameters",
            "messages": [ToolMessage(content=f"Script '{script_name_to_select}' selected successfully.", tool_call_id=last_message.tool_calls[0]['id'])]
        }
    else:
        error_message = f"Script '{script_name_to_select}' not found in the list of identified scripts."
        print(f"select_script_node: Error - {error_message}")
        return {
            "messages": [ToolMessage(content=error_message, tool_call_id=last_message.tool_calls[0]['id'])],
            "next_conversational_action": "handle_error"
        }
