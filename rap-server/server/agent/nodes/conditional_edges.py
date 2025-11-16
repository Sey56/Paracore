from langgraph.graph import END
from langchain_core.messages import ToolMessage
from ..state import AgentState

def should_continue(state: AgentState):
    """
    This function determines the next node to call based on the current state.
    """
    last_message = state['messages'][-1]
    
    # If the last message is a ToolMessage, it means a tool has been executed
    # or the script execution result is coming back from the frontend.
    # We route this to the summary_node to process the result and respond.
    if isinstance(last_message, ToolMessage):
        return "summary_node"

    # If the last message is an AIMessage with tool_calls, it means the agent
    # is proposing a tool to be called (e.g., run_script_by_name to trigger HITL).
    # We route this to the tool_node for processing.
    if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
        return "tool_node"
    
    # If the agent has decided to present parameters, go to get_parameters_node
    if state.get("next_conversational_action") == "present_parameters":
        return "get_parameters_node"
    
    # If the agent has finished its turn (e.g., after the summary_node), end the conversation.
    if state.get("next_conversational_action") == END:
        return END

    # As a fallback, if no other condition is met, end the graph.
    return END