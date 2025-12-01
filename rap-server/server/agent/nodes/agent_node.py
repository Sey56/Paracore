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
    
    # Verify tools

    llm = get_llm(state)
    
    current_human_message = None
    for msg in reversed(state["messages"]):
        if isinstance(msg, HumanMessage):
            current_human_message = msg
            break

    # --- 0. Global Cancellation Check ---
    if current_human_message:
        content_lower = current_human_message.content.lower().strip()
        cancellation_keywords = ["cancel", "stop", "exit", "abort"]
        if content_lower in cancellation_keywords:
            from langchain_core.messages import AIMessage
            return {
                "messages": [AIMessage(content="Action cancelled. I've cleared the current task state. What would you like to do next?")],
                # Clear ALL script-related state
                "selected_script_metadata": None,
                "script_parameters_definitions": None,
                "script_selected_for_params": False,
                "user_provided_param_modifications": None,
                "ui_parameters": None,
                "final_parameters_for_execution": None,
                "identified_scripts_for_choice": None,
                "next_conversational_action": None,
                "parameter_set_options": None,
                "selected_parameter_set_value": None,
                "current_task_description": None,
                "script_execution_queue": None,
                # PRESERVE working_set
            }

    previous_conversational_action = state.get("next_conversational_action")

    # --- Route to the correct handler based on state ---

    # 1. Handle Post-Execution Summary
    if current_human_message and current_human_message.content == "System: Script execution was successful.":
        return summary_node(state)

    # 2. Handle presenting parameters after they've been fetched
    # Only present parameters if a script was actually selected for parameter input.
    elif previous_conversational_action == "present_parameters" and state.get('script_parameters_definitions') is not None and state.get('script_selected_for_params'):
        return handle_present_parameters(state)

    # 3. Handle Parameter Modification from User Chat
    # Only allow parameter modification when the agent explicitly selected a script
    # for parameter entry (e.g., user just confirmed a script and the UI/agent is
    # expecting parameter edits). This prevents stray user messages from re-entering
    # the parameter flow after an execution has completed.
    elif previous_conversational_action == "confirm_execution" and current_human_message and state.get('script_selected_for_params'):
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
CONTEXT UPDATE: You have access to a 'working set', which is a list of Revit Element IDs.
The current working set is: {working_set}.
When the user refers to 'it', 'them', or 'these', they are referring to the elements in this working set.
If the user asks for information directly available in this context (like the IDs themselves), you can answer directly.
CRITICAL: Always use the 'current working set' provided above as the source of truth. Ignore any previous counts or lists mentioned in the conversation history, as the working set may have changed (e.g. elements deleted in Revit).
IMPORTANT: If you need to pass these IDs to a script parameter, you MUST format them as a single, comma-separated string (e.g., "12345,67890").
"""
        
        try:
            llm_with_tools = llm.bind_tools(tools)
            chain = prompt | llm_with_tools
            
            # Inject the working set context as a SystemMessage at the END of the history
            # to ensure it overrides any stale history.
            messages_with_context = list(state["messages"])
            if working_set_context:
                from langchain_core.messages import SystemMessage
                messages_with_context.append(SystemMessage(content=working_set_context))

            response = chain.invoke({
                "messages": messages_with_context,
                "agent_scripts_path": state.get("agent_scripts_path"),
                "current_task_description": state.get("current_task_description"),
                "working_set_context": "" # Clear the template variable since we added it as a message
            })
            return {"messages": [response]}
        except Exception as e:
            import traceback
            traceback.print_exc()
            raise e