from langgraph.graph import StateGraph, END
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
import aiosqlite
from .state import AgentState

# Import the node functions from the new structure
from .nodes.start_node import start_node
from .nodes.agent_node import agent_node
from .nodes.tool_node import tool_node
from .nodes.get_parameters_node import get_parameters_node
from .nodes.conditional_edges import should_continue

# --- Graph Definition ---
graph_builder = StateGraph(AgentState)

# Define the nodes
graph_builder.add_node("start_node", start_node)
graph_builder.add_node("agent", agent_node)
graph_builder.add_node("tool_node", tool_node)
graph_builder.add_node("get_parameters_node", get_parameters_node)

# Set the entry point to the new start_node
graph_builder.set_entry_point("start_node")

# Add the edge from the start_node to the main agent
graph_builder.add_edge("start_node", "agent")


# Add the conditional edge from the agent node
graph_builder.add_conditional_edges(
    "agent",
    should_continue,
    {
        "tool_node": "tool_node",
        "get_parameters_node": "get_parameters_node",
        END: END
    }
)

# Add the edges from the tool nodes back to the agent
graph_builder.add_edge("tool_node", "agent")
graph_builder.add_edge("get_parameters_node", "tool_node")

# Compile the graph
# Use a persistent SQLite database for checkpoints
import os
app_data = os.getenv('APPDATA')
if app_data:
    data_dir = os.path.join(app_data, 'paracore-data')
    if not os.path.exists(data_dir):
        os.makedirs(data_dir)
    db_path = os.path.join(data_dir, "checkpoints.sqlite")
else:
    # Fallback for dev/other envs if APPDATA not set
    db_path = "checkpoints.sqlite"

_app = None
_connection = None

async def get_app():
    """
    Compiles and returns the singleton LangGraph app instance.
    """
    global _app, _connection
    if _app is None:
        _connection = await aiosqlite.connect(db_path, check_same_thread=False)
        checkpointer = AsyncSqliteSaver(_connection)
        _app = graph_builder.compile(checkpointer=checkpointer)
    return _app

async def close_app():
    """
    Closes the database connection.
    """
    global _connection
    if _connection:
        await _connection.close()
        _connection = None