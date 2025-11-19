import os
import glob
import grpc
from langchain_core.tools import tool
from pydantic import BaseModel, Field
from typing import List

# Local imports
from grpc_client import get_script_parameters
from utils import resolve_script_path


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

@tool(args_schema=GetScriptParametersArgs)
def get_script_parameters_tool(script_path: str, script_type: str) -> list:
    """
    Retrieves the UI parameters for a specified C# Revit script by reading the script
    file(s) and calling the gRPC service directly.
    """
    try:
        absolute_path = resolve_script_path(script_path)
        script_files = []
        if script_type == "single-file":
            with open(absolute_path, 'r', encoding='utf-8-sig') as f:
                source_code = f.read()
            script_files.append({"file_name": os.path.basename(absolute_path), "content": source_code})
        elif script_type == "multi-file":
            if not os.path.isdir(absolute_path):
                # Return an empty list on error to maintain type consistency
                return []
            for file_path in glob.glob(os.path.join(absolute_path, "*.cs")):
                with open(file_path, 'r', encoding='utf-8-sig') as f:
                    source_code = f.read()
                script_files.append({"file_name": os.path.basename(file_path), "content": source_code})
        
        if not script_files:
            return []

        response = get_script_parameters(script_files)
        # Ensure we return the list of parameters, or an empty list if key is missing
        return response.get("parameters", [])
        
    except (FileNotFoundError, grpc.RpcError, Exception):
        # On any error, return an empty list to prevent downstream crashes.
        # The agent will interpret an empty list as "no parameters found".
        return []

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

class RunScriptByNameArgs(BaseModel):
    script_name: str = Field(..., description="The name of the script to run.")
    parameters: dict = Field(..., description="A dictionary of parameter names and their values.")
    is_final_approval: bool = Field(False, description="A flag to indicate if this is the final approval step before execution.")

@tool(args_schema=RunScriptByNameArgs)
def run_script_by_name(script_name: str, parameters: dict, is_final_approval: bool = False) -> dict:
    """
    Executes a C# Revit script by its name with the provided parameters.
    This tool should only be called when the user has confirmed all parameters and is ready to run the script.
    """
    # This tool is primarily for triggering the HITL modal in the frontend.
    # The actual execution happens when the user approves the modal.
    # We return a dictionary that can be interpreted by the frontend.
    return {
        "tool": "run_script_by_name",
        "script_name": script_name,
        "parameters": parameters,
        "is_final_approval": is_final_approval
    }

tools = [search_scripts_tool, get_script_parameters_tool, set_active_script_tool, run_script_by_name]
