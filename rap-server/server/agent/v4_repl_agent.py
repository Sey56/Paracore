import os
import json
from dataclasses import dataclass
from pydantic_ai import Agent, RunContext
from pydantic import BaseModel, Field
from agent.prompt import SYSTEM_PROMPT
import logging

try:
    from grpc_client import execute_script
except ImportError:
    import sys
    import os
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

v4_repl_agent = Agent(
    deps_type=AgentDeps,
    system_prompt=SYSTEM_PROMPT
)

# Lightweight agent with NO tools — only formats summaries conversationally
summary_agent = Agent(
    deps_type=AgentDeps,
    system_prompt="""You format Paracore REPL execution results in natural language.
Keep it brief — 2-4 sentences max. Use the sample data and totals from the summary.

If the summary shows data with a table:
  "Here are the N items. [Key observation from data]."
If the summary says "no structured output":
  "No matching elements were found. [Suggest refining]."
Never add code blocks. Never mention tools or formatting instructions. Just natural language."""
)
class DynamicQueryArgs(BaseModel):
    csharp_code: str = Field(description="The C# snippet to execute in the Paracore REPL.")
    justification: str = Field(description="A short explanation of why you are running this code.")

@v4_repl_agent.tool
async def execute_dynamic_query(ctx: RunContext[AgentDeps], args: DynamicQueryArgs) -> str:
    """
    Executes a dynamic C# snippet in the Revit Paracore Engine.
    Calling this tool will pause the agent and prompt the human for approval.
    """
    # SOVEREIGN HANDOFF: We interrupt the agent's flow by raising this custom exception.
    # The agent_router.py will catch this exception, extract the code, and send it to the UI.
    raise InterruptedException(args.csharp_code, args.justification)

class ExploreQueryArgs(BaseModel):
    csharp_code: str = Field(description="The C# snippet to execute silently for schema and parameter discovery ONLY.")
    justification: str = Field(description="Why you need to inspect the schema before generating the final query.")

@v4_repl_agent.tool
async def explore_revit_data(ctx: RunContext[AgentDeps], args: ExploreQueryArgs) -> str:
    """
    Executes a dynamic C# snippet SILENTLY in Revit and returns the output to you immediately.
    CRITICAL: This tool is STRICTLY for schema discovery (e.g., inspecting `.CombinedParams().Take(1)`). 
    DO NOT use this tool to fetch the final data the user asked for. 
    You MUST use `execute_dynamic_query` to fetch the actual user data so it runs through the UI approval process!
    """
    try:
        # We auto-inject Take(20) at the end if Table() or CombinedParams is used to prevent token flooding
        # But for now we trust the LLM or handle the shield in the router.
        logger.info(f"Agent Exploring Data: {args.justification}")
        
        result = execute_script(args.csharp_code, "{}")
        
        if result["is_success"]:
            output_str = ""
            if result.get("structured_output"):
                output_str = json.dumps(result["structured_output"])
            else:
                output_str = str(result.get("output", "Execution succeeded with no output."))
            
            # The Shield: Truncate massive outputs to prevent context flooding
            if len(output_str) > 8000:
                output_str = output_str[:8000] + "\n... [TRUNCATED: Result exceeded 8000 characters. Refine your query, e.g., use .Take(10) or filter further.]"
            return output_str
        else:
            return f"Execution Failed: {result['error_message']}\nDetails: {result['error_details']}"
            
    except Exception as e:
        return f"Error executing exploration script: {str(e)}"


class SchemaSearchArgs(BaseModel):
    category_name: str = Field(description="The Revit category name to search for parameters (e.g., 'Rooms', 'Walls', 'Doors', 'Structural Columns'). Use GetMagicNames() to discover available category names if unsure.")
    justification: str = Field(description="Why you need to inspect this category's schema.")

