from langchain_core.messages import HumanMessage
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

    # 5. Perform Semantic Search
    elif state.get('identified_scripts_for_choice') and isinstance(state['identified_scripts_for_choice'], list):
        return handle_semantic_search(state, llm)
    
    # 6. Default: If no specific action, invoke the main chain for a new query
    else:
        # Prepare the working set context for the prompt
        working_set = state.get('working_set')
        working_set_context = ""
        if working_set:
            working_set_context = f"""
CONTEXT: You have access to a 'working set', which is a list of Revit Element IDs.
The current working set is: {working_set}.
When the user refers to 'it', 'them', or 'these', they are referring to the elements in this working set.
If the user asks for information directly available in this context (like the IDs themselves), you can answer directly.
IMPORTANT: If you need to pass these IDs to a script parameter, you MUST format them as a single, comma-separated string (e.g., "12345,67890").
"""

        llm_with_tools = llm.bind_tools(tools)
        chain = prompt | llm_with_tools
        response = chain.invoke({
            "messages": state["messages"],
            "agent_scripts_path": state.get("agent_scripts_path"),
            "current_task_description": state.get("current_task_description"),
            "working_set_context": working_set_context
        })
        return {"messages": [response]}