from langchain_core.messages import AIMessage, HumanMessage
from .working_set_utils import process_working_set_output

def summary_node(state: dict) -> dict:
    """
    Handles post-execution logic. It processes working set updates, generates a
    summary message, and clears only the transient state related to the just-finished run.
    """
    # 1. Get the current working set. If it's not there, default to an empty list.
    preserved_working_set = state.get("working_set") or []

    # 2. Try to process for an update from the new internal_data channel first
    raw_output = state.get("raw_output_for_summary") or {}
    string_to_parse = raw_output.get("internal_data") or raw_output.get("output", "")
    
    # This utility function will parse the string and apply the operation
    ws_results = process_working_set_output(string_to_parse, preserved_working_set)
    
    # The result from the utility is either the new working set or None
    new_working_set_from_script = ws_results[0]
    
    # 3. Determine the final state of the working set
    # If the script provided an update (even an empty list), use it.
    # Otherwise, preserve the set from before this run.
    final_working_set = new_working_set_from_script if new_working_set_from_script is not None else preserved_working_set
        
    # 4. Generate the user-facing summary message
    final_message = "Action completed successfully. See the Console tab for details."
    summary_data = state.get("execution_summary")
    if summary_data:
        summary_type = summary_data.get('type')
        if summary_type == 'table':
            row_count = summary_data.get('row_count', 0)
            final_message = f"A table with {row_count} row{'s' if row_count != 1 else ''} was generated. See the Table tab for full output."
        elif summary_type == 'console':
            line_count = summary_data.get('line_count', 0)
            final_message = f"{line_count} line{'s' if line_count != 1 else ''} were printed. See the Console tab for full output."
        elif summary_type == 'default':
            message = summary_data.get('message', 'Code executed')
            final_message = f"{message}. See the Console tab for full details."
    
    # 5. Prepare the response and clear transient state from the completed run.
    # After summarizing, the agent should finish this turn and be ready for a new query.
    # We preserve the `working_set` (ids of created/modified elements) but clear
    # script-selection and parameter-related fields so the next user query starts fresh.
    # Preserve only conversational messages (HumanMessage and AIMessage) so
    # the user/agent conversation history is retained, but remove any ToolMessage
    # or other transient messages that represent actions.
    existing_messages = state.get("messages", [])
    preserved_conversation = [m for m in existing_messages if isinstance(m, (HumanMessage, AIMessage))]
    # Append the summary message as the latest agent response
    preserved_conversation.append(AIMessage(content=final_message))

    return {
        "messages": preserved_conversation,
        "working_set": final_working_set,
        # Signal no next conversational action so the graph will terminate this turn.
        "next_conversational_action": None,
        # Clear transient execution and selection-related state
        "execution_summary": None,
        "raw_output_for_summary": None,
        "selected_script_metadata": None,
        "script_parameters_definitions": None,
        "final_parameters_for_execution": None,
        "script_selected_for_params": False,
        "user_provided_param_modifications": None,
        # Also clear any script discovery buffers so the next user intent starts fresh
        "identified_scripts_for_choice": None,
        "recommended_script_name": None,
        "current_task_description": None,
    }