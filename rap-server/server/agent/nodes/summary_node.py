from langchain_core.messages import AIMessage, HumanMessage, ToolMessage, RemoveMessage
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
        
    # 4. Check for Script Chaining (Multi-step Automation)
    script_queue = state.get("script_execution_queue") or []
    
    if script_queue:
        # If there are more scripts to run, we don't summarize yet.
        # We set up the next script and continue the conversation flow.
        next_script = script_queue[0]
        remaining_queue = script_queue[1:]
        
        # We might want to add a small system message to indicate progress
        progress_message = AIMessage(content=f"Step completed. Proceeding to the next step: {next_script.get('name')}...")
        
        existing_messages = state.get("messages", [])
        preserved_conversation = [m for m in existing_messages if isinstance(m, (HumanMessage, AIMessage))]
        preserved_conversation.append(progress_message)

        return {
            "messages": preserved_conversation,
            "working_set": final_working_set,
            "script_execution_queue": remaining_queue,
            "selected_script_metadata": next_script,
            "script_selected_for_params": True,
            "next_conversational_action": "present_parameters",
            # Clear execution results of the previous step
            "execution_summary": None,
            "raw_output_for_summary": None,
            # Clear parameter definitions so they are re-fetched for the new script
            "script_parameters_definitions": None,
            "final_parameters_for_execution": None,
            "user_provided_param_modifications": None,
            "ui_parameters": None, # Clear UI parameters
        }

    # 5. Generate the user-facing summary message (Final Step)
    final_message = "Action completed successfully. See the Console tab for details."
    summary_data = state.get("execution_summary")
    if summary_data:
        summary_type = summary_data.get('type')
        if summary_type == 'table':
            row_count = summary_data.get('row_count', 0)
            headers = summary_data.get('headers', [])
            preview = summary_data.get('preview', [])
            
            final_message = f"A table with {row_count} row{'s' if row_count != 1 else ''} was generated."
            if headers:
                final_message += f" Columns: {', '.join(headers)}."
            if preview:
                # Convert preview rows to string and truncate if too long
                preview_str = str(preview)
                if len(preview_str) > 200:
                    preview_str = preview_str[:200] + "..."
                final_message += f" Preview: {preview_str}"
            final_message += " See the Table tab for full output."

        elif summary_type == 'console':
            summary_text = summary_data.get('summary_text')
            if summary_text:
                final_message = summary_text
            else:
                line_count = summary_data.get('line_count', 0)
                preview = summary_data.get('preview', [])
                final_message = f"{line_count} line{'s' if line_count != 1 else ''} were printed."
                if preview:
                    final_message += f" Output: {'; '.join(preview)}..."
                final_message += " See the Console tab for full output."
        elif summary_type == 'default':
            message = summary_data.get('message', 'Code executed')
            final_message = f"{message}. See the Console tab for full details."
    
    # 6. Prepare the response and clear transient state from the completed run.
    # We clean the history to remove the technical steps of execution (the tool call, the system signal)
    # so the conversation remains natural and valid for the LLM.
    existing_messages = state.get("messages", [])
    messages_to_return = []
    
    # We only want to remove the messages related to the *current* execution.
    # These are typically at the end of the history.
    # We will iterate backwards and remove the specific sequence:
    # 1. The "System: Script execution was successful." message.
    # 2. The ToolMessage(s) that came before it.
    # 3. The AIMessage with tool_calls that triggered it.
    
    # We stop removing once we hit a normal message or go back too far.
    
    messages_to_check = list(reversed(existing_messages))
    
    print("--- DEBUG: SUMMARY NODE CLEANUP ---")
    for m in messages_to_check:
        should_remove = False
        
        # 1. The System signal
        if isinstance(m, HumanMessage) and m.content == "System: Script execution was successful.":
            should_remove = True
            
        # 2. ToolMessages (likely the execution signal result)
        elif isinstance(m, ToolMessage):
            should_remove = True
            
        # 3. AIMessage with tool calls (likely the execution request)
        elif isinstance(m, AIMessage) and m.tool_calls:
            should_remove = True
            
        if should_remove:
            if m.id:
                print(f"Removing message: {type(m).__name__} (ID: {m.id})")
                messages_to_return.append(RemoveMessage(id=m.id))
            else:
                print(f"WARNING: Wanted to remove {type(m).__name__} but it has NO ID!")
        else:
            # Once we hit a message that doesn't fit the "execution sequence" pattern (e.g. the user's original command),
            # we stop cleaning to preserve history.
            break
    print("-----------------------------------")
        
    # Append the summary message as the latest agent response
    if not final_message or not final_message.strip():
        final_message = "Action completed successfully."
        
    messages_to_return.append(AIMessage(content=final_message))

    return {
        "messages": messages_to_return,
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
        "script_execution_queue": None, # Ensure queue is cleared
        "ui_parameters": None, # Clear UI parameters
    }