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
from grpc_client import close_channel, init_channel

# ── Shared tool implementations (single source of truth) ──────────────────
# Previously: try/except import of individual helpers with silent no-op fallback.
# Now: direct import from mcp_core — if this fails, the server fails LOUD.
from mcp_core.prompt_assembler import build_prompt
from mcp_core.tools import (
    explore_revit_data,
    execute_dynamic_query,
    search_schema,
    read_extension_methods,
    ping,
    get_globals,
)

# Configure logging
# Write to %APPDATA%\paracore-data\logs\ (created by Paracore add-in installer)
# NOT to the .exe directory — Program Files is not writable without admin.
if getattr(sys, 'frozen', False):
    log_dir = os.path.join(os.getenv("APPDATA", ""), "paracore-data", "logs")
else:
    log_dir = os.path.dirname(os.path.abspath(__file__))
os.makedirs(log_dir, exist_ok=True)

log_file = os.path.join(log_dir, "paracore_mcp.log")

from logging.handlers import RotatingFileHandler
_mcp_handler = RotatingFileHandler(log_file, maxBytes=1_000_000, backupCount=3)
_mcp_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
_mcp_handler.setLevel(logging.INFO)

logger = logging.getLogger("paracore-mcp")
logger.setLevel(logging.INFO)
logger.addHandler(_mcp_handler)
logger.info(f"MCP Logging initialized at {log_file}")

# Initialize FastMCP Server
# Server-level instructions: injected into LLM context on EVERY turn.
# This is the nuclear option — critical anti-patterns the LLM MUST know
# before writing any code, even if it skips _ping and _read_extension_methods.
mcp = FastMCP(
    "Paracore",
    instructions="""CRITICAL RULES — violations will be rejected:

GLOBALS (use EXACTLY these — PascalCase):
  Doc (NOT doc, NOT ActiveDocument, NOT activeDocument)
  ActiveView, Selection, Println()

QUERY (use Paracore methods, NOT raw Revit API):
  GetElements("Walls")  — NOT new FilteredElementCollector(Doc)
  GetElements<Wall>()   — typed retrieval
  .WhereParam("Name", "value")  — NOT .Where(e => e.Property)
  .Table()  — NOT foreach+Println loops

FORBIDDEN — these WILL fail:
  new FilteredElementCollector(...)  → use GetElements()
  doc / ActiveDocument               → use Doc
  LookupParameter / get_Parameter    → use .GetStr() / .GetNum()
  .AsString() / .AsDouble()          → use .GetStr() / .GetNum()
  Console.WriteLine()                → use Println()

START EVERY SESSION WITH:
  1. _ping  → confirms connectivity + shows full cheat sheet
  2. _read_extension_methods()  → loads complete method catalog
  Then explore. Never write code before these two steps."""
)

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
def _ping() -> str:
    """
    Verify the Paracore MCP server is alive and connected to Revit.
    ALWAYS call this FIRST at the start of every session.

    OUTPUT: Returns "pong" if connected, PLUS a mandatory quick-start
    cheat sheet with globals, query patterns, write patterns, and
    forbidden API patterns. READ THE CHEAT SHEET before writing any code.

    FAILURE: If the server is not running, this tool will not be available
    at all (the MCP client will report a connection error).
    """
    return ping()


@mcp.tool()
def _explore_revit_data(csharp_code: str, justification: str) -> str:
    """
    Execute a READ-ONLY C# snippet in Revit to explore model data.
    Use this to DISCOVER parameter names, check element counts, verify values
    exist, or inspect schema — anything that DOES NOT modify the model.

    Do NOT use this for modifications. Use execute_dynamic_query for writes.

    The 'csharp_code' must be valid C# top-level statements. The engine has
    all Revit namespaces pre-imported. Prefer Paracore extension methods
    (.GetStr, .WhereParam, .GroupByParam, .Table, etc.) over raw LINQ and
    FilteredElementCollector.

    OUTPUT: Summarized results — tables show first 5 rows + total count,
    text output shows first 10 lines. Charts report their type. Empty results
    return "No results found" with the query context.

    FAILURE: Returns a structured error with the error type, line number,
    and a suggested fix. Common failures: wrong parameter name (run
    search_schema first), missing Transact() around a foreach loop, or
    accidentally including write operations (SetVal, Delete) in read-only mode.
    """
    return explore_revit_data(csharp_code, justification)


