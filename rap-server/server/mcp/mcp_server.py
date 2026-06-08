import os
import sys

# Handle PyInstaller bundle paths
if getattr(sys, 'frozen', False):
    # In a bundle, the root is sys._MEIPASS
    base_dir = sys._MEIPASS
    # Add the base directory to path so internal imports work
    if base_dir not in sys.path:
        sys.path.insert(0, base_dir)
else:
    # In development mode, up one level from 'mcp' folder to 'server'
    current_dir = os.path.dirname(os.path.abspath(__file__))
    base_dir = os.path.dirname(current_dir)
    if base_dir not in sys.path:
        sys.path.insert(0, base_dir)

def _get_resource_path(filename: str) -> str:
    """Resolve a bundled resource file path for both frozen and dev modes."""
    if getattr(sys, 'frozen', False):
        # PyInstaller extracts --add-data files into sys._MEIPASS
        return os.path.join(sys._MEIPASS, filename)
    else:
        # Dev mode: up 4 levels from mcp_server.py to Paracore repo root
        repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
        return os.path.join(repo_root, filename)

import json
import logging
from mcp.server.fastmcp import FastMCP

# Now we can safely import from grpc_client (which is in base_dir/server or base_dir)
from grpc_client import close_channel, execute_repl, execute_script, get_context, init_channel

# Shared tool helpers (summarize, extension method search, etc.)
try:
    from agent.tool_helpers import summarize_execution_result, format_execution_error, search_extension_methods
except ImportError:
    # Fallback for when agent package isn't available
    def summarize_execution_result(x):
        from agent.summarizer import summarize
        return summarize(x)
    def format_execution_error(result):
        err = result.get('error_message', 'Unknown error')
        det = result.get('error_details', '')
        return f"Execution Failed: {err}" + (f"\nDetails: {det}" if det else "")
    def search_extension_methods(query, doc):
        return doc[:8000] if doc else "No reference available."

# Configure logging
if getattr(sys, 'frozen', False):
    # Log next to the executable in bundled mode
    log_dir = os.path.dirname(sys.executable)
else:
    log_dir = os.path.dirname(os.path.abspath(__file__))

log_file = os.path.join(log_dir, "mcp_debug.log")

from logging.handlers import RotatingFileHandler
_mcp_handler = RotatingFileHandler(log_file, maxBytes=1_000_000, backupCount=3)
_mcp_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
_mcp_handler.setLevel(logging.INFO)

logger = logging.getLogger("paracore-mcp")
logger.setLevel(logging.INFO)
logger.addHandler(_mcp_handler)
logger.info(f"MCP Logging initialized at {log_file}")

# Initialize FastMCP Server
mcp = FastMCP("Paracore")

# Cache resource files in memory at startup (read once, serve from RAM)
_CACHED_SYSTEM_PROMPT: str | None = None
_CACHED_REPL_GUIDE: str | None = None
_CACHED_EXTENSION_METHODS: str | None = None


def _load_resource(path: str, cache: str | None) -> str:
    """Load and cache a resource file. Returns cached copy on subsequent calls."""
    if cache is not None:
        return cache
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception:
        return f"Resource not found: {path}"

# Eagerly load resources at startup (prevent LLM from fetching full 32K docs at runtime)
_CACHED_REPL_GUIDE = _load_resource(_get_resource_path("REPL_GUIDE.md"), None)
_CACHED_EXTENSION_METHODS = _load_resource(_get_resource_path("EXTENSION_METHODS.md"), None)
logger.info(f"MCP resources cached: REPL_GUIDE={len(_CACHED_REPL_GUIDE)} chars, EXTENSION_METHODS={len(_CACHED_EXTENSION_METHODS)} chars")

@mcp.tool()
def ping() -> str:
    """Diagnostic tool to verify the MCP server is alive and responding."""
    return "pong"



