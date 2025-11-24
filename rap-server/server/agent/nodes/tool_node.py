import json
from langchain_core.messages import ToolMessage
from ..state import AgentState
from ..tools import (
    search_scripts_tool, run_script_by_name, get_working_set_details, 
    clear_working_set, set_working_set, add_to_working_set, 
    remove_from_working_set, get_revit_context_tool, set_active_script_tool
)
from ..api_helpers import read_local_script_manifest
from .working_set_utils import process_working_set_output, validate_working_set

def get_and_validate_working_set(state: AgentState) -> tuple[dict, dict]:
    """
    Central function to get and validate the working set.
    It fetches the set from state, calls the validation utility,
    updates the state if changes occurred, and returns the cleaned set.
    """
    current_working_set = state.get('working_set', {})
    validated_working_set = validate_working_set(current_working_set)
    
    state_update = {}
    if validated_working_set != current_working_set:
        state_update['working_set'] = validated_working_set
        
    return validated_working_set, state_update

def tool_node(state: AgentState):
    """
    This node orchestrates all tool calls. It now centralizes working set
    validation to ensure data is always fresh before any tool logic is executed.
    """
    last_message = state['messages'][-1]
    if not hasattr(last_message, 'tool_calls') or not last_message.tool_calls:
        return {}

    master_state_update = {}
    results = []
    
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
        
        # This will hold updates specific to this single tool call iteration
        current_loop_state_update = {}

        if tool_name == get_working_set_details.name:
            clean_ws, validation_update = get_and_validate_working_set(state)
            master_state_update.update(validation_update)
            
            if not clean_ws:
                result_str = "The current working set is empty."
            else:
                result_str = f"The current working set contains: {json.dumps(clean_ws)}"
            results.append(ToolMessage(content=result_str, tool_call_id=tool_call_id))

        elif tool_name in tool_map:
            # For any tool that modifies the working set, validate it first.
            clean_ws, validation_update = get_and_validate_working_set(state)
            master_state_update.update(validation_update)

            tool_to_call = tool_map[tool_name]
            json_str_output = tool_to_call.invoke(tool_args)
            
            new_ws, display_message = process_working_set_output(json_str_output, clean_ws)
            
            if new_ws is not None:
                # This update will be merged into the master state update
                current_loop_state_update['working_set'] = new_ws
            
            results.append(ToolMessage(content=display_message or "Working set operation completed.", tool_call_id=tool_call_id))
        
        elif tool_name == search_scripts_tool.name:
            # Non-working-set-related tools
            # ... (code for other tools remains the same)
            actual_agent_scripts_path = state.get('agent_scripts_path')
            if not actual_agent_scripts_path:
                error_message = "Agent scripts path is not set in AgentState."
                results.append(ToolMessage(content=json.dumps({"error": error_message}), tool_call_id=tool_call_id))
                continue
            full_manifest = read_local_script_manifest(agent_scripts_path=actual_agent_scripts_path)
            current_loop_state_update['identified_scripts_for_choice'] = full_manifest
            results.append(ToolMessage(content=json.dumps(full_manifest), tool_call_id=tool_call_id))

        elif tool_name == run_script_by_name.name:
            return {} 
        
        elif tool_name == set_active_script_tool.name:
            script_name = tool_args.get('script_metadata', {}).get('name', 'Unknown')
            results.append(ToolMessage(content=f"Active script set to: {script_name}", tool_call_id=tool_call_id))

        elif tool_name == get_revit_context_tool.name:
            try:
                context_result = get_revit_context_tool.invoke(tool_args)
                results.append(ToolMessage(content=json.dumps(context_result), tool_call_id=tool_call_id))
            except Exception as e:
                results.append(ToolMessage(content=f"Error getting Revit context: {str(e)}", tool_call_id=tool_call_id))
        
        else:
            results.append(ToolMessage(content=f"Unknown or unhandled tool: {tool_name}", tool_call_id=tool_call_id))

        # Merge updates from the current tool loop into the master update dictionary
        master_state_update.update(current_loop_state_update)

    master_state_update["messages"] = results
    return master_state_update
