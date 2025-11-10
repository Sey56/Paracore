from langchain_core.messages import BaseMessage, HumanMessage, ToolMessage, AIMessage

from ..state import AgentState

def get_ui_parameters_node(state: AgentState) -> dict:
    """A dummy node to create an interruption point for fetching UI parameters."""
    return {}