@mcp.tool()
def explore_revit_data(csharp_code: str, justification: str) -> str:
    """
    Silent read-only C# execution in Revit. For discovery/validation only.
    Results summarized: first 5 rows of tables, first 10 lines of text, + totals.
    SELF-CORRECTION: retry up to 3 times on errors. Use paracore://extension-methods.

    PARACORE-FIRST: Use Paracore extensions for filter/sort/group/display. BANNED LINQ:
    .Where(), .OrderBy(), .OrderByDescending(), .Sum() on collections. Use .WhereParam,
    .OrderByParam, .OrderByParamDesc, .SumParam instead. ALLOWED: .GroupBy(lambda) for
    multi-key grouping, .Select(x=>new{...}) for projection, .Take/.Skip/.First/.FirstOrDefault.
    DISPLAY: ALWAYS use .Table(). NEVER foreach+Println+string.Join for data display.
    NEVER chain `.Select()` after `.GroupByParam()`. Simply chain `.Table()` directly.

    CRITICAL SYNTAX (the ONLY valid Paracore methods):
      GetElements<Room>()   GetElements("Walls")   GetElement("name")
      x.GetStr("Level") → "Level 1"    x.GetNum("Area","m2") → 25.46
      x.GetVal("Width") → "300 mm"     x.GetInt("Count") → 4
      .WhereParam("Level","Level 1")  .WhereMatches("Single")
      .OrderByParam("Area")  .OrderByParamDesc("Area")
      .GroupByParam("Level")  .GroupByParam("Level","Area","m2")
      .SumParam("Area","m2")  .Select(x=>new{x.Id,Name=x.GetStr("Name")}).Table()
      x.SetVal("Mark","101")  x.SetNum("Offset",-150,"cm")
      x.Delete() — BIM-safe (skips Pinned/Curtain)  x.Hide()  x.Unhide()  x.Isolate()
      .SetParam("Comments","Done") — bulk write, ONE transaction
      .Delete() — bulk delete on collection, ONE transaction
      .BarGraph() .PieGraph() .LineGraph() — zero arguments
      Transact("name",()=>{foreach(var w in walls){w.SetVal(...);w.Delete();}})
      Println($"text") — output (capital P — NOT println, NOT Print, NOT Console.WriteLine)
      x.Id (NOT .IntegerValue)  x.Name  x.Symbol — native props work directly

    CRITICAL: NO raw Revit API (FilteredElementCollector, BuiltInParameter,
    LookupParameter, get_Parameter, .AsString(), ElementId, doc.GetElement).
    Parameters are STRINGS. Units are BUILT-IN. No unit conversion math.
    """
    logger.info(f"MCP Exploring Data: {justification}")
    try:
        result = execute_repl(csharp_code, "mcp-session")
        
        if result["is_success"]:
            return summarize_execution_result(result)
        else:
            return format_execution_error(result)
    except Exception as e:
        logger.error(f"MCP Exploration Exception: {e}")
        return f"Error executing exploration script: {str(e)}"

@mcp.tool()
def execute_dynamic_query(csharp_code: str, justification: str) -> str:
    """
    Execute C# in Revit (read or modify). User's final action.
    Same syntax as explore_revit_data. Results summarized.
    SELF-CORRECTION: retry up to 3 times on errors.

    PARACORE-FIRST: Use Paracore extensions. BANNED LINQ: .Where(), .OrderBy(),
    .OrderByDescending(), .Sum() on collections. Use .WhereParam, .OrderByParam, etc.
    ALLOWED: .GroupBy(lambda) multi-key, .Select(x=>new{...}) projection, .Take/.Skip/.First.
    DISPLAY: ALWAYS use .Table(). NEVER foreach+Println+string.Join loops.
    NEVER chain `.Select()` after `.GroupByParam()`. Chain `.Table()` directly.

    WRITES (all auto-transact when no outer Transact exists):
    el.SetVal("Comments","Done"), el.SetNum("Offset",-150,"cm"),
    el.Delete(), el.Hide(), el.Unhide(), el.Isolate().
    Collection batch writes (ONE transaction for all):
    .SetParam("Comments","Done"), .Delete(), .Hide(), .Unhide(), .Isolate().
    Manual foreach loops: ALWAYS wrap in Transact():
    Transact("name",()=>{foreach(var w in walls){w.SetVal(...);w.Delete();}}).
    Inside Transact, all methods detect the active transaction — no sub-transactions.

    For verification: use GetStr for clean names (e.g. "Level 02"),
    not GetVal (which adds "Up to level:" prefix).
    For .Select() tables: ALWAYS include Id=c.Id as the first column.
    """
    logger.info(f"MCP Executing Query: {justification}")
    try:
        result = execute_repl(csharp_code, "mcp-session")
        if result["is_success"]:
            return summarize_execution_result(result)
        else:
            return format_execution_error(result)
    except Exception as e:
         return f"Error executing task script: {str(e)}"


