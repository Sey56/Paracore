from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from .state import AgentState # Import AgentState from the new state.py file
from .llm import _get_llm
from .system_prompt import SYSTEM_PROMPT
from .graph_nodes.preprocess import preprocess_node
from .graph_nodes.list_scripts import list_scripts_node
from .tools import list_available_scripts, tools # Import the specific tool and the list

# 2. Define the agent nodes
async def agent_node(state: AgentState) -> dict:
    """
    The main agent node. It calls the LLM with the current state
    to decide the next action (call a tool or respond to the user).
    """
    print("--- agent_node called ---")
    llm = _get_llm(state)
    
    # Bind the tools that the agent can call
    llm_with_tools = llm.bind_tools([list_available_scripts])
    
    prompt_messages = [SYSTEM_PROMPT] + state["messages"]
    
    response = await llm_with_tools.ainvoke(prompt_messages)
    
    print(f"--- agent_node LLM response: {response.content} ---")
    
    return {"messages": [response]}

# 3. Define the routing logic
def should_continue(state: AgentState) -> str:
    """Determines the next node to call."""
    if state["messages"][-1].tool_calls:
        return "list_scripts_node"
    return END

# 4. Define the graph
workflow = StateGraph(AgentState)
workflow.add_node("preprocess", preprocess_node)
workflow.add_node("agent", agent_node)
workflow.add_node("list_scripts_node", list_scripts_node)

workflow.set_entry_point("preprocess")

workflow.add_edge("preprocess", "agent")
workflow.add_conditional_edges(
    "agent",
    should_continue,
    {
        "list_scripts_node": "list_scripts_node",
        END: END
    }
)
# After the retriever runs, go back to the agent to make a choice
workflow.add_edge("list_scripts_node", "agent")


# 5. Compile the graph
memory = MemorySaver()
agent_graph = workflow.compile(checkpointer=memory)
