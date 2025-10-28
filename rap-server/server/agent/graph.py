import os
from typing import TypedDict, Annotated
from langchain_core.messages import BaseMessage, HumanMessage
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import ToolNode, tools_condition
from langchain_google_genai import ChatGoogleGenerativeAI
from .tools import execute_revit_script

# --- 1. Define Agent State ---
class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], lambda x, y: x + y]

# --- 2. Setup Tools and LLM ---

# The agent's toolkit consists of the one tool we've created.
tools = [execute_revit_script]

# Set up the chat model
# This requires the GOOGLE_API_KEY environment variable to be set.
llm = ChatGoogleGenerativeAI(model="gemini-1.5-flash")

# Bind the tools to the LLM, so it knows what functions it can call.
llm_with_tools = llm.bind_tools(tools)

# --- 3. Define Graph Nodes ---

# The 'agent' node is the primary reasoner. It takes the current state and decides what to do.
def agent_node(state: AgentState):
    """Invokes the LLM to get the next action."""
    return {"messages": [llm_with_tools.invoke(state["messages"])]}

# The 'tool' node executes the functions called by the agent.
# It is a pre-built node from LangGraph that handles the tool calling logic.
tool_node = ToolNode(tools)

# --- 4. Wire up the Graph ---

graph_builder = StateGraph(AgentState)

# Define the two nodes in our graph
graph_builder.add_node("agent", agent_node)
graph_builder.add_node("tools", tool_node)

# The graph always starts at the 'agent' node
graph_builder.set_entry_point("agent")

# Define the conditional edge. After the agent speaks, we check if it has called a tool.
# If it has, we route to the 'tools' node. Otherwise, we end the conversation turn.
graph_builder.add_conditional_edges(
    "agent",
    tools_condition,
    # The 'tools_condition' function returns "tools" if a tool is called, and "__end__" otherwise.
    {
        "tools": "tools",
        END: END
    }
)

# The 'tools' node should always route back to the 'agent' node so the agent can process the tool output.
graph_builder.add_edge("tools", "agent")

# --- 5. Compile the Graph ---

# Add memory so the agent can remember conversation history.
memory = MemorySaver()

# Compile the final, runnable graph.
# The 'interrupt_before=["tools"]' is the key to enabling Human-in-the-Loop.
# The graph will pause just before executing a tool, allowing us to seek user approval.
app = graph_builder.compile(checkpointer=memory, interrupt_before=["tools"])