@v4_repl_agent.tool
async def search_schema(ctx: RunContext[AgentDeps], args: SchemaSearchArgs) -> str:
    """
    Fast parameter schema lookup for a Revit category.
    Returns parameter names, storage types, and type/instance classification.
    Results are cached in memory — instant on subsequent calls for the same category.
    Use this INSTEAD OF explore_revit_data for discovery when you just need to know
    what parameters exist for a category (names and storage types).
    This is the PREFERRED discovery tool — it's faster and more token-efficient than
    running .CombinedParams().Table().
    """
    logger.info(f"Agent searching schema for: {args.category_name} — {args.justification}")
    try:
        from services.schema_cache import search_schema as do_search
        return do_search(args.category_name)
    except Exception as e:
        logger.error(f"Schema search failed for {args.category_name}: {e}")
        return f"Schema search failed: {str(e)}. Try using explore_revit_data with .CombinedParams().Table() instead."


# Cache the extension methods doc in memory
_ext_methods_cache: str | None = None


def _load_extension_methods_doc() -> str:
    global _ext_methods_cache
    if _ext_methods_cache is not None:
        return _ext_methods_cache
    # Resolve path relative to repo root (v4_repl_agent.py is at server/agent/)
    agent_dir = os.path.dirname(os.path.abspath(__file__))
    server_dir = os.path.dirname(agent_dir)
    rap_server_dir = os.path.dirname(server_dir)
    repo_root = os.path.dirname(rap_server_dir)
    doc_path = os.path.join(repo_root, "EXTENSION_METHODS.md")
    try:
        with open(doc_path, "r", encoding="utf-8") as f:
            _ext_methods_cache = f.read()
        logger.info(f"Loaded EXTENSION_METHODS.md ({len(_ext_methods_cache)} chars)")
        return _ext_methods_cache
    except Exception as e:
        logger.warning(f"Failed to load EXTENSION_METHODS.md: {e}")
        return f"Extension methods reference not found at {doc_path}"


class ExtensionMethodsArgs(BaseModel):
    """No arguments — returns the full Paracore extension methods reference."""
    query: str = Field(default="", description="Optional: a specific method or topic to search for (e.g., 'GetStr', 'WhereParam', 'Table', 'BarGraph'). Leave empty for the full reference.")


@v4_repl_agent.tool
async def read_extension_methods(ctx: RunContext[AgentDeps], args: ExtensionMethodsArgs) -> str:
    """
    Returns the complete Paracore Extension Methods reference (EXTENSION_METHODS.md).
    Call this when you need to check the EXACT syntax, parameters, or behavior of any
    Paracore extension method. The full reference covers:
    - Element accessors: GetStr, GetNum, GetVal, GetInt, SetVal, SetNum
    - Collection extensions: WhereParam, WhereMatches, SumParam, GroupByParam, OrderByParam, OrderByParamDesc
    - Visualization: Table, BarGraph, PieGraph, LineGraph, Peek
    - Diagnostics: CombinedParams, BuiltInParams, InstanceParams, TypeParams, NativeProperties
    - Geometry: GeometrySummary
    - Coordination: AuditClashes
    - Units: InputUnit, OutputUnit, IsAlmostEqualTo, AlmostZero
    - Element identity: Matches, FamilyName, ToElement
    - Door/Window: RoomAccess, RoomDestination, Handing, IsStandardDoor
    - Materials: Materials, MaterialNames, Eco.GetCarbon, Eco.GetUValue
    If a specific method name is provided in 'query', only the relevant section is returned.
    This is your PRIMARY reference for correct Paracore syntax. Use it whenever you're
    unsure about a method name, argument order, or whether something exists in Paracore.
    """
    doc = _load_extension_methods_doc()
    if args.query:
        query = args.query.strip()
        # Find the section containing the query
        lines = doc.split("\n")
        results = []
        in_section = False
        section_header = ""
        for i, line in enumerate(lines):
            if line.startswith("## ") or line.startswith("# "):
                in_section = query.lower() in line.lower()
                section_header = line
            if in_section:
                results.append(line)
                if len(results) > 200:  # limit section size
                    break
        if results:
            return "\n".join(results)
        # Fallback: search the whole doc for mentions
        relevant = [line for line in lines if query.lower() in line.lower()]
        if relevant:
            return f"Found references to '{query}':\n" + "\n".join(relevant[:50])
        return f"No specific section found for '{query}'. Here is the beginning of the full reference:\n\n{doc[:3000]}"
    # Return a trimmed version — first 8000 chars covers the core API
    return doc[:8000]