@mcp.tool()
def _execute_dynamic_query(csharp_code: str, justification: str) -> str:
    """
    Execute C# in Revit — supports both reads AND writes. This is the tool
    for the user's FINAL action after discovery is complete.

    Do NOT use this for initial exploration — use explore_revit_data or
    search_schema first. This tool is ONLY for the final result after
    discovery is complete. Unlike explore_revit_data, this tool runs
    without read-only restrictions and supports model modifications.

    WRITE OPERATIONS (auto-transact — no Transact() needed):
      Single element: .SetVal("Comments","Done"), .SetNum("Offset",-150,"cm"),
        .Delete(), .Hide(), .Unhide(), .Isolate()
      Collection bulk (one transaction): .SetParam("Comments","Done"),
        .Delete(), .Hide(), .Unhide(), .Isolate()

    Manual foreach loops with writes MUST wrap in Transact("name", () => {...}).

    DISPLAY: Always use .Table() for data, never foreach+Println loops.
    For .Select() tables, include Id as the first column.

    OUTPUT: Summarized — tables (first 5 rows + total), text (first 10 lines),
    charts (type reported). Write operations include a confirmation message.

    FAILURE: Structured error with type, line number, and suggested fix.
    Self-correct up to 3 times. Common failures: wrong parameter name,
    missing Transact() on foreach, or trying to chain .Select() after
    .GroupByParam() (chain .Table() directly instead).
    """
    return execute_dynamic_query(csharp_code, justification)


@mcp.tool()
def _search_schema(category_name: str) -> str:
    """
    Fast parameter schema lookup for a Revit category. Use this INSTEAD of
    explore_revit_data when you just need to know what parameters exist for
    a category — it's faster and cheaper than running live C#.

    PREFERRED for discovery. Results are cached in memory after the first
    call per category — instant on subsequent calls.

    'category_name' is a Revit category string. Common values: "Rooms",
    "Walls", "Doors", "Floors", "Ceilings", "Windows", "Structural Columns",
    "Structural Framing", "Ducts", "Pipes". For unknown categories, use
    GetMagicNames() via explore_revit_data to discover available names.

    OUTPUT: A compact list of parameter names with storage types (String,
    Double, Integer, ElementId) and scope (Instance / Type). Copy ONLY the
    parameter name — do NOT include [String] or [Double] annotations in
    your code.

    FAILURE: If the category is not found, returns an error suggesting you
    try explore_revit_data with .CombinedParams().Table() instead. This is
    rare — most standard Revit category names work directly.
    """
    return search_schema(category_name)


@mcp.tool()
def _read_extension_methods() -> str:
    """
    Returns the complete Paracore Extension Methods reference (~7,400 chars).
    Call this BEFORE writing any code — it's the equivalent of reading the
    docs before coding. This single call loads every method signature, every
    parameter description, and every usage pattern into context.

    Call with NO arguments. Always returns the full catalog.

    Use this FIRST, before explore_revit_data or execute_dynamic_query.
    Knowing the methods prevents guessing, hallucinated method names,
    and the raw Revit API patterns that will be rejected.

    OUTPUT: ~7,400 chars of Markdown covering GetStr, GetNum, WhereParam,
    GroupByParam, Table, Select, SetVal, SetNum, SetParam, CombinedParams,
    Delete, Hide, BarGraph, PieGraph, LineGraph, and everything else.

    FAILURE: Always available — no network or Revit dependency.
    """
    return read_extension_methods()


# ── System prompt resource ──────────────────────────────────────────────
# Prompt content lives in agent/prompts/*.md — single source of truth.
# Previously: 131-line MCP_SYSTEM_PROMPT inline string + import from agent.prompt.
# Now: assembled from composable .md files via prompt_assembler.build_prompt("mcp").

_MCP_SYSTEM_PROMPT: str | None = None


@mcp.resource("paracore://system-prompt")
def read_system_prompt() -> str:
    """Paracore REPL method catalog and rules. Read this FIRST before using any tools."""
    global _MCP_SYSTEM_PROMPT
    if _MCP_SYSTEM_PROMPT is not None:
        return _MCP_SYSTEM_PROMPT
    _MCP_SYSTEM_PROMPT = build_prompt("mcp")
    return _MCP_SYSTEM_PROMPT


@mcp.resource("paracore://globals")
def read_globals() -> str:
    """Complete list of globals, methods, and pre-imported namespaces. Use when unsure what variables/types are available."""
    return get_globals()


# ── End of inline MCP_SYSTEM_PROMPT replacement ──────────────────────────


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
