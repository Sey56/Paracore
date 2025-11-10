import json
from typing import Literal
from langchain_core.messages import AIMessage, ToolMessage, HumanMessage
from .state import AgentState
from .llm import _get_llm
from .tools import tools
from .system_prompt import SYSTEM_PROMPT
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver

# Import the refactored nodes
from .graph_nodes.list_scripts import list_scripts_node
from .graph_nodes.get_params import get_params_node
from .graph_nodes.select_script import select_script_node
from .graph_nodes.run_script import run_script_node
from .graph_nodes.get_ui_params import get_ui_params_node
from .graph_nodes.preprocess import preprocess_node
from .graph_nodes.select_and_get_params import select_and_get_params_node

# --- Agent Nodes ---

async def agent_node(state: AgentState) -> dict:
    """Invokes the LLM to get the next action or conversational response."""
    llm = _get_llm(state)
    llm_with_tools = llm.bind_tools(tools)
    prompt_messages = [SYSTEM_PROMPT] + state["messages"]
    
    print("\n--- AGENT NODE: STATE MESSAGES BEFORE PROMPT CONSTRUCTION ---")
    print(f"  State messages count: {len(state['messages'])}")
    # for msg in state["messages"]: # Temporarily commented out to reduce log verbosity
    #     print(f"  {msg}")
    print("-----------------------------------------------------------\n")

    prompt_messages = [SYSTEM_PROMPT] + state["messages"]
    
    print("\n--- AGENT NODE: FINAL PROMPT MESSAGES SENT TO LLM ---")
    print(f"  Prompt messages count: {len(prompt_messages)}")
    # for msg in prompt_messages: # Temporarily commented out to reduce log verbosity
    #     print(f"  {msg}")
    print("-----------------------------------------------------\n")

    response = await llm_with_tools.ainvoke(prompt_messages)
    
    print("\n--- AGENT NODE: LLM RESPONSE RECEIVED ---")
    print(f"  {response}")
    print("-------------------------------------------\n")

    return {"messages": [response]}

# --- Graph Definition ---

def should_continue(state: AgentState) -> Literal["search_scripts_node", "select_and_get_params_node", "sync_params_node", "execute_script_node", "agent", END]:
    """Determines the next step based on the last message from the agent_node."""
    last_message = state["messages"][-1]

    if isinstance(last_message, AIMessage) and last_message.tool_calls:
        tool_name = last_message.tool_calls[0]['name']
        if tool_name == 'list_available_scripts':
            return "search_scripts_node"
        elif tool_name == 'select_script_tool':
            return "select_and_get_params_node"
        elif tool_name == 'get_ui_parameters_tool':
            # This is a HITL tool, so we end the graph for the router to handle.
            return END # Frontend will send a ToolMessage back
        elif tool_name == 'run_script_by_name':
            # This is a HITL tool, so we end the graph for the router to handle.
            return END # Frontend will send a ToolMessage back
        else:
            # Fallback for any other tool calls - should ideally not happen if all tools are explicitly handled
            return "agent" 
    elif isinstance(last_message, ToolMessage):
        # After a tool executes or a HITL response comes back, go back to the agent.
        return "agent"
    # If it's a HumanMessage or a final conversational AIMessage without tool calls, the graph should end.
    return END

workflow = StateGraph(AgentState)

workflow.add_node("preprocess", preprocess_node)
workflow.add_node("agent", agent_node)
workflow.add_node("search_scripts_node", list_scripts_node) # Renamed for clarity
workflow.add_node("select_and_get_params_node", select_and_get_params_node)
workflow.add_node("sync_params_node", get_ui_params_node) # Renamed for clarity, will handle get_ui_parameters_tool
workflow.add_node("execute_script_node", run_script_node)

workflow.set_entry_point("preprocess")

workflow.add_edge("preprocess", "agent")

workflow.add_conditional_edges(
    "agent",
    should_continue,
    {
        "search_scripts_node": "search_scripts_node",
        "select_and_get_params_node": "select_and_get_params_node",
        "sync_params_node": "sync_params_node",
        "execute_script_node": "execute_script_node",
        "agent": "agent",
        END: END,
    },
)

workflow.add_edge("search_scripts_node", "agent")
workflow.add_edge("select_and_get_params_node", "agent")
workflow.add_edge("sync_params_node", "agent")
workflow.add_edge("execute_script_node", "agent")

# --- Add Checkpointer for Persistent State ---
memory = MemorySaver()
graph = workflow.compile(checkpointer=memory)
