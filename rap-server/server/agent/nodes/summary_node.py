from langchain_core.messages import AIMessage

def summary_node(state: dict) -> dict:
    """
    Handles the post-execution summary logic by formatting the final user-facing
    message based on the pre-processed summary data.
    """
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

    # Return state to end the conversation and clear transient state
    return {
        "messages": messages,
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

