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

# Summarizer for token-efficient tool returns (works for both MCP and web)
try:
    from agent.summarizer import summarize
except ImportError:
    def summarize(x): return json.dumps(x)  # fallback

# Configure logging
if getattr(sys, 'frozen', False):
    # Log next to the executable in bundled mode
    log_dir = os.path.dirname(sys.executable)
else:
    log_dir = os.path.dirname(os.path.abspath(__file__))

log_file = os.path.join(log_dir, "mcp_debug.log")
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    filename=log_file,
    filemode='a'
)
logger = logging.getLogger("paracore-mcp")
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

    CRITICAL SYNTAX (the ONLY valid Paracore methods):
      GetElements<Room>()   GetElements("Walls")   GetElement("name")
      x.GetStr("Level") → "Level 1"    x.GetNum("Area","m2") → 25.46
      x.GetVal("Width") → "300 mm"     x.GetInt("Count") → 4
      .WhereParam("Level","Level 1")  .WhereMatches("Single")
      .OrderByParam("Area")  .OrderByParamDesc("Area")
      .GroupByParam("Level")  .GroupByParam("Level","Area","m2")
      .SumParam("Area","m2")  .Select(x=>new{x.Id,Name=x.GetStr("Name")}).Table()
      x.SetVal("Mark","101")  x.SetNum("Offset",-150,"cm")
      .BarGraph() .PieGraph() .LineGraph() — zero arguments
      Transact("name",()=>{foreach(var w in walls){w.SetVal(...);}})
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
            output_raw = {
                "structuredOutput": result.get("structured_output", []),
                "output": result.get("output", ""),
                "internal_data": result.get("internal_data", ""),
            }
            return summarize(output_raw)
        else:
            err_msg = result.get('error_message', 'Unknown error')
            err_detail = result.get('error_details', '')
            return f"Execution Failed: {err_msg}" + (f"\nDetails: {err_detail}" if err_detail else "")
    except Exception as e:
        logger.error(f"MCP Exploration Exception: {e}")
        return f"Error executing exploration script: {str(e)}"

