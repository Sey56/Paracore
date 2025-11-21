from langchain_core.messages import HumanMessage

def start_node(state: dict) -> dict:
    """
    This is the entry point of the graph. It checks if this is the start of a new,
    unrelated user query and, if so, clears task-specific state.
    """
    last_message = state["messages"][-1]

    # A new query is a HumanMessage that is NOT part of an ongoing parameter confirmation.
    # The 'confirm_execution' action is set when the agent is waiting for parameter feedback.
    is_continuing_parameter_confirmation = state.get("next_conversational_action") == "confirm_execution"
    
    is_new_unrelated_query = (
        isinstance(last_message, HumanMessage) and
        last_message.content != "System: Script execution was successful." and
        not is_continuing_parameter_confirmation
    )

    if is_new_unrelated_query:
        # This is a fresh start on a new topic. Clear state related to script selection
        # and execution, but preserve parameter definitions and UI values if we are in that loop.
        return {
            "identified_scripts_for_choice": None,
            "selected_script_metadata": None,
            "script_selected_for_params": None,
            "user_provided_param_modifications": None,
            "final_parameters_for_execution": None,
            "execution_summary": None,
            "raw_output_for_summary": None,
            "current_task_description": last_message.content,
        }
    
    # If it's not a new unrelated query (i.e., a system message or a parameter confirmation response),
    # let the state pass through as-is for the next node to handle.
    return {}
