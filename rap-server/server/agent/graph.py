from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import AIMessage
from agent.state import AgentState
from agent.nodes import agent_node, tool_node, human_in_the_loop_node, get_ui_parameters_node

# --- 1. Wire up the Graph ---
graph_builder = StateGraph(AgentState)
graph_builder.add_node("agent", agent_node)
graph_builder.add_node("tools", tool_node)
graph_builder.add_node("human_in_the_loop", human_in_the_loop_node)
graph_builder.add_node("get_ui_parameters", get_ui_parameters_node)
graph_builder.set_entry_point("agent")

def should_continue(state: AgentState):
    """Determines the next step for the agent."""
    # If there's an active plan, continue processing it
    if state.get('plan') and len(state['plan']) > 0:
        return "tools" # Route to tools to execute the next step in the plan

    last_message = state['messages'][-1]
    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        tool_name = last_message.tool_calls[0]['name']
        if tool_name == 'run_script_by_name':
            return "human_in_the_loop"
        if tool_name == 'get_ui_parameters_tool':
            return "get_ui_parameters"
        return "tools"
    return END

graph_builder.add_conditional_edges(
    "agent",
    should_continue,
    {
        "human_in_the_loop": "human_in_the_loop",
        "get_ui_parameters": "get_ui_parameters",
        "tools": "tools",
        END: END,
    }
)

graph_builder.add_edge("tools", "agent")
graph_builder.add_edge("human_in_the_loop", "agent")
graph_builder.add_edge("get_ui_parameters", "agent")

# --- 2. Compile the Graph ---
memory = MemorySaver()
app = graph_builder.compile(
    checkpointer=memory,
    interrupt_before=["human_in_the_loop", "get_ui_parameters"]
)