from langchain_core.messages import HumanMessage
from .working_set_utils import validate_working_set

def start_node(state: dict) -> dict:
    """
    This is the entry point of the graph. It performs two key functions:
    1. MANDATORY: Synchronizes and validates the agent's working_set state with Revit.
    2. Checks if this is the start of a new, unrelated user query and, if so,
       clears other task-specific state.
    """
    # 1. Always validate the working set at the beginning of a turn.
    current_working_set = state.get('working_set', {})
    validated_working_set = validate_working_set(current_working_set)
    
    state_update = {
        "working_set": validated_working_set
    }

    # 2. Check if this is a new, unrelated query to clear other state.
    last_message = state["messages"][-1]
    is_continuing_parameter_confirmation = state.get("next_conversational_action") == "confirm_execution"
    
    is_new_unrelated_query = (
        isinstance(last_message, HumanMessage) and
        last_message.content != "System: Script execution was successful." and
        not is_continuing_parameter_confirmation
    )

    if is_new_unrelated_query:
        # This is a fresh start. Clear state related to a previous script execution flow.
        state_update.update({
            "identified_scripts_for_choice": None,
            "selected_script_metadata": None,
            "script_selected_for_params": None,
            "user_provided_param_modifications": None,
            "final_parameters_for_execution": None,
            "execution_summary": None,
            "raw_output_for_summary": None,
            "current_task_description": last_message.content,
        })

    return state_update

