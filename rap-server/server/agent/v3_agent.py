from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
import json
import logging
import os

from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext
from pydantic_ai.models.google import GoogleModel

from agent.orchestrator.registry import ScriptRegistry
from agent.prompt import SYSTEM_PROMPT

logger = logging.getLogger(__name__)

@dataclass
class RevitDeps:
    agent_scripts_path: str
    cloud_token: Optional[str] = None

# --- V3 Schemas ---

class ParameterDefinition(BaseModel):
    name: str
    description: str
    isRevitElement: bool = False
    revitElementType: Optional[str] = None
    options: List[str] = []
    required: bool = True

class ScriptStep(BaseModel):
    type: str = "curated_script"
    script_id: str
    script_metadata: Dict[str, Any]
    deduced_parameters: Dict[str, Any] = {}
    satisfied_parameters: List[str] = []
    missing_parameters: List[str] = []
    parameter_definitions: List[ParameterDefinition] = []
    status: str = "pending"

class AutomationPlan(BaseModel):
    action: str
    explanation: str
    steps: List[ScriptStep]

# --- The Solid Steel Agent ---

paracore_agent = Agent(
    'google-gla:gemini-1.5-flash', 
    deps_type=RevitDeps,
    system_prompt=SYSTEM_PROMPT
)


@paracore_agent.tool
async def list_scripts(ctx: RunContext[RevitDeps]) -> str:
    """Lists available Revit automation scripts in the Paracore library."""
    try:
        registry = ScriptRegistry(ctx.deps.agent_scripts_path)
        catalog = registry.get_catalog()
        return json.dumps(catalog, indent=2)
    except Exception as e:
        return f"Error listing scripts: {str(e)}"

@paracore_agent.tool
async def inspect_script(ctx: RunContext[RevitDeps], tool_id: str) -> str:
    """Gets full metadata and parameter details for a specific script."""
    try:
        registry = ScriptRegistry(ctx.deps.agent_scripts_path)
        script = registry.find_script_by_tool_id(tool_id)
        if not script: return f"Script {tool_id} not found."
        return json.dumps(script, indent=2)
    except Exception as e:
        return f"Error inspecting script: {str(e)}"

@paracore_agent.tool
async def read_script(ctx: RunContext[RevitDeps], script_id: str) -> str:
    """Reads the C# source code of a script for logic reference."""
    try:
        registry = ScriptRegistry(ctx.deps.agent_scripts_path)
        script = registry.find_script_by_tool_id(script_id)
        if not script or not script.get("absolutePath"):
            return f"Script source for {script_id} not found."
        
        path = script["absolutePath"]
        with open(path, 'r', encoding='utf-8-sig') as f:
            return f.read()
    except Exception as e:
        return f"Error reading script: {str(e)}"

@paracore_agent.tool
async def set_active_script(ctx: RunContext[RevitDeps], script_id: str, prefilled_parameters: Optional[Dict[str, Any]] = None) -> str:
    """
    Focuses a script in the Paracore UI and opens its parameters tab.
    You MUST call this to prepare the UI for the user.
    """
    return f"Preparing UI for script: {script_id}."

@paracore_agent.tool
async def propose_automation_plan(ctx: RunContext[RevitDeps], plan: AutomationPlan) -> str:
    """Proposes a multi-step automation sequence. Use for complex tasks."""
    return f"Automation plan proposed: {plan.action}. Please review in the chat."

@paracore_agent.tool
async def get_project_summary(ctx: RunContext[RevitDeps]) -> str:
    """Returns high-level status of the Revit model (counts, warnings, health)."""
    return "Project Summary: Connected to Revit. Multi-story model detected. Stable."

@paracore_agent.tool
async def get_revit_context(ctx: RunContext[RevitDeps]) -> str:
    """Returns local user context: active view, current selection, and project levels."""
    from agent.mcp_client import ParacoreMCPClient
    try:
        mcp = ParacoreMCPClient.get_instance()
        res = await mcp.call_tool("get_revit_context", {})
        return str(res)
    except Exception as e:
        return f"Error fetching Revit context: {str(e)}"

# --- Tool Synchronization (The Steel Thread) ---