@mcp.tool()
def search_schema(category_name: str) -> str:
    """
    Search the model schema for parameter definitions of a Revit category.
    Returns parameter names, storage types, and whether each is Type or Instance.
    PREFERRED discovery tool — faster than running .CombinedParams().Table().
    Results are cached in memory after first call per category.
    Example categories: "Rooms", "Walls", "Doors", "Structural Columns", "Floors", "Ceilings".
    Use GetMagicNames() to discover available category names if unsure.
    CRITICAL: Only copy the parameter NAME (first column). NEVER include storage type
    annotations like [String] or [Double] in your code. e.g. use "Level" not "Level [String]".
    """
    logger.info(f"MCP Searching schema for: {category_name}")
    try:
        from services.schema_cache import search_schema as do_search
        return do_search(category_name)
    except Exception as e:
        logger.error(f"Schema search failed: {e}")
        return f"Schema search failed: {str(e)}. Try explore_revit_data with .CombinedParams().Table() instead."


@mcp.tool()
def read_extension_methods(query: str = "") -> str:
    """
    Returns the complete Paracore Extension Methods reference.
    Call this when you need to check the EXACT syntax of any Paracore method.
    If 'query' is provided (e.g., "GetStr", "WhereParam", "Table"), returns only
    the relevant section. Leave empty for the full reference.
    Covers: GetStr, GetNum, GetVal, GetInt, SetVal, SetNum, WhereParam, WhereMatches,
    SumParam, GroupByParam, OrderByParam, OrderByParamDesc, Table, BarGraph, PieGraph,
    LineGraph, Peek, CombinedParams, BuiltInParams, InstanceParams, TypeParams,
    NativeProperties, GeometrySummary, InputUnit, OutputUnit, Matches,
    FamilyName, RoomAccess, RoomDestination, Handing, IsStandardDoor, and more.
    """
    path = _get_resource_path("EXTENSION_METHODS.md")
    global _CACHED_EXTENSION_METHODS
    _CACHED_EXTENSION_METHODS = _load_resource(path, _CACHED_EXTENSION_METHODS)
    doc = _CACHED_EXTENSION_METHODS
    if query and query.strip():
        return search_extension_methods(query.strip(), doc)
    return doc[:15000]  # return generous portion when explicitly requesting full reference


# Resources
@mcp.resource("paracore://system-prompt")
def read_system_prompt() -> str:
    """Paracore REPL method catalog and rules. Read this FIRST before using any tools."""
    global _CACHED_SYSTEM_PROMPT
    if _CACHED_SYSTEM_PROMPT is not None:
        return _CACHED_SYSTEM_PROMPT
    try:
        from agent.prompt import SYSTEM_PROMPT
        _CACHED_SYSTEM_PROMPT = SYSTEM_PROMPT
        return SYSTEM_PROMPT
    except ImportError:
        pass
        
    _CACHED_SYSTEM_PROMPT = MCP_SYSTEM_PROMPT
    return _CACHED_SYSTEM_PROMPT


