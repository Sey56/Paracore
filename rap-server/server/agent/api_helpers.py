import asyncio
import json
import os
import aiohttp # Now installed and ready to use

# This base URL should be configured properly, not hardcoded
API_BASE_URL = "http://127.0.0.1:8000"

async def handle_list_available_scripts(state: dict) -> dict:
    """
    Handles the logic for the 'list_available_scripts' tool.
    Reads the manifest file from the agent_scripts_path.
    """
    agent_scripts_path = state.get("agent_scripts_path")
    if not agent_scripts_path:
        return {"error": "Agent scripts path not set.", "is_success": False}

    manifest_path = os.path.join(agent_scripts_path, 'cache', 'scripts_manifest.json')
    if not os.path.exists(manifest_path):
        return {"error": f"Manifest file not found at {manifest_path}.", "is_success": False}
    
    # Use asyncio.to_thread for synchronous file I/O
    def read_manifest():
        with open(manifest_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    manifest_data = await asyncio.to_thread(read_manifest)
    
    script_count = len(manifest_data)
    summary = f"Found {script_count} tools."
    return {"summary": summary, "manifest": manifest_data, "is_success": True}

async def handle_get_script_parameters(state: dict, tool_args: dict) -> dict:
    """
    Handles the logic for the 'get_script_parameters_tool'.
    Fetches script parameters from the server using the provided script path and type.
    """
    script_path = tool_args.get("script_path")
    script_type = tool_args.get("script_type")
    script_name = tool_args.get("script_name") # For logging/error messages

    if not script_path or not script_type:
        return {"error": "Tool 'get_script_parameters_tool' requires 'script_path' and 'script_type' arguments.", "is_success": False}

    user_token = state.get("user_token")
    
    return await get_script_parameters_from_server(
        script_path=script_path,
        script_type=script_type,
        user_token=user_token
    )

async def handle_run_script_by_name(state: dict, tool_args: dict) -> dict:
    """
    Handles the logic for executing the 'run_script_by_name' tool.
    The tool_args should contain the final, merged parameters.
    """
    script_name = tool_args.get("script_name")
    parameters = tool_args.get("parameters", {}) # These should be the final parameters from the LLM
    
    if not script_name:
        return {"error": "Tool 'run_script_by_name' requires a 'script_name' argument.", "is_success": False}

    selected_script_metadata = state.get('selected_script_metadata')
    if not selected_script_metadata or selected_script_metadata.get('name') != script_name:
        return {"error": f"Script '{script_name}' not found in selected_script_metadata. Please select the script first.", "is_success": False}

    script_path = selected_script_metadata.get('absolutePath')
    script_type = selected_script_metadata.get('type')

    if not script_path or not script_type:
        return {"error": "Incomplete script metadata found in state for running script.", "is_success": False}

    user_token = state.get("user_token")

    result_json = await run_script_from_server(
        script_path=script_path,
        script_type=script_type,
        parameters=parameters, # Use the parameters directly from tool_args
        user_token=user_token
    )
    
    agent_summary_message = ""
    if result_json.get("is_success"):
        agent_summary_message = f"The script '{script_name}' executed successfully."
    else:
        agent_summary_message = f"The script '{script_name}' failed to execute. Error: {result_json.get('error_message', 'Unknown error')}"

    response_payload = {
        "agent_message": agent_summary_message,
        "execution_result": result_json,
        "script_id": selected_script_metadata.get("id"), # Use ID from stored metadata
        "trigger_ui_automation_view": True,
    }
    return response_payload


# --- Low-level API callers ---

async def run_script_from_server(script_path: str, script_type: str, parameters: dict, user_token: str) -> dict:
    """Calls the /run-script endpoint to execute a script."""
    try:
        payload = {
            "path": script_path,
            "type": script_type,
            "parameters": json.dumps(parameters) if parameters else None
        }
        headers = {"Authorization": f"Bearer {user_token}"}
        
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{API_BASE_URL}/run-script", json=payload, headers=headers) as response:
                response.raise_for_status()
                return await response.json()

    except Exception as e:
        return {"error": str(e), "is_success": False}

async def get_script_parameters_from_server(script_path: str, script_type: str, user_token: str) -> dict:
    """Calls the /api/get-script-parameters endpoint to get a script's parameter definitions."""
    try:
        payload = {
            "scriptPath": script_path,
            "type": script_type
        }
        headers = {"Authorization": f"Bearer {user_token}"}

        async with aiohttp.ClientSession() as session:
            async with session.post(f"{API_BASE_URL}/api/get-script-parameters", json=payload, headers=headers) as response:
                response.raise_for_status()
                return await response.json()

    except Exception as e:
        return {"error": str(e), "is_success": False}