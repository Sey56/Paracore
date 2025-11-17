from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from .state import AgentState

# Import the node functions from the new structure
from .nodes.agent_node import agent_node
from .nodes.tool_node import tool_node
from .nodes.get_parameters_node import get_parameters_node
from .nodes.conditional_edges import should_continue

# --- Graph Definition ---
graph_builder = StateGraph(AgentState)

# Define the nodes
graph_builder.add_node("agent", agent_node)
graph_builder.add_node("tool_node", tool_node)
graph_builder.add_node("get_parameters_node", get_parameters_node)

# Set the entry point
graph_builder.set_entry_point("agent")

# Add the conditional edge
graph_builder.add_conditional_edges(
    "agent",
    should_continue,
    {
        "tool_node": "tool_node",
        "get_parameters_node": "get_parameters_node",
        END: END
    }
)

# Add the edges from the other nodes back to the agent
graph_builder.add_edge("tool_node", "agent")
graph_builder.add_edge("get_parameters_node", "agent")

# Compile the graph
memory = MemorySaver()
_app = None

def get_app():
    """
    Compiles and returns the singleton LangGraph app instance.
    """
    global _app
    if _app is None:
        _app = graph_builder.compile(checkpointer=memory)
    return _app