from langchain_core.messages import HumanMessage

def start_node(state: dict) -> dict:
    """
    This is the entry point of the graph. It checks if this is the start of a new,
    user-initiated query and, if so, clears any leftover state from previous runs.
    This ensures each user query is handled independently.
    """
    # Get the most recent message. The graph's `ainvoke` call is structured
    # to always pass the new user input as a single message in the "messages" list.
    last_message = state["messages"][-1]

    # A new user-initiated query will always be a HumanMessage.
    # We also check that it's not an internal system message.
    is_new_user_query = (
        isinstance(last_message, HumanMessage) and
        last_message.content != "System: Script execution was successful."
    )

    if is_new_user_query:
        # This is a fresh start. Clear all transient, task-specific state
        # to prevent contamination from previous, completed tasks.
        return {
            "identified_scripts_for_choice": None,
            "selected_script_metadata": None,
            "script_selected_for_params": None,
            "user_provided_param_modifications": None,
            "script_parameters_definitions": None,
            "final_parameters_for_execution": None,
            "execution_summary": None,
            "raw_output_for_summary": None,
            "next_conversational_action": None,
            "current_task_description": last_message.content, # Capture new task description
        }
    
    # If it's not a new user query, it's an internal step (e.g., after a tool call
    # or a summary), so we let the state pass through as-is.
    return {}
