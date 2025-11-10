import requests
import json

API_BASE_URL = "http://127.0.0.1:8000"

def list_scripts_in_workspace(workspace_path: str) -> list:
    """Calls the /api/scripts endpoint to get a list of scripts."""
    if not workspace_path:
        return []
    try:
        response = requests.get(f"{API_BASE_URL}/api/scripts", params={"folderPath": workspace_path})
        response.raise_for_status() # Raise an exception for bad status codes
        return response.json()
    except Exception as e:
        return []

def run_script_from_server(script_path: str, script_type: str, parameters: dict, user_token: str) -> dict:
    """Calls the /run-script endpoint to execute a script."""
    try:
        payload = {
            "path": script_path,
            "type": script_type,
            "parameters": json.dumps(parameters) if parameters else None
        }
        headers = {"Authorization": f"Bearer {user_token}"}
        
        response = requests.post(f"http://127.0.0.1:8000/run-script", json=payload, headers=headers)
        response.raise_for_status() # Raise an exception for bad status codes
        return response.json()
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}

def get_script_parameters_from_server(script_path: str, script_type: str, user_token: str) -> dict:
    """Calls the /api/get-script-parameters endpoint to get a script's parameter definitions."""
    try:
        payload = {
            "scriptPath": script_path,
            "type": script_type
        }
        headers = {"Authorization": f"Bearer {user_token}"}

        response = requests.post(f"{API_BASE_URL}/api/get-script-parameters", json=payload, headers=headers)
        response.raise_for_status() # Raise an exception for bad status codes
        return response.json()
    except Exception as e:
        return {"error": str(e)}

