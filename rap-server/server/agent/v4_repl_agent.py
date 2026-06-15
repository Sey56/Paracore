import os
from dataclasses import dataclass, field
from typing import Optional, TypedDict
from pydantic_ai import Agent, RunContext
from pydantic_ai.usage import RunUsage
from pydantic import BaseModel, Field
from agent.prompt import SYSTEM_PROMPT
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
    _read_queries: set[str] = field(default_factory=set)
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
    from agent.tool_helpers import sanitize_csharp_code, check_paracore_compliance
    code = sanitize_csharp_code(args.csharp_code)

    # Anti-pattern guard: catch raw Revit API before human sees bad code
    compliance = check_paracore_compliance(code)
    if compliance:
        return compliance  # agent self-corrects; human never sees bad code

    # SOVEREIGN HANDOFF: We interrupt the agent's flow by raising this custom exception.
    # The agent_router.py will catch this exception, extract the code, and send it to the UI.
    raise InterruptedException(code, args.justification)

class ExploreQueryArgs(BaseModel):
    csharp_code: str = Field(description="The C# snippet to execute silently for schema and parameter discovery ONLY.")
    justification: str = Field(description="Why you need to inspect the schema before generating the final query.")

@v4_repl_agent.tool
async def explore_revit_data(ctx: RunContext[AgentDeps], args: ExploreQueryArgs) -> str:
    """
    Execute a READ-ONLY C# snippet SILENTLY in Revit for schema/data discovery.
    Returns summarized output to you immediately — the user does NOT see this.
    STRICTLY for discovery (e.g., .CombinedParams().Table(), .Peek()).
    Use execute_dynamic_query for the final user-facing result.

    BEFORE WRITING ANY C#: read the system prompt for the complete Paracore
    method catalog. Use extension methods (.GetStr, .GetNum, .WhereParam,
    .OrderByParam, .GroupByParam, .SumParam, .Table, etc.) instead of raw
    LINQ, FilteredElementCollector, LookupParameter, or foreach+Println.
    """
    try:
        logger.info(f"Agent Exploring Data: {args.justification}")
        from agent.tool_helpers import sanitize_csharp_code, check_paracore_compliance
        code = sanitize_csharp_code(args.csharp_code)

        # Record thinking step for UI visibility
        step: ThinkingStep = {
            "tool_name": "explore_revit_data",
            "justification": args.justification,
            "csharp_code": code,
            "category_name": None,
            "query": None,
            "status": "running",
            "result_summary": None,
        }
        ctx.deps.thinking_steps.append(step)

        # Anti-pattern guard: catch raw Revit API before execution
        compliance = check_paracore_compliance(code)
        if compliance:
            step["status"] = "completed"
            step["result_summary"] = compliance[:300]
            return compliance

        result = execute_script(code, "{}")

        if result["is_success"]:
            from agent.tool_helpers import summarize_execution_result
            summary = summarize_execution_result(result)
            step["status"] = "completed"
            step["result_summary"] = summary[:500]
            return summary
        else:
            from agent.tool_helpers import format_execution_error
            error_msg = format_execution_error(result)
            step["status"] = "error"
            step["result_summary"] = error_msg[:500]
            return error_msg

    except Exception as e:
        if step:
            step["status"] = "error"
            step["result_summary"] = str(e)[:300]
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
        step["result_summary"] = f"Already searched for '{args.category_name}' — use the data from your previous call."
        return f"[DUPLICATE] Schema for '{args.category_name}' was already retrieved. Use the parameter names from the earlier result — do NOT search for the same category again."
    ctx.deps._searched_categories.add(cat_lower)
    try:
        from services.schema_cache import search_schema as do_search
        result = do_search(args.category_name)
        step["status"] = "completed"
        step["result_summary"] = result[:300]
        return result
    except Exception as e:
        logger.error(f"Schema search failed for {args.category_name}: {e}")
        step["status"] = "error"
        step["result_summary"] = str(e)[:300]
        return f"Schema search failed: {str(e)}. Try using explore_revit_data with .CombinedParams().Table() instead."


