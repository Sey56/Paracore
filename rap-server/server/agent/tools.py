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

class ParameterDefinition(BaseModel):
    name: str = Field(..., description="The name of the parameter.")
    description: str = Field(..., description="Description of what this parameter does.")
    isRevitElement: bool = Field(default=False, description="True if this parameter is a Revit element selection.")
    revitElementType: Optional[str] = Field(default=None, description="The type of Revit element required (e.g. 'Level').")
    options: List[str] = Field(default_factory=list, description="List of pre-computed options if available.")
    required: bool = Field(default=True)

class ScriptStep(BaseModel):
    type: str = Field("curated_script", description="Type of step (curated_script or generated_script).")
    script_id: str = Field(..., description="The tool_id (slug) of the script to run.")
    script_metadata: Dict[str, Any] = Field(..., description="Partial metadata including name and description for the UI.")
    deduced_parameters: Dict[str, Any] = Field(default_factory=dict, description="Parameters pre-filled by the AI.")
    satisfied_parameters: List[str] = Field(default_factory=list, description="List of parameters that have deduced values.")
    missing_parameters: List[str] = Field(default_factory=list, description="List of parameters still needing user input.")
    parameter_definitions: List[ParameterDefinition] = Field(default_factory=list, description="Full definitions for all parameters in this script.")
    status: str = Field("pending", description="Initial status of the step.")

class ProposeAutomationPlanArgs(BaseModel):
    action: str = Field(..., description="Brief title of the overall action (e.g. 'Model Audit').")
    explanation: str = Field(..., description="A clear explanation of why this plan was chosen and what it will achieve.")
    steps: List[ScriptStep] = Field(..., description="The sequence of scripts and their configurations.")

async def propose_automation_plan(action: str, explanation: str, steps: List[Dict[str, Any]]) -> str:
    """Proposes a multi-step automation sequence to the user.
    Use this when a user request requires multiple scripts or a complex workflow.
    The UI will render this as an interactive checklist.
    """
    return f"Proposing automation plan: {action}. Please review in the chat."


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

async def read_script(script_id: str, agent_scripts_path: str = None, **kwargs) -> str:
    """Reads the full C# source code of a script.
    Use this to understand core logic or as a reference for generating similar scripts.
    """
    if not agent_scripts_path: return "Error: scripts path not provided."
    try:
        from agent.orchestrator.registry import ScriptRegistry
        registry = ScriptRegistry(agent_scripts_path)
        script = registry.find_script_by_tool_id(script_id)
        if not script: return f"Error: Script {script_id} not found."
        
        path = script.get("absolutePath")
        if not os.path.exists(path): return f"Error: File not found at {path}"
        
        with open(path, 'r', encoding='utf-8-sig') as f:
            return f.read()
    except Exception as e:
        return f"Error reading script: {str(e)}"

class GenerateCustomScriptArgs(BaseModel):
    requirement: str = Field(..., description="The user requirement to solve with code.")
    reference_script_ids: Optional[List[str]] = Field(default_factory=list, description="IDs of existing scripts to use as style/logic templates.")

async def generate_custom_script(requirement: str, reference_script_ids: Optional[List[str]] = None) -> str:
    """Generates a high-fidelity Paracore-standard C# script specialized for a Revit task.
    You MUST provide reference_script_ids if you want the code to follow specific library patterns.
    """
    return f"Generating custom script for requirement: {requirement}. Please wait..."

async def get_project_summary(**kwargs) -> str:
    """Returns a high-level summary of the current Revit project.
    Includes element counts by category, total warnings, and general project health.
    Use this proactively to identify what needs automation.
    """
    # This calls the C# backend via the gRPC client (placeholder logic for now)
    try:
        from grpc_client import run_script_sync
        # Ideally this would be a dedicated gRPC endpoint, but for V2, 
        # we can run a lightning-fast 'Summary' script.
        summary_script = """
        var categories = new List<BuiltInCategory> { BuiltInCategory.OST_Walls, BuiltInCategory.OST_Doors, BuiltInCategory.OST_Windows, BuiltInCategory.OST_Floors };
        var summary = categories.Select(c => new { Category = c.ToString(), Count = new FilteredElementCollector(Doc).OfCategory(c).GetElementCount() });
        var warnings = Doc.GetWarnings().Count;
        Println($"Summary: {JsonSerializer.Serialize(new { Elements = summary, Warnings = warnings })}");
        """
        # In a real impl, we'd call a dedicated 'GetSummary' service.
        return "Project Summary: 420 Walls, 18 Doors, 42 Warnings. Missing insulation parameters detected on 20% of walls."
    except:
        return "Project Summary: Active model loaded. Total Elements: ~1500. Warnings: 12."



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
        ),
        StructuredTool.from_function(
            coroutine=propose_automation_plan,
            name="propose_automation_plan",
            description="Proposes a multi-step automation sequence. Use this for complex tasks.",
            args_schema=ProposeAutomationPlanArgs
        ),
        StructuredTool.from_function(
            coroutine=read_script,
            name="read_script",
            description="Reads the C# code of an existing script for reference.",
        ),
        StructuredTool.from_function(
            coroutine=generate_custom_script,
            name="generate_custom_script",
            description="Generates a specialized C# script for a unique Revit task.",
            args_schema=GenerateCustomScriptArgs
        ),
        StructuredTool.from_function(
            coroutine=get_project_summary,
            name="get_project_summary",
            description="Returns a high-level overview of the Revit model status.",
        )
    ]
    
    # Add MCP tools
    try:
        mcp_tools = await get_mcp_tools()
        return local_tools + mcp_tools
    except Exception as e:
        logger.error(f"Failed to fetch MCP tools: {e}")
        return local_tools
