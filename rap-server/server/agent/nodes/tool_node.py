import json
from langchain_core.messages import ToolMessage, AIMessage
from langgraph.graph import END

from ..state import AgentState
from ..tools import search_scripts_tool, run_script_by_name, get_working_set_details, clear_working_set, set_working_set, add_to_working_set, remove_from_working_set, get_revit_context_tool
from ..api_helpers import read_local_script_manifest
from .working_set_utils import process_working_set_output

def tool_node(state: AgentState):
    """
    This node executes tools requested by the agent.
    """
    last_message = state['messages'][-1]
    
    if not hasattr(last_message, 'tool_calls') or not last_message.tool_calls:
        return {}

    state_update = {}
    results = []
    
    # A dictionary to map tool names to their callable functions from tools.py
    tool_map = {
        clear_working_set.name: clear_working_set,
        set_working_set.name: set_working_set,
        add_to_working_set.name: add_to_working_set,
        remove_from_working_set.name: remove_from_working_set
    }

    for tool_call in last_message.tool_calls:
        tool_name = tool_call['name']
        tool_args = tool_call['args']
        tool_call_id = tool_call['id']

        if tool_name == search_scripts_tool.name:
            actual_agent_scripts_path = state.get('agent_scripts_path')
            if not actual_agent_scripts_path:
                error_message = "Agent scripts path is not set in AgentState. Cannot search scripts."
                results.append(ToolMessage(content=json.dumps({"error": error_message}), tool_call_id=tool_call_id))
                continue

            full_manifest = read_local_script_manifest(agent_scripts_path=actual_agent_scripts_path)
            state_update['identified_scripts_for_choice'] = full_manifest
            results.append(ToolMessage(content=json.dumps(full_manifest), tool_call_id=tool_call_id))
        
        elif tool_name == run_script_by_name.name:
            # This tool call is a signal to the frontend, no backend execution needed.
            return {} 
        
        elif tool_name == get_working_set_details.name:
            working_set = state.get('working_set')
            if not working_set:
                result_str = "The current working set is empty."
            else:
                result_str = f"The current working set contains the following element IDs: {working_set}"
            results.append(ToolMessage(content=result_str, tool_call_id=tool_call_id))

        elif tool_name == get_revit_context_tool.name:
            try:
                # Invoke the tool directly
                context_result = get_revit_context_tool.invoke(tool_args)
                # The result is a dict, convert to JSON string for the message content
                results.append(ToolMessage(content=json.dumps(context_result), tool_call_id=tool_call_id))
            except Exception as e:
                results.append(ToolMessage(content=f"Error getting Revit context: {str(e)}", tool_call_id=tool_call_id))
        
        elif tool_name in tool_map:
            # For state-modifying working set tools, call the tool to get the JSON,
            # then process it with the utility to get the new state.
            tool_to_call = tool_map[tool_name]
            json_str_output = tool_to_call.invoke(tool_args)
            
            current_working_set = state.get("working_set") or []
            new_ws, display_message = process_working_set_output(json_str_output, current_working_set)
            
            if new_ws is not None:
                state_update['working_set'] = new_ws
            
            results.append(ToolMessage(content=display_message or "Working set operation completed.", tool_call_id=tool_call_id))

        else:
            results.append(ToolMessage(content=f"Unknown or unhandled tool: {tool_name}", tool_call_id=tool_call_id))
    
    state_update["messages"] = results
    return state_update