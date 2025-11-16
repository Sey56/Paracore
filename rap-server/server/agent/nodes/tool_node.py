import json
from langchain_core.messages import ToolMessage

from ..state import AgentState
from ..tools import search_scripts_tool, run_script_by_name
from ..api_helpers import read_local_script_manifest

def tool_node(state: AgentState):
    """
    This node is responsible for processing tool calls requested by the agent.
    It does not execute the tools directly but prepares the results for the next step.
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
            # This tool call is for the HITL modal. The graph will be interrupted by the router.
            # We don't execute anything here; we just pass the tool call through.
            # The router will see the 'run_script_by_name' tool call and send an 'interrupted' status.
            # The frontend then runs the script and sends the result back to the agent, which will be
            # handled by the 'summary_node'.
            pass # No action needed here.
        
        else:
            results.append(ToolMessage(content=f"Unknown or unhandled tool: {tool_call['name']}", tool_call_id=tool_call['id']))
    
    state_update["messages"] = results
    return state_update