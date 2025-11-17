from langchain_core.messages import HumanMessage, AIMessage
from .summary_node import summary_node
from .parameter_node import handle_present_parameters, handle_parameter_modification
from .selection_node import handle_script_selection
from .search_node import handle_semantic_search
from ..prompt import prompt
from .utils import get_llm
from ..tools import tools

def agent_node(state: dict):
    """
    The main agent node router.
    It inspects the state and calls the appropriate handler function.
    """
    print(f"agent_node: Current state: {state}") # ADDED LOG
    llm = get_llm(state)
    
    current_human_message = None
    for msg in reversed(state["messages"]):
        if isinstance(msg, HumanMessage):
            current_human_message = msg
            break

    previous_conversational_action = state.get("next_conversational_action")

    # --- Route to the correct handler based on state ---

    # 1. Handle Post-Execution Summary
    if current_human_message and current_human_message.content == "System: Script execution was successful.":
        return summary_node(state)

    # 2. Handle presenting parameters after they've been fetched
    elif previous_conversational_action == "present_parameters" and state.get('script_parameters_definitions') is not None:
        return handle_present_parameters(state)

    # 3. Handle Parameter Modification from User Chat
    elif previous_conversational_action == "confirm_execution" and current_human_message:
        return handle_parameter_modification(state, llm)

    # 4. Handle User's Script Selection
    elif previous_conversational_action == "ask_for_script_confirmation" and current_human_message:
        return handle_script_selection(state, llm)

    # 5. Perform Semantic Search (if manifest is injected)
    if state.get('identified_scripts_for_choice') and isinstance(state['identified_scripts_for_choice'], list):
        print(f"agent_node: identified_scripts_for_choice is present and is a list. Length: {len(state['identified_scripts_for_choice'])}") # ADDED LOG
        return handle_semantic_search(state, llm)
    
    # 6. Default: If manifest is not injected, return an error.
    else:
        print(f"agent_node: identified_scripts_for_choice is NOT present or not a list. Value: {state.get('identified_scripts_for_choice')}, Type: {type(state.get('identified_scripts_for_choice'))}") # ADDED LOG
        return {"messages": [AIMessage(content="I don't have a list of scripts to choose from. Please check the application configuration and ensure the script manifest is being provided.")]}