MCP_SYSTEM_PROMPT = """# PARACORE REPL — COMPLETE METHOD CATALOG
You are generating C# code for the Paracore REPL engine in Revit.

## LINQ RULES — PARACORE FIRST — CHECK THIS TABLE BEFORE WRITING CODE
  ┌──────────────────────────────┬──────────────────────────────────┐
  │ INSTEAD OF RAW C# LINQ       │ USE PARACORE                     │
  ├──────────────────────────────┼──────────────────────────────────┤
  │ .Where(e => e.Property)      │ .WhereParam("Name", "value")     │
  │ .Where(e => name.Contains)   │ .WhereMatches("pattern")         │
  │ .Where(fi => !IsCurtain...)  │ .StandardOnly()                  │
  │ .OrderBy(e => e.GetNum(...)) │ .OrderByParam("Name")            │
  │ .OrderByDescending(...)      │ .OrderByParamDesc("Name")        │
  │ .GroupBy(e => "Name")        │ .GroupByParam("Name")            │
  │   .Select(g => new {...})    │   .Table() [chain directly]      │
  │ .Sum(e => e.GetNum(...))     │ .SumParam("Name", "unit")        │
  ├──────────────────────────────┼──────────────────────────────────┤
  │ DISPLAY DATA                 │ .Table() ALWAYS                  │
  │ foreach + Println loop       │ .Select(x => new {...}).Table()  │
  └──────────────────────────────┴──────────────────────────────────┘
ALLOWED LINQ (no Paracore equivalent): .GroupBy(lambda) multi-key,
  .Select(x=>new{}) for projection, .Take/.Skip/.First/.FirstOrDefault/.Any
WARNING: Paracore `.Select()` = Select in Revit UI (highlight elements).
  For data projection use LINQ `.Select(x => new {...})`.
NEVER chain LINQ `.Select()` after `.GroupByParam()`. Chain `.Table()` directly:
  GetElements<Wall>().GroupByParam("Base Constraint").Table()

## DISPLAY RULES
ALWAYS use .Table() to display data. NEVER foreach+Println+string.Join loops.
.Table() = interactive sortable grid. Println() = status messages only.

## GLOBALS
Doc, Uidoc, UIApp, ActiveView, Selection, Println(text)
Doc.Title, ActiveView.Name, Selection.Count — work directly

## RETRIEVAL
GetElements<Wall>()   GetElements("Doors")   GetElements<FamilyInstance>("Doors")
GetElement("id-or-name")   GetCategories()   GetMagicNames()

## ACCESSORS (on elements)
wall.GetStr("Level")→"Level 1"  wall.GetNum("Area","m2")→25.46
wall.GetVal("Width")→"300 mm"   wall.GetInt("Count")→4
wall.SetVal("Mark","101")  wall.SetNum("Offset",-150,"cm")
wall.Delete()  wall.Hide()  wall.Unhide()  wall.Isolate()
Native: el.Id  el.Name  el.Symbol  el.Location

## ELEMENT CREATION — Full Revit API inside Transact()
Wall.Create  Floor.Create  Doc.Create.NewFamilyInstance  XYZ  Line.CreateBound  CurveLoop
  var lvl = GetElements<Level>().FirstOrDefault(l => l.Name == "Level 1");
  var typ = GetElements<WallType>().FirstOrDefault(t => t.Name == "Generic - 200mm");
  Transact("Create Wall", () => { Wall w = Wall.Create(Doc, Line.CreateBound(p1,p2), lvl.Id, false); w.WallType = typ; });

## COLLECTION EXTENSIONS
.WhereParam("Level","Level 1")  .WhereParam("Area",">",25,"m2")
.WhereMatches("Single-Flush")   .StandardOnly()
.OrderByParam("Area")   .OrderByParamDesc("Area")
.GroupByParam("Level")→Group|Count  .GroupByParam("Level","Area","m2")→Group|Count|Total
.SumParam("Area","m2")  // GroupByParam args: (groupBy, sumParam?, unit?)
.SetParam("Comments","Done") — bulk write, ONE transaction
.Delete() — BIM-safe bulk delete  .Hide()  .Unhide()  .Isolate()

## FLUENT ENDERS
.Table()  .BarGraph()  .PieGraph()  .LineGraph()  .Show()  .ToNotebook("Name")
.Table() rules: GroupByParam→chain directly. Raw collection→.Select() first with explicit columns.
  ✓ .GroupByParam("Level").Table()
  ✗ GetElements("Walls").Table() — dumps hundreds of columns
  ✗ .SetParam(...).Table() — same issue
  ✓ .Select(x => new { x.Id, Name = x.GetStr("Name") }).Table()
CHARTS: .GroupByParam("Level","Area","m2").BarGraph() picks Total automatically.

## DISCOVERY & DEBUG
.CombinedParams().Table() — EVERY param (Instance+Type+Native) with exact names
.Peek()  .BuiltInParams().Table()  .InstanceParams().Table()
.TypeParams().Table()  .NativeProperties().Table()  .GeometrySummary().Table()
el.ReflectionProperties()  el.ReflectionMethods()  el.ParamsDict()

## COORDINATION
.AuditClashes("TargetCategory")  .AuditClashes("Pipes","5mm")
.AuditClashes(...).Table() — interactive clash grid with 3D helpers
Doc.ClearClashHelpers()

## MATERIALS & ECO
el.Materials()  el.MaterialNames()  el.GetMaterialNames()
Eco.GetCarbon(el) — kgCO2e   Eco.GetUValue(el) — W/m²K   Eco.GetWeather()

## NUMERIC HELPERS (on double)
.InputUnit("mm")  .OutputUnit("m2",2)  .RoundTo("mm",0)
.IsAlmostEqualTo(v)  .AlmostZero()  .IsGreaterThan(v)  .IsLessThan(v)
.IsPositive()  .IsNegative()  .FormatValueOnly("mm",2)

## DOOR ORIENTATION
fi.RoomAccess()  fi.RoomDestination()  fi.RoomFrom()  fi.RoomTo()
fi.Handing()→"LH"/"RH"  fi.HingeSide()→"Left"/"Right"
fi.IsHandFlipped()  fi.IsFacingFlipped()  fi.IsStandardDoor()

## MODIFICATION
Fluent chain (no Transact needed): GetElements("Walls").SetParam("Comments","Done")
Delete chain: GetElements("Generic Models").WhereMatches("TEMP").Delete()
Manual foreach: Transact("name",()=>{foreach(var w in walls){w.SetVal(...);w.Delete();}})

## PARAMETER DISCOVERY — CRITICAL
Diff categories use DIFF param names. No universal "Level":
  Walls→"Base Constraint"  Structural Columns→"Base Level"  Rooms→"Level"
ALWAYS: GetElements("Cat").First().CombinedParams().Table() before using any param name.

## COMMON PATTERNS
Group:  GetElements("Doors").GroupByParam("Level").Table()
Query:  GetElements("Walls").WhereParam("Base Constraint","Level 1").Select(w => new { w.Id, Name = w.GetStr("Name") }).Table()
Write:  GetElements("Walls").WhereParam(...).SetParam("Comments","Done")
Delete: GetElements("Generic Models").WhereMatches("TEMP").Delete()
Loop:   Transact("Update",()=>{foreach(var w in walls){w.SetVal("Comments","Done");}})
Clash:  GetElements("Walls").AuditClashes("StructuralColumns").Table()
"""

