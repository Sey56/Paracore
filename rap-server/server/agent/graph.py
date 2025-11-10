from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import ToolMessage # Import ToolMessage

from .nodes.agent_node import agent_node
from .nodes.search_scripts_node import search_scripts_node
from .nodes.select_script_node import select_script_node
from .nodes.sync_params_node import sync_params_node
from .nodes.execute_script_node import execute_script_node
from .nodes.get_ui_parameters_node import get_ui_parameters_node
from .state import AgentState

# --- 4. Wire up the Graph ---

graph_builder = StateGraph(AgentState)

graph_builder.add_node("agent", agent_node)
graph_builder.add_node("search_scripts_node", search_scripts_node)
graph_builder.add_node("select_script_node", select_script_node)
graph_builder.add_node("sync_params_node", sync_params_node)
graph_builder.add_node("execute_script_node", execute_script_node)
graph_builder.add_node("get_ui_parameters_node", get_ui_parameters_node)

graph_builder.set_entry_point("agent")

def should_continue(state: AgentState):
    """
    Determines the next step for the agent with a simple, explicit, and robust routing logic.
    This function is designed to be predictable and prevent recursive loops.
    """
    last_message = state['messages'][-1]

    # 1. If the agent just called a tool, route to the appropriate tool node.
    if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
        tool_name = last_message.tool_calls[0]['name']
        if tool_name == "list_available_scripts":
            return "search_scripts_node"
        elif tool_name == "select_script_tool":
            return "select_script_node"
        elif tool_name == "get_ui_parameters_tool":
            return "get_ui_parameters_node"
        elif tool_name == "run_script_by_name":
            return "execute_script_node"
        else:
            # If the tool is unknown, go back to the agent to re-evaluate.
            return "agent"

    # 2. If a tool just ran (i.e., the last message is a ToolMessage),
    #    always return to the agent to process the tool's output.
    if isinstance(last_message, ToolMessage):
        return "agent"

    # 3. If the last message is a conversational response from the agent or a user message,
    #    and there's no pending action, the turn is over.
    return END

graph_builder.add_conditional_edges(
    "agent",
    should_continue,
)

graph_builder.add_edge("search_scripts_node", "agent")
graph_builder.add_edge("select_script_node", "agent")
graph_builder.add_edge("sync_params_node", "agent")
graph_builder.add_edge("execute_script_node", "agent")
graph_builder.add_edge("get_ui_parameters_node", "agent")

# --- 5. Compile the Graph ---

memory = MemorySaver()

app = graph_builder.compile(
    checkpointer=memory,
    interrupt_before=["execute_script_node", "get_ui_parameters_node"]
)