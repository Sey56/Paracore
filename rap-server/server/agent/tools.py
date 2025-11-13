import httpx
from langchain_core.tools import tool
from pydantic import BaseModel, Field
from typing import List

class SearchScriptsArgs(BaseModel):
    query: str = Field(..., description="The user's task description or query to find relevant scripts.")
    agent_scripts_path: str = Field(..., description="The absolute path to the directory containing agent scripts.")

@tool(args_schema=SearchScriptsArgs)
def search_scripts_tool(query: str, agent_scripts_path: str) -> list:
    """
    Searches for relevant C# Revit automation scripts based on a user query within the specified agent scripts path.
    """
    from .api_helpers import read_local_script_manifest
    full_manifest = read_local_script_manifest(agent_scripts_path=agent_scripts_path)
    return full_manifest

class GetScriptParametersArgs(BaseModel):
    script_path: str = Field(..., description="The absolute path of the script for which to retrieve parameters.")
    script_type: str = Field(..., description="The type of the script, e.g., 'single-file' or 'multi-file'.")
    user_token: str = Field(..., description="The user's authentication token.")

@tool(args_schema=GetScriptParametersArgs)
def get_script_parameters_tool(script_path: str, script_type: str, user_token: str) -> list:
    """
    Retrieves the UI parameters for a specified C# Revit script by calling the internal API.
    """
    try:
        with httpx.Client() as client:
            response = client.post(
                "http://127.0.0.1:8000/api/get-script-parameters",
                json={"scriptPath": script_path, "type": script_type},
                headers={"Authorization": f"Bearer {user_token}"}
            )
            response.raise_for_status()
            return response.json().get("parameters", [])
    except httpx.HTTPStatusError as e:
        return {"error": f"HTTP error occurred: {e.response.status_code} - {e.response.text}"}
    except Exception as e:
        return {"error": f"An unexpected error occurred: {str(e)}"}

class SetActiveScriptArgs(BaseModel):
    script_metadata: dict = Field(..., description="The full metadata object of the script to be set as active in the UI.")

@tool(args_schema=SetActiveScriptArgs)
def set_active_script_tool(script_metadata: dict) -> str:
    """
    Informs the frontend to set a specific script as the 'active' or 'selected' one.
    This allows the UI, like the ScriptInspector, to update and display the correct script information.
    This tool does not return a value, it only triggers a side effect in the UI.
    """
    return f"Successfully signaled UI to set {script_metadata.get('name')} as the active script."

tools = [search_scripts_tool, get_script_parameters_tool, set_active_script_tool]
