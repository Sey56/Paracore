from typing import List, Dict, Optional, Any
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field
import json
import logging

from agent.mcp_client import get_mcp_tools
from agent.orchestrator.registry import ScriptRegistry

logger = logging.getLogger(__name__)

# --- Schemas ---

class SetActiveScriptArgs(BaseModel):
    script_id: str = Field(..., description="The unique tool_id (slug) of the script to select.")
    prefilled_parameters: Optional[Dict[str, Any]] = Field(default=None, description="Optional map of parameter names to values to pre-fill in the UI (e.g. {'TargetLevel': 'Level 1'}).")

# --- Simplified Tool Implementations ---

async def list_scripts(agent_scripts_path: str = None, **kwargs) -> str:
    """Lists all available scripts in the Paracore library with their IDs and descriptions."""
    if not agent_scripts_path: return "Error: scripts path not provided."
    try:
        registry = ScriptRegistry(agent_scripts_path)
        catalog = registry.get_catalog()
        return f"Available Scripts:\n{json.dumps(catalog, indent=2)}"
    except Exception as e:
        return f"Error listing scripts: {str(e)}"

async def inspect_script(tool_id: str, agent_scripts_path: str = None, **kwargs) -> str:
    """Gets the full metadata and parameter details for a specific script. Use this to understand parameters before set_active_script."""
    if not agent_scripts_path: return "Error: scripts path not provided."
    try:
        registry = ScriptRegistry(agent_scripts_path)
        script = registry.find_script_by_tool_id(tool_id)
        if not script: return f"Error: Script {tool_id} not found."
        return json.dumps(script, indent=2)
    except Exception as e:
        return f"Error inspecting script: {str(e)}"

async def set_active_script(script_id: str, prefilled_parameters: Optional[Dict[str, Any]] = None) -> str:
    """Focuses a script in the Paracore UI by its ID and opens its parameters tab.
    You MUST call this to prepare the UI for the user.
    The user will then review and click 'Proceed' to run it."""
    return f"Preparing UI for script: {script_id}."

async def get_tools(config: Dict[str, Any]) -> List:
    """
    Retrieves the full toolset: Local Infrastructure + MCP Scripts.
    """
    scripts_path = config.get("agent_scripts_path")
    
    local_tools = [
        StructuredTool.from_function(
            coroutine=list_scripts,
            name="list_scripts",
            description="Lists available scripts and their descriptions.",
        ),
        StructuredTool.from_function(
            coroutine=inspect_script,
            name="inspect_script",
            description="Returns full metadata (params, categories) for a specific script ID."
        ),
        StructuredTool.from_function(
            coroutine=set_active_script,
            name="set_active_script",
            description="Selects a script and prepares the Parameters Tab in the UI.",
            args_schema=SetActiveScriptArgs
        )
    ]
    
    # Add MCP tools
    try:
        mcp_tools = await get_mcp_tools()
        return local_tools + mcp_tools
    except Exception as e:
        logger.error(f"Failed to fetch MCP tools: {e}")
        return local_tools
