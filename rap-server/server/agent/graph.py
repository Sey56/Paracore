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

tools = [execute_revit_script]

gemini_api_key = os.getenv("GEMINI_API_KEY")
if not gemini_api_key:
    raise ValueError("GEMINI_API_KEY not found in environment variables. Please set it in the .env file.")

# Initialize LLM and bind tools in one step, passing the api_key directly.
llm_with_tools = ChatGoogleGenerativeAI(
    model="gemini-2.0-flash", 
    api_key=gemini_api_key
).bind_tools(tools)

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
