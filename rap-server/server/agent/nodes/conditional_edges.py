from langgraph.graph import END
from ..state import AgentState

def should_continue(state: AgentState):
    """
    This function determines the next node to call based on the current state.
    """
    last_message = state['messages'][-1]
    
    # If the agent has produced a tool call, route to the tool_node.
    if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
        # The 'run_script_by_name' tool is a special case that signals the end of the
        # agent's turn, as the frontend will take over.
        if last_message.tool_calls[0]['name'] == 'run_script_by_name':
            return END
        return "tool_node"
    
    # If the agent has decided to present parameters, go to the get_parameters_node.
    if state.get("next_conversational_action") == "present_parameters":
        return "get_parameters_node"
    
    # After a summary or if no other condition is met, the graph should end,
    # ready for the next user input.
    return END