# Cache the extension methods doc in memory
_ext_methods_cache: str | None = None

# Inline fallback reference (used when EXTENSION_METHODS.md file can't be found at runtime)
# Condensed but complete — covers every method and important usage patterns.
_FALLBACK_REFERENCE = """# PARACORE EXTENSION METHODS REFERENCE

Full Revit API available: Autodesk.Revit.DB, UI, Architecture — all namespaces.
Wall.Create, Floor.Create, FilteredElementCollector, XYZ, Line.CreateBound, etc. work.
This IS the Revit API. Transact() REQUIRED for foreach loops (clean undo). Single-element (.SetVal/.Delete) and collection bulk (.SetParam) auto-transact. Reads work everywhere.
For parameter access and data queries, prefer the Paracore extensions below.

## Globals (C# PascalCase)
Doc, Uidoc, UIApp, ActiveView, Selection, Println(text)
Doc.Title → project name. ActiveView.Name → view name. Selection.Count → selection count.
Println($"text") for output. The REPL auto-displays the last expression — no Println needed at the end.

## Retrieval
GetElements<Wall>()          — typed, all Wall instances
GetElements<WallType>()      — all Wall type definitions
GetElements<Room>()          — all rooms
GetElements("Walls")         — by category string (the part after OST_ prefix)
GetElements<FamilyInstance>("Doors") — typed + category-filtered
GetElement("id-or-name")     — single element by name or ID
GetCategories()              — list of category strings
GetMagicNames()              — list of all targetable category/family/class names

## Element Accessors (on any element — e.g. wall, room, door)
Extensions — parameters are STRINGS. Never use LookupParameter or get_Parameter.
el.GetStr("Level")            → "Level 1" (smart string, resolves ElementIds to names)
el.GetStr("Length", "mm")     → "3600" (unit-converted string)
el.GetNum("Area")             → raw internal feet value
el.GetNum("Area", "m2")       → unit-converted numeric (e.g. 25.46)
el.GetVal("Width")            → "300 mm" (WYSIWYG, as seen in Revit Properties palette)
el.GetVal("Width", "mm")      → "300 mm" (with unit suffix)
el.GetInt("Count")            → integer (yes/no returns 1/0)
el.SetVal("Comments", "Done") → single-element write, auto-transacts
el.SetVal("Level", "Level 2") → resolves name to ElementId automatically
el.SetVal("Base Offset", "500 mm") → parses value + unit string
el.SetVal("Pinned", true)     → native C# property set via Reflection
el.SetNum("Offset", -150, "cm") → unit-aware numeric write, auto-transacts
el.SetNum("Length", 3.5, "m")   → converts 3.5m to internal feet, then sets

Native C# properties work directly — no accessor needed:
el.Id, el.Name (Type Name on instances), el.Symbol, el.Location, el.Area
Wall.WallType → the WallType element. Room.Area → area in internal units.
NEVER use: el.LookupParameter(), el.get_Parameter(), el.AsString(), el.IntegerValue

## Collection Extensions (on IEnumerable<Element>, fluent, no foreach needed)
.WhereParam("Level", "Level 1")        → filter by parameter string (case-insensitive)
.WhereParam("Mark", "starts", "A")     → string: starts/ends/contains, !=/not/notcontains/notstarts/notends
.WhereParam("Width", "!=", 200, "mm")  → numeric: >, <, >=, <=, !=/not
.WhereParam("Area", ">", 25, "m2")     → numeric comparison: >, <, >=, <=
.WhereParam("Width", 200, "mm")        → exact numeric filter (tolerance 0.001)
.WhereMatches("Single-Flush")          → fuzzy name/family filter (case-insensitive)
.OrderByParam("Area")                  → sort ascending (auto-detects numeric vs string)
.OrderByParamDesc("Area")              → sort descending
.GroupByParam("Level")                 → group → count table
.GroupByParam("Level", "Area", "m2")   → group → count + sum table
.SumParam("Area", "m2")                → total numeric sum as double
.SetParam("Comments", "Done")          → bulk write (COLLECTION-level, NOT on individual element)

## Fluent Enders (ZERO arguments, chain directly after .Select())
.Table()      — interactive data grid
.BarGraph()   — bar chart
.PieGraph()   — pie chart
.LineGraph()  — line chart

.Table() usage:
  ALWAYS use .Select() before .Table() — never .Table() on raw elements.
  Every .Select() includes Id as the first property.
  Example: .Select(r => new { r.Id, Name = r.GetStr("Name"), Area_m2 = r.GetNum("Area", "m2") }).Table()
  Magic header suffixes: name properties Area_m2 or Length_mm for auto-formatting.

## Diagnostics (on elements)
## Diagnostics (on single elements — NO arguments, fluent-chained)
el.CombinedParams()    → Native + Instance + Type params with Scope column. ZERO args.
el.CombinedParams().Table() → BEST for discovering all element parameters
el.CombinedParams().Peek() → forensic Parameter|Storage|GetStr|GetNum|UI Value audit
NATIVE properties: use dot accessor directly (rm.Area.OutputUnit("m2")), no GetStr/GetNum needed.
INSTANCE/TYPE params: use .GetStr("Name") or .GetNum("Name", "unit").
el.BuiltInParams()     → BuiltInParameter identifiers (Name|BIP|Value)
el.InstanceParams()    → instance parameters only (Name|Storage|Value)
el.TypeParams()        → type parameters only
el.NativeProperties()  → key Revit API properties (Level, Workset, Location, etc.)
el.GeometrySummary()   → volume/area/solid breakdown
el.ParamsDict()        → Dictionary<string,string> of all parameters

## Units (on numbers — double, int, decimal)
.InputUnit("mm")       → human value → internal feet. Example: 300.InputUnit("mm")
.OutputUnit("m2")      → internal feet → human. Example: val.OutputUnit("m2", 2)
.RoundTo("mm", 0)      → snap internal value to clean unit target
.IsAlmostEqualTo(val)  → fuzzy equality (1e-9 tolerance)
.AlmostZero()          → essentially zero?
.IsLessThan(val)       → precision less-than
.IsGreaterThan(val)    → precision greater-than
.IsPositive()          → strictly positive
.IsNegative()          → strictly negative
.FormatUnit("mm")      → formatted string with suffix (e.g. "3600.0 mm")
.FormatValueOnly("mm") → numeric string without suffix (e.g. "3600")
Revit internal = decimal feet. Sum internals first, then convert:
  g.Sum(w => w.GetNum("Volume")).OutputUnit("m3")  — correct
NOT: g.Sum(w => w.GetNum("Volume").OutputUnit("m3")) — floating-point noise

## Standard C# LINQ (works everywhere)
CRITICAL: Always check Paracore extension methods first. ONLY fallback to LINQ (e.g. .Where(), .Select(), .GroupBy()) if a simpler Paracore extension method (e.g. .WhereParam(), .GroupByParam()) does not exist. Do not overcomplicate queries.
.Where() .Select() .GroupBy() .OrderBy() .ThenBy()
.Count() .Sum() .First() .FirstOrDefault() .Distinct() .ToList()

## Modification Patterns
Single element:
  el.SetVal("Comments", "Done") — auto-transacts, no wrapper needed.
  el.SetNum("Offset", -150, "cm") — auto-transacts with unit conversion.

Multi-element loop (ALWAYS wrap in Transact to share one transaction):
  var walls = GetElements("Walls").WhereParam("Base Constraint", "Level 01").ToList();
  Transact("Update walls", () => {
      foreach (var w in walls) {
          w.SetVal("Top Constraint", "Level 02");
          w.SetNum("Top Offset", -150, "cm");
      }
  });
  The engine detects the active Transact and skips individual auto-transactions.

Multi-element bulk (one-liner, no loop needed):
  GetElements("Doors").WhereParam("Level", "Level 1").SetParam("Comments", "Done")
  .SetParam() is collection-level ONLY — use on IEnumerable, NOT on individual elements.

Delete:
  el.Delete() — single element delete, auto-transacts.
  GetElements("Doors").Delete() — bulk delete, BIM-Smart (skips pinned/curtain elements).

## REPL Behavior
The REPL is like Python IDLE — the last expression is auto-displayed.
No Println() needed for the final line. No .ToList() needed before .Table().
Count: .Count for simple lists, .Count() for LINQ chains.
Variables stay alive between runs in the same session.

For complete examples and full details, read paracore://extension-methods.
"""