@mcp.tool()
def execute_dynamic_query(csharp_code: str, justification: str) -> str:
    """
    Execute C# in Revit (read or modify). User's final action.
    Same syntax as explore_revit_data. Results summarized.
    SELF-CORRECTION: retry up to 3 times on errors.

    WRITES: el.SetVal("Comments","Done"), el.SetNum("Offset",-150,"cm"),
    .Delete() for BIM-safe delete.
    Loop mods: Transact("name",()=>{foreach(var w in walls){w.SetVal(...);w.SetNum(...);}}).
    ALWAYS wrap multi-element writes in Transact().

    For verification: use GetStr for clean names (e.g. "Level 02"),
    not GetVal (which adds "Up to level:" prefix).
    For .Select() tables: ALWAYS include Id=c.Id as the first column.
    """
    logger.info(f"MCP Executing Query: {justification}")
    try:
        result = execute_repl(csharp_code, "mcp-session")
        if result["is_success"]:
            output_raw = {
                "structuredOutput": result.get("structured_output", []),
                "output": result.get("output", ""),
                "internal_data": result.get("internal_data", ""),
            }
            return summarize(output_raw)
        else:
            err_msg = result.get('error_message', 'Unknown error')
            err_detail = result.get('error_details', '')
            return f"Execution Failed: {err_msg}" + (f"\nDetails: {err_detail}" if err_detail else "")
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
    NativeProperties, GeometrySummary, AuditClashes, InputUnit, OutputUnit, Matches,
    FamilyName, RoomAccess, RoomDestination, Handing, IsStandardDoor, and more.
    """
    path = _get_resource_path("EXTENSION_METHODS.md")
    global _CACHED_EXTENSION_METHODS
    _CACHED_EXTENSION_METHODS = _load_resource(path, _CACHED_EXTENSION_METHODS)
    doc = _CACHED_EXTENSION_METHODS
    if query and query.strip():
        words = [w.strip().lower() for w in query.split() if len(w.strip()) > 1]
        lines = doc.split("\n")
        results = []

        # Try 1: match section headers containing any word
        for word in words:
            in_section = False
            for line in lines:
                if line.startswith("## ") or line.startswith("# "):
                    in_section = word in line.lower()
                if in_section:
                    results.append(line)
                if len(results) > 200:
                    break
            if results:
                return "\n".join(results)

        # Try 2: keyword search with context
        match_indices = {i for i, line in enumerate(lines) if any(word in line.lower() for word in words)}
        if match_indices:
            # Expand to include surrounding context (2 lines each direction)
            expanded = set()
            for i in match_indices:
                for j in range(max(0, i - 2), min(len(lines), i + 3)):
                    expanded.add(j)
            # Group into contiguous blocks
            blocks = []
            block = []
            for i in sorted(expanded):
                if block and i > block[-1] + 1:
                    if block:
                        blocks.append(block)
                    block = []
                block.append(i)
            if block:
                blocks.append(block)
            # Build output with separators between blocks
            out = []
            for b in blocks:
                if out:
                    out.append("---")
                for i in b:
                    out.append(lines[i])
                if len(out) > 80:
                    break
            return f"Found references to '{query}':\n" + "\n".join(out)
        return f"No matches for '{query}'. Full reference start:\n\n{doc[:3000]}"
    return doc[:8000]


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
ONLY use methods listed here or standard C# LINQ. Nothing else exists.

## GLOBALS (C# PascalCase — lowercase variants do NOT work)
Doc, Uidoc, UIApp, ActiveView, Selection, Println(text)
Doc.Title, ActiveView.Name, Selection.Count — work directly
Println($"text") — C# PascalCase output. No println(), Print(), Console.WriteLine().

## RETRIEVAL
GetElements<Wall>()               GetElements("Doors")
GetElements<FamilyInstance>("Doors")   GetElement("id-or-name")
GetCategories()   GetMagicNames()

## ACCESSORS (on elements — methods, NOT standalone functions)
wall.GetStr("Level")           → "Level 1" (smart, resolves ElementIds)
wall.GetNum("Area", "m2")      → 25.46 (unit-converted numeric)
wall.GetVal("Width")           → "300 mm" (WYSIWYG, as in Properties palette)
wall.GetInt("Count")           → 4 (yes/no → 1/0)
wall.SetVal("Mark", "101")     → auto-transact setter
wall.SetNum("Offset", -150, "cm") → unit-aware numeric setter

Native props work directly: el.Id, el.Name, el.Symbol, el.Location
NEVER use: .IntegerValue, .AsString(), .AsDouble(), LookupParameter,
  get_Parameter, BuiltInParameter, FilteredElementCollector

## COLLECTION EXTENSIONS (fluent, on IEnumerable<Element>)
.WhereParam("Level", "Level 1")        .WhereParam("Area", ">", 25, "m2")
.WhereMatches("Single-Flush")
.OrderByParam("Area")   .OrderByParamDesc("Area")
.GroupByParam("Level")   .GroupByParam("Level", "Area", "m2")
.SumParam("Area", "m2")

## FLUENT ENDERS (zero arguments)
.Select(x => new { x.Id, Name = x.GetStr("Name") }).Table()
.Select(...).BarGraph()   .PieGraph()   .LineGraph()

## MODIFICATION
element.SetVal("Comments", "Done")    element.SetNum("Offset", -150, "cm")
Transact("name", () => { foreach(var w in walls) { w.SetVal(...); } })
## STANDARD LINQ
.Where() .Select() .GroupBy() .OrderBy() .ThenBy()
.Count() .Sum() .First() .FirstOrDefault() .ToList()

## COMMON PATTERNS
Query: GetElements("Walls").WhereParam("Level","Level 1").Select(w => new { w.Id, Name = w.GetStr("Name") }).Table()
Write: Transact("Update", () => { foreach(var w in walls) { w.SetVal("Comments","Done"); } })
Simple: Doc.Title   ActiveView.Name   Selection.Count   GetElements<Wall>().Count()
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