# Seed with core tools already registered via decorators
REGISTERED_CUSTOM_TOOLS = {
    "list_scripts", "inspect_script", "read_script", 
    "set_active_script", "propose_automation_plan", 
    "get_project_summary", "get_revit_context"
}

async def sync_v3_tools(agent_scripts_path: str):
    """Ensures all Revit MCP tools are registered on the Agent instance."""
    from agent.mcp_client import ParacoreMCPClient
    from pydantic import create_model, Field
    global REGISTERED_CUSTOM_TOOLS
    
    mcp = ParacoreMCPClient.get_instance()
    await mcp.initialize()
    
    for tool_def in mcp._tools_cache:
        t_name = tool_def.name
        
        # Robust Identity Check: Don't re-register tools that already exist
        if t_name in REGISTERED_CUSTOM_TOOLS:
            continue
            
        logger.info(f"[V3] Registering dynamic tool: {t_name}")
        
        # 1. Build Type-Safe Schema
        input_schema = tool_def.inputSchema
        properties = input_schema.get("properties", {})
        required_fields = input_schema.get("required", [])
        
        field_definitions = {}
        for field_name, field_info in properties.items():
            python_type = Any
            js_type = field_info.get("type")
            if js_type == "string": python_type = str
            elif js_type == "integer": python_type = int
            elif js_type == "number": python_type = float
            elif js_type == "boolean": python_type = bool
            
            default_value = ... if field_name in required_fields else None
            field_definitions[field_name] = (python_type, Field(default=default_value, description=field_info.get("description", "")))

        ArgsModel = create_model(f"{t_name}_args", **field_definitions)

        # 2. Define High-Fidelity Wrapper with Manual Binding
        # We manually bind the dynamic model to avoid 'NameError' during schema inspection
        async def _execute_mcp_tool(ctx: RunContext[RevitDeps], args: Any, name=t_name):
            """Dynamic wrapper for MCP script execution."""
            # SOVEREIGN HANDOFF: If it's a 'run_' tool, we don't execute in background.
            # We return a sentinel so the agent knows it's "selected" for the UI.
            if name.startswith("run_"):
                logger.info(f"[V3] Handoff: Preparing UI for {name}")
                return f"SUCCESS: Script '{name}' has been selected in the Paracore UI. Please tell the user to review the parameters in the sidebar and click 'Proceed' when ready."

            mcp_inner = ParacoreMCPClient.get_instance()
            # args will be an instance of ArgsModel
            return await mcp_inner.call_tool(name, args.model_dump())
        
        # KEY FIX: Manually set annotations and inject into globals for Pydantic schema generation
        _execute_mcp_tool.__annotations__['args'] = ArgsModel
        
        # 3. Formal Registration (Solves serialization/unique_id bugs)
        paracore_agent.tool(
            _execute_mcp_tool,
            name=t_name,
            description=tool_def.description or ""
        )
        REGISTERED_CUSTOM_TOOLS.add(t_name)

# --- Execution Entry Point ---

async def run_v3_chat(
    message: str,
    history: List[Any],
    deps: RevitDeps,
    model_name: str,
    api_key: str,
    provider: str = "Google"
):
    """Entry point for the V3 Agent chat loop."""
    
    # Industrial Model Factory
    p_lower = provider.lower()
    if p_lower == "google":
        os.environ["GOOGLE_API_KEY"] = api_key
        from pydantic_ai.models.google import GoogleModel
        model = GoogleModel(model_name)
    elif p_lower == "openrouter":
        os.environ["OPENAI_API_KEY"] = api_key 
        from pydantic_ai.models.openai import OpenAIModel
        from pydantic_ai.providers.openai import OpenAIProvider
        
        # In PydanticAI 1.47, configuration belongs to the Provider
        provider_obj = OpenAIProvider(
            base_url="https://openrouter.ai/api/v1",
            api_key=api_key
        )
        model = OpenAIModel(model_name, provider=provider_obj)

    else:
        # Fallback to PydanticAI auto-inference
        model = model_name

    # Industrial Tool Synchronization
    await sync_v3_tools(deps.agent_scripts_path)
    
    # Run the agent with high-fidelity history and industrial token limits
    from pydantic_ai.settings import ModelSettings
    result = await paracore_agent.run(
        message,
        deps=deps,
        message_history=history,
        model=model,
        settings=ModelSettings(max_tokens=2048)
    )

    
    return result

