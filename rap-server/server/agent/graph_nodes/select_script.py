import json
import os
import asyncio
from langchain_core.messages import ToolMessage
from ..state import AgentState
from ..api_helpers import API_BASE_URL # Import API_BASE_URL to construct manifest path

async def select_script_node(state: AgentState) -> dict:
    """
    Processes the 'select_script_tool' call.
    This node's primary role is to return a ToolMessage to the agent,
    confirming that the script selection has been communicated.
    The actual UI update for script selection is handled by the frontend.
    It also stores the metadata of the selected script in the agent's state.
    """
    print("--- select_script_node called ---")
    results = []
    last_message = state["messages"][-1]
    
    agent_scripts_path = state.get("agent_scripts_path")
    if not agent_scripts_path:
        error_msg = "Agent scripts path not set in agent's state."
        results.append(ToolMessage(content=json.dumps({"error": error_msg, "is_success": False}), tool_call_id="select_script_error"))
        state['next_conversational_action'] = "handle_error"
        return {"messages": results, "next_conversational_action": state['next_conversational_action']}

    manifest_path = os.path.join(agent_scripts_path, 'cache', 'scripts_manifest.json')
    if not os.path.exists(manifest_path):
        error_msg = f"Manifest file not found at {manifest_path}. Cannot select script."
        results.append(ToolMessage(content=json.dumps({"error": error_msg, "is_success": False}), tool_call_id="select_script_error"))
        state['next_conversational_action'] = "handle_error"
        return {"messages": results, "next_conversational_action": state['next_conversational_action']}

    # Use asyncio.to_thread for synchronous file I/O
    def read_manifest():
        with open(manifest_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    all_scripts = await asyncio.to_thread(read_manifest)

    for tool_call in last_message.tool_calls: 
        script_name = tool_call['args']['script_name']
        print(f"--- select_script_node processing script: {script_name} ---")

        matching_scripts = [s for s in all_scripts if s.get('name') and os.path.splitext(s['name'])[0].lower() == os.path.splitext(script_name)[0].lower()]

        if not matching_scripts:
            error_msg = f"Script '{script_name}' not found in the manifest."
            results.append(ToolMessage(content=json.dumps({"error": error_msg, "is_success": False}), tool_call_id=tool_call["id"]))
            state['script_selected_for_params'] = None
            state['selected_script_metadata'] = None
            state['next_conversational_action'] = "handle_error"
            return {"messages": results, "script_selected_for_params": state['script_selected_for_params'], "selected_script_metadata": state['selected_script_metadata'], "next_conversational_action": state['next_conversational_action']}
        if len(matching_scripts) > 1:
            error_msg = {"error": "multiple_scripts_found", "scripts": [s['name'] for s in matching_scripts]}
            results.append(ToolMessage(content=json.dumps(error_msg), tool_call_id=tool_call["id"]))
            state['script_selected_for_params'] = None
            state['selected_script_metadata'] = None
            state['next_conversational_action'] = "handle_error"
            return {"messages": results, "script_selected_for_params": state['script_selected_for_params'], "selected_script_metadata": state['selected_script_metadata'], "next_conversational_action": state['next_conversational_action']}

        found_script = matching_scripts[0]
        
        # Store only the metadata of the selected script in the state
        state['selected_script_metadata'] = {
            'absolutePath': found_script['absolutePath'],
            'type': found_script['type'],
            'name': found_script['name']
        }
        state['script_selected_for_params'] = script_name
        state['next_conversational_action'] = None # Clear conversational action, agent will call get_params next
        print(f"--- State updated: script_selected_for_params = {script_name}, selected_script_metadata stored ---")

        # This tool is handled by the frontend, so the backend execution is a no-op.
        result_content = {"status": "success", "message": f"Script '{script_name}' selected."}
        results.append(ToolMessage(content=json.dumps(result_content), tool_call_id=tool_call["id"]))
        
    return {"messages": results, "script_selected_for_params": state['script_selected_for_params'], "selected_script_metadata": state['selected_script_metadata'], "next_conversational_action": state['next_conversational_action']}
