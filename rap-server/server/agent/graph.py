from langgraph.graph import StateGraph, END
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.memory import MemorySaver
from .state import AgentState
from .prompt import prompt
from .tools import tools
import os
from langchain_core.messages import ToolMessage
from .api_helpers import read_local_script_manifest # Import the helper
import json # Import json for ToolMessage content

def _get_llm(state: AgentState): # Add state parameter
    """Dynamically creates an LLM instance based on the state."""
    provider = state.get("llm_provider")
    model = state.get("llm_model")
    api_key_value = state.get("llm_api_key_value")

    if provider == "google":
        api_key = api_key_value or os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY environment variable not set or not provided in state.")
        return ChatGoogleGenerativeAI(model=model or "gemini-2.0-flash", google_api_key=api_key, convert_system_message_to_human=True)
    
    # Fallback to a default if no provider is specified or recognized
    api_key = api_key_value or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise ValueError("GOOGLE_API_KEY environment variable not set or not provided in state.")
    return ChatGoogleGenerativeAI(model="gemini-2.0-flash", google_api_key=api_key, convert_system_message_to_human=True)

def agent_node(state: AgentState):
    """
    The agent node that invokes the LLM.
    """
    llm = _get_llm(state) # Pass state to _get_llm
    llm_with_tools = llm.bind_tools(tools)
    chain = prompt | llm_with_tools
    response = chain.invoke({
        "messages": state["messages"],
        "agent_scripts_path": state.get("agent_scripts_path") # Pass agent_scripts_path
    })
    return {"messages": [response]}

def tool_node(state: AgentState):
    """
    The tool node that executes tools.
    """
    last_message = state['messages'][-1]
    tool_calls = last_message.tool_calls
    results = []
    for tool_call in tool_calls:
        tool_name = tool_call['name']
        tool_args = tool_call['args']
        
        if tool_name == 'list_available_scripts':
            # ALWAYS use agent_scripts_path from state, overriding any LLM-generated value
            actual_agent_scripts_path = state.get('agent_scripts_path')
            if not actual_agent_scripts_path:
                error_message = "Agent scripts path is not set in AgentState. Cannot list scripts."
                results.append(ToolMessage(content=json.dumps({"error": error_message}), tool_call_id=tool_call['id']))
                continue

            scripts_manifest = read_local_script_manifest(agent_scripts_path=actual_agent_scripts_path)
            state['identified_scripts_for_choice'] = scripts_manifest # Store in state
            results.append(ToolMessage(content=json.dumps(scripts_manifest), tool_call_id=tool_call['id']))
        else:
            results.append(ToolMessage(content=f"Unknown tool: {tool_name}", tool_call_id=tool_call['id']))
            
    return {"messages": results}

def should_continue(state: AgentState):
    """
    A simple router that routes to tool_node if tool_calls are present, otherwise ends.
    """
    last_message = state['messages'][-1]
    if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
        return "tool_node"
    return END

# --- Graph Definition ---
graph_builder = StateGraph(AgentState)

# Define the nodes
graph_builder.add_node("agent", agent_node)
graph_builder.add_node("tool_node", tool_node) # Add tool_node

# Set the entry point
graph_builder.set_entry_point("agent")

# Add the conditional edge
graph_builder.add_conditional_edges(
    "agent",
    should_continue,
    {"tool_node": "tool_node", END: END} # Route to tool_node
)

# Add the edge from the tool node back to the agent
graph_builder.add_edge("tool_node", "agent") # Add edge back to agent

# Compile the graph
memory = MemorySaver()
app = graph_builder.compile(checkpointer=memory)