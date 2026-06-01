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

@mcp.tool()
def ping() -> str:
    """Diagnostic tool to verify the MCP server is alive and responding."""
    return "pong"



@mcp.tool()
def explore_revit_data(csharp_code: str, justification: str) -> str:
    """
    Executes a C# snippet SILENTLY in Revit to fetch data without mutating the model.
    DO NOT use standard Revit API. This is the Paracore REPL with a specialized fluent API.
    Globals: Doc, UIDoc, ActiveView, Selection.
    The LAST EXPRESSION is auto-returned (no Print/return needed).
    Results are summarized: tables return first 5 rows + total count, text returns first 10 lines.
    For full data, the user must have the Paracore native desktop app (rap-web).

    SYNTAX CHEAT SHEET:
    - GetElements<Room>().Count()         → count rooms
    - GetElements<Wall>()                 → all walls
    - GetElements("Doors")                → by category name
    - GetElement("name")                  → single element by name
    - el.GetStr("Level")                  → "Level 1" (smart string)
    - el.GetNum("Area", "m2")             → 25.46 (unit-converted)
    - el.GetVal("Width")                  → "300 mm" (as in Revit UI)
    - .WhereParam("Level", "Level 1")     → filter by param
    - .WhereMatches("Single-Flush")       → fuzzy name filter
    - .OrderByParam("Area")               → sort ascending
    - .OrderByParamDesc("Area")            → sort descending
    - .GroupByParam("Level", "Area", "m2") → group + sum
    - .SumParam("Area", "m2")             → total
    - .Select(x => new { ... }).Table()   → data grid
    - .Select(x => new { ... }).BarGraph() → bar chart
    - .Select(x => new { ... }).PieGraph() → pie chart
    - el.CombinedParams().Table()         → discover all parameters
    - el.Peek()                           → forensic audit
    - Transact("name", () => { ... })     → wrap model changes

    For full reference, read paracore://extension-methods.
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
            return f"Execution Failed: {result['error_message']}\nDetails: {result['error_details']}"
    except Exception as e:
        logger.error(f"MCP Exploration Exception: {e}")
        return f"Error executing exploration script: {str(e)}"

@mcp.tool()
def execute_dynamic_query(csharp_code: str, justification: str) -> str:
    """
    Executes a C# snippet in Revit. Use for the user's final query (read or write).
    DO NOT use standard Revit API. Use Paracore fluent API (same syntax as explore_revit_data).
    Write: el.SetVal("Comments", "Done"), el.SetNum("Offset", 500, "mm"),
           .SetParam("Mark", "W-01") for bulk, .Delete() for BIM-safe delete.
    All writes must be in Transact("name", () => { ... }) unless using SetVal/Delete.
    Results are summarized: tables return first 5 rows + total count, text returns first 10 lines.
    For full data, the user must have the Paracore native desktop app (rap-web).
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
            return f"Execution Failed: {result['error_message']}\nDetails: {result['error_details']}"
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


# Resources
@mcp.resource("paracore://system-prompt")
def read_system_prompt() -> str:
    """The fundamental AI System Prompt that defines Paracore's entire REPL behavioral workflow."""
    global _CACHED_SYSTEM_PROMPT
    if _CACHED_SYSTEM_PROMPT is not None:
        return _CACHED_SYSTEM_PROMPT
    try:
        from agent.prompt import SYSTEM_PROMPT
        _CACHED_SYSTEM_PROMPT = SYSTEM_PROMPT
        return SYSTEM_PROMPT
    except Exception as e:
        logger.error(f"Error loading system prompt: {e}")
        return "Error loading prompt."

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
    return "Please read the paracore://api-docs resource, get the current Revit context, and then write a C# query to analyze the model for any anomalous elements."

if __name__ == "__main__":
    init_channel()
    logger.info("Starting Paracore FastMCP Server via stdio...")
    try:
        mcp.run(transport="stdio")
    finally:
        close_channel()
        logger.info("FastMCP Server closed.")
