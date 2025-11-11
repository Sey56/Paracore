from langchain_core.tools import tool
from pydantic import BaseModel, Field
from typing import List

class ListAvailableScriptsArgs(BaseModel):
    agent_scripts_path: str = Field(..., description="The absolute path to the directory containing agent scripts (tools_library path).")

@tool(args_schema=ListAvailableScriptsArgs)
def list_available_scripts(agent_scripts_path: str) -> list:
    """
    Lists all available C# Revit automation scripts in the specified agent scripts path.
    Returns a list of dictionaries, where each dictionary contains metadata for a script.
    """
    # The actual implementation will be in api_helpers.py
    pass

tools = [list_available_scripts]