@mcp.resource("paracore://repl-guide")
def read_repl_guide() -> str:
    """The authoritative REPL Guide describing magic category hydration strings and retrieval shortcuts."""
    global _CACHED_REPL_GUIDE
    path = _get_resource_path("REPL_GUIDE.md")
    _CACHED_REPL_GUIDE = _load_resource(path, _CACHED_REPL_GUIDE)
    return _CACHED_REPL_GUIDE

@mcp.resource("paracore://extension-methods")
def read_extension_methods() -> str:
    """The complete technical reference for all fluent element getters/setters, properties, and formatting tools."""
    global _CACHED_EXTENSION_METHODS
    path = _get_resource_path("EXTENSION_METHODS.md")
    _CACHED_EXTENSION_METHODS = _load_resource(path, _CACHED_EXTENSION_METHODS)
    return _CACHED_EXTENSION_METHODS

# Prompts
@mcp.prompt()
def analyze_revit_model() -> str:
    """Prompt template for analyzing the current Revit model Health."""
    return "First, read paracore://system-prompt for the complete Paracore method catalog. Then explore the Revit model."

if __name__ == "__main__":
    init_channel()
    logger.info("Starting Paracore FastMCP Server via stdio...")
    try:
        mcp.run(transport="stdio")
    finally:
        close_channel()
        logger.info("FastMCP Server closed.")
