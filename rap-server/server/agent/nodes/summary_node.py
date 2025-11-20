from langchain_core.messages import AIMessage
from .working_set_utils import process_working_set_output

def summary_node(state: dict) -> dict:
    """
    Handles post-execution logic. It processes potential working set updates from
    the script output and then generates a final summary message for the user.
    """
    raw_output = state.get("raw_output_for_summary") or {}
    
    # Prioritize the new clean channel, but fall back to the console output
    string_to_parse = raw_output.get("internal_data") or raw_output.get("output", "")

    current_working_set = state.get("working_set") or []
    
    # Use the utility to process the output string for working set updates
    ws_results = process_working_set_output(string_to_parse, current_working_set)
    new_working_set, _ = ws_results # Discard the message from the JSON

    # Always generate the default summary message based on execution_summary
    final_message = "Action completed successfully. See the Console tab for details." # Generic fallback
    summary_data = state.get("execution_summary")

    if summary_data:
        summary_type = summary_data.get('type')
        if summary_type == 'table':
            row_count = summary_data.get('row_count', 0)
            plural = 's' if row_count != 1 else ''
            final_message = f"A table with {row_count} row{plural} was generated. See the Table tab for full output."
        
        elif summary_type == 'console':
            line_count = summary_data.get('line_count', 0)
            plural = 's' if line_count != 1 else ''
            final_message = f"{line_count} line{plural} were printed. See the Console tab for full output."

        elif summary_type == 'default':
            message = summary_data.get('message', 'Code executed')
            final_message = f"{message}. See the Console tab for full details."
    
    messages = state.get("messages", []) + [AIMessage(content=final_message)]

    # If new_working_set is None, it means no valid ws_json was found, so we preserve the original set.
    # If it's a list (even empty), we use it as the new state.
    updated_ws = new_working_set if new_working_set is not None else current_working_set
    
    # Return state to end the conversation, clearing transient state but preserving the working set
    return {
        "messages": messages,
        "working_set": updated_ws,
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
        "current_task_description": None,
    }