def _load_extension_methods_doc() -> str:
    global _ext_methods_cache
    if _ext_methods_cache is not None:
        return _ext_methods_cache
    # Try multiple paths
    paths = []
    # 1. Repo root (dev mode)
    agent_dir = os.path.dirname(os.path.abspath(__file__))
    server_dir = os.path.dirname(agent_dir)
    rap_server_dir = os.path.dirname(server_dir)
    repo_root = os.path.dirname(rap_server_dir)
    paths.append(os.path.join(repo_root, "EXTENSION_METHODS.md"))
    # 2. Server directory (installed mode)
    paths.append(os.path.join(server_dir, "EXTENSION_METHODS.md"))
    # 3. Running directory
    paths.append(os.path.join(os.getcwd(), "EXTENSION_METHODS.md"))
    
    for doc_path in paths:
        try:
            with open(doc_path, "r", encoding="utf-8") as f:
                _ext_methods_cache = f.read()
            logger.info(f"Loaded EXTENSION_METHODS.md from {doc_path} ({len(_ext_methods_cache)} chars)")
            return _ext_methods_cache
        except (FileNotFoundError, OSError):
            continue
    
    logger.warning("EXTENSION_METHODS.md not found in any path, using inline fallback reference.")
    _ext_methods_cache = _FALLBACK_REFERENCE
    return _ext_methods_cache


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
    - Units: InputUnit, OutputUnit, IsAlmostEqualTo, AlmostZero
    - Element identity: Matches, FamilyName, ToElement
    - Door/Window: RoomAccess, RoomDestination, Handing, IsStandardDoor
    If a specific method name is provided in 'query', only the relevant section is returned.
    This is your PRIMARY reference for correct Paracore syntax. Use it whenever you're
    unsure about a method name, argument order, or whether something exists in Paracore.
    """
    doc = _load_extension_methods_doc()
    step: ThinkingStep = {
        "tool_name": "read_extension_methods",
        "justification": f"Looking up: {args.query or 'full reference'}",
        "csharp_code": None,
        "category_name": None,
        "query": args.query or "(full reference)",
        "status": "running",
        "result_summary": None,
    }
    ctx.deps.thinking_steps.append(step)

    # Deduplication: refuse to re-fetch the same query
    query_key = (args.query or "").strip().lower()
    if query_key and query_key in ctx.deps._read_queries:
        step["status"] = "completed"
        step["result_summary"] = f"Already looked up '{args.query}' — use the docs from your previous call."
        return f"[DUPLICATE] Documentation for '{args.query}' was already retrieved. Use the method signatures from the earlier result — do NOT call read_extension_methods for the same query again."
    if query_key:
        ctx.deps._read_queries.add(query_key)

    if args.query:
        from agent.tool_helpers import search_extension_methods
        result = search_extension_methods(args.query, doc)
        step["status"] = "completed"
        step["result_summary"] = f"Found {len(result)} chars of documentation for '{args.query}'"
        return result
    step["status"] = "completed"
    step["result_summary"] = f"Returned full reference ({len(doc[:8000])} chars)"
    return doc[:8000]
