import os
from dataclasses import dataclass
from pydantic_ai import Agent, RunContext
from pydantic import BaseModel, Field
from agent.prompt import SYSTEM_PROMPT
import logging

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
    Executes a dynamic C# snippet in the Revit Paracore Engine.
    Calling this tool will pause the agent and prompt the human for approval.
    """
    # SOVEREIGN HANDOFF: We interrupt the agent's flow by raising this custom exception.
    # The agent_router.py will catch this exception, extract the code, and send it to the UI.
    from agent.tool_helpers import sanitize_csharp_code
    raise InterruptedException(sanitize_csharp_code(args.csharp_code), args.justification)

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
        from agent.tool_helpers import sanitize_csharp_code
        code = sanitize_csharp_code(args.csharp_code)
        result = execute_script(code, "{}")
        
        if result["is_success"]:
            from agent.tool_helpers import summarize_execution_result
            return summarize_execution_result(result)
        else:
            from agent.tool_helpers import format_execution_error
            return format_execution_error(result)
            
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

# Inline fallback reference (used when EXTENSION_METHODS.md file can't be found at runtime)
# Condensed but complete — covers every method and important usage patterns.
_FALLBACK_REFERENCE = """# PARACORE EXTENSION METHODS REFERENCE

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
.WhereParam("Mark", "starts", "A")     → string comparison: starts/ends/contains
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
el.CombinedParams()    → instance + type params with Scope column
el.CombinedParams().Table() → BEST for discovering all element parameters
el.Peek()              → forensic side-by-side parameter audit (Parameter|Storage|GetStr|GetNum|UI Value)
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
    if args.query:
        from agent.tool_helpers import search_extension_methods
        return search_extension_methods(args.query, doc)
    return doc[:8000]
