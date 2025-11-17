import json
from langchain_core.messages import ToolMessage, AIMessage
from langgraph.graph import END

from ..state import AgentState
from ..tools import search_scripts_tool, run_script_by_name
from ..api_helpers import read_local_script_manifest

def tool_node(state: AgentState):
    """
    This node executes tools requested by the agent.
    """
    last_message = state['messages'][-1]
    
    if not hasattr(last_message, 'tool_calls') or not last_message.tool_calls:
        return {}

    state_update = {}
    results = []
    for tool_call in last_message.tool_calls:
        if tool_call['name'] == search_scripts_tool.name:
            actual_agent_scripts_path = state.get('agent_scripts_path')
            if not actual_agent_scripts_path:
                error_message = "Agent scripts path is not set in AgentState. Cannot search scripts."
                results.append(ToolMessage(content=json.dumps({"error": error_message}), tool_call_id=tool_call['id']))
                continue

            full_manifest = read_local_script_manifest(agent_scripts_path=actual_agent_scripts_path)
            state_update['identified_scripts_for_choice'] = full_manifest
            results.append(ToolMessage(content=json.dumps(full_manifest), tool_call_id=tool_call['id']))
        
        elif tool_call['name'] == run_script_by_name.name:
            # The agent has decided to run the script. This tool call is a signal to the frontend
            # to show the HITL modal. The graph will be interrupted by the router.
            # We don't execute the tool here in the backend. The frontend does.
            # We just return the tool call so the edge can see it and end the graph turn.
            # The frontend will then call the /run-script endpoint directly.
            # After execution, the frontend will send a new message to the agent with the summary.
            return {} # No state change needed from the backend for this tool call
        
        else:
            # For any other tools, you would execute them here.
            # result = execute_tool(tool_call)
            # results.append(ToolMessage(content=json.dumps(result), tool_call_id=tool_call['id']))
            results.append(ToolMessage(content=f"Unknown or unhandled tool: {tool_call['name']}", tool_call_id=tool_call['id']))
    
    state_update["messages"] = results
    return state_update
