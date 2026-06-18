import os
from dataclasses import dataclass, field
from typing import Optional, TypedDict
from pydantic_ai import Agent, RunContext
from pydantic_ai.usage import RunUsage
from pydantic import BaseModel, Field
from agent.prompt import SYSTEM_PROMPT
from mcp_core.tools import validate_csharp, agent_explore_revit_data, search_schema
import logging


class ThinkingStep(TypedDict):
    """A record of one intermediate agent tool call (explore, search, or read)."""
    tool_name: str
    justification: str
    status: str               # "running" | "completed" | "error"
    csharp_code: Optional[str]
    category_name: Optional[str]
    query: Optional[str]
    result_summary: Optional[str]

try:
    from grpc_client import execute_script
except ImportError:
    import sys
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from grpc_client import execute_script

logger = logging.getLogger(__name__)

# The Sovereign Handoff signal class.
# This tells the router to pause execution and ask the human.
class InterruptedException(Exception):
    def __init__(self, csharp_code: str, justification: str):
        self.csharp_code = csharp_code
        self.justification = justification
        super().__init__("Sovereign Handoff requested for UI approval.")

@dataclass
class AgentDeps:
    user_id: str
    thread_id: str
    thinking_steps: list[ThinkingStep] = field(default_factory=list)
    _searched_categories: set[str] = field(default_factory=set)
    turn_usage: RunUsage = field(default_factory=RunUsage)

v4_repl_agent = Agent(
    deps_type=AgentDeps,
    system_prompt=SYSTEM_PROMPT
)

class DynamicQueryArgs(BaseModel):
    csharp_code: str = Field(description="The C# snippet to execute in the Paracore REPL.")
    justification: str = Field(description="A short explanation of why you are running this code.")

@v4_repl_agent.tool
async def execute_dynamic_query(ctx: RunContext[AgentDeps], args: DynamicQueryArgs) -> str:
    """
    Execute C# in Revit (read or modify). The user's final action.
    Calling this tool pauses the agent and prompts the human for approval.

    BEFORE WRITING ANY C#: read the system prompt for the complete Paracore
    method catalog. Use extension methods (.GetStr, .GetNum, .WhereParam,
    .OrderByParam, .GroupByParam, .SumParam, .Table, etc.) instead of raw
    LINQ, FilteredElementCollector, LookupParameter, or foreach+Println.
    For syntax help, call read_extension_methods("name").
    """
    # Security: shared enforcement point (same as MCP)
    error = validate_csharp(args.csharp_code)
    if error:
        return error

    # SOVEREIGN HANDOFF: interrupt agent flow, router catches this and sends to UI
    raise InterruptedException(args.csharp_code, args.justification)

class ExploreQueryArgs(BaseModel):
    csharp_code: str = Field(description="The C# snippet to execute silently for schema and parameter discovery ONLY.")
    justification: str = Field(description="Why you need to inspect the schema before generating the final query.")

@v4_repl_agent.tool
async def explore_revit_data(ctx: RunContext[AgentDeps], args: ExploreQueryArgs) -> str:
    """
    Execute a READ-ONLY C# snippet SILENTLY in Revit for schema/data discovery.
    Returns summarized output immediately — the user does NOT see this.
    STRICTLY for discovery (e.g., .CombinedParams().Table(), .Peek()).
    Use execute_dynamic_query for the final user-facing result.

    BEFORE WRITING ANY C#: read the system prompt for the complete Paracore
    method catalog. Use extension methods (.GetStr, .GetNum, .WhereParam,
    .OrderByParam, .GroupByParam, .SumParam, .Table, etc.) instead of raw
    LINQ, FilteredElementCollector, LookupParameter, or foreach+Println.
    """
    # Record thinking step for UI visibility
    step: ThinkingStep = {
        "tool_name": "explore_revit_data",
        "justification": args.justification,
        "csharp_code": args.csharp_code,
        "category_name": None,
        "query": None,
        "status": "running",
        "result_summary": None,
    }
    ctx.deps.thinking_steps.append(step)

    try:
        result = agent_explore_revit_data(args.csharp_code, args.justification)
        step["status"] = "completed"
        step["result_summary"] = result[:500]
        return result
    except Exception as e:
        step["status"] = "error"
        step["result_summary"] = str(e)[:300]
        return f"Error executing exploration script: {str(e)}"


class SchemaSearchArgs(BaseModel):
    category_name: str = Field(description="The Revit category name to search for parameters (e.g., 'Rooms', 'Walls', 'Doors', 'Structural Columns'). Use GetMagicNames() to discover available category names if unsure.")
    justification: str = Field(description="Why you need to inspect this category's schema.")

@v4_repl_agent.tool
async def _search_schema(ctx: RunContext[AgentDeps], args: SchemaSearchArgs) -> str:
    """
    Fast parameter schema lookup for a Revit category.
    Returns parameter names, storage types, and type/instance classification.
    Results are cached in memory — instant on subsequent calls for the same category.
    Use this INSTEAD OF explore_revit_data for discovery when you just need to know
    what parameters exist for a category (names and storage types).
    This is the PREFERRED discovery tool — it's faster and more token-efficient than
    running .CombinedParams().Table().
    """
    step: ThinkingStep = {
        "tool_name": "search_schema",
        "justification": args.justification,
        "csharp_code": None,
        "category_name": args.category_name,
        "query": None,
        "status": "running",
        "result_summary": None,
    }
    ctx.deps.thinking_steps.append(step)

    # Deduplication: refuse to re-fetch the same category
    cat_lower = args.category_name.lower()
    if cat_lower in ctx.deps._searched_categories:
        step["status"] = "completed"
        step["result_summary"] = f"Already searched for '{args.category_name}'"
        return f"[DUPLICATE] Schema for '{args.category_name}' was already retrieved."

    ctx.deps._searched_categories.add(cat_lower)
    try:
        result = search_schema(args.category_name)
        step["status"] = "completed"
        step["result_summary"] = result[:300]
        return result
    except Exception as e:
        step["status"] = "error"
        step["result_summary"] = str(e)[:300]
        return f"Schema search failed: {str(e)}."


# ── read_extension_methods: REMOVED ────────────────────────────────────────
# The agent already has the full method catalog in its system prompt (26K chars).
# A separate tool to load it was redundant and caused argument-handling bugs
# with PydanticAI. The MCP has _read_extension_methods because it connects cold.
# The agent is born with the catalog.
