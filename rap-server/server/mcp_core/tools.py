"""
Shared tool implementations — single source of truth for ALL tool logic.

Both the MCP server (mcp/mcp_server.py) and the in-app agent (agent/v4_repl_agent.py)
use these implementations. Each consumer wraps them with its own transport-specific
adapters (MCP: FastMCP positional args, Agent: PydanticAI models + ThinkingSteps).

SECURITY: Checks are ALWAYS enforced. No silent fallback. If tool_helpers can't
import, the module fails LOUD at import time — not silently at runtime.
"""

import logging
from grpc_client import execute_repl, execute_script

# ── Security imports — MUST succeed ──────────────────────────────────────
from mcp_core.tool_helpers import (
    sanitize_csharp_code,
    check_paracore_compliance,
    check_dangerous_patterns,
    summarize_execution_result,
    format_execution_error,
    search_extension_methods,
)

logger = logging.getLogger("paracore-agent")


# ── Shared messages ───────────────────────────────────────────────────────

USER_REJECTED_MSG = (
    "❌ Code execution denied for this Revit session. "
    "Open Revit and approve the one-time session dialog, or restart Revit to reset."
)

READ_ONLY_VIOLATION_MSG = (
    "❌ Read-only violation: exploration code contains write operations "
    "(SetVal, Delete, Transact, etc.). Use execute_dynamic_query for writes.\n\n"
    "Error: %s"
)


# ── Core helpers ───────────────────────────────────────────────────────────

def validate_csharp(csharp_code: str) -> str | None:
    """
    Run ALL security and compliance checks on C# code.
    Returns None if clean, or a formatted error message if violations found.

    This is the SINGLE enforcement point for ALL security — both MCP and Agent
    call it. No silent fallback, no import hacks, no separate code paths.
    """
    code = sanitize_csharp_code(csharp_code)

    compliance = check_paracore_compliance(code)
    if compliance:
        logger.info(f"Anti-pattern blocked: {compliance[:200]}")
        return compliance

    danger = check_dangerous_patterns(code, agent_only=True)
    if danger:
        logger.info(f"Dangerous pattern blocked: {danger[:200]}")
        return danger

    return None


def handle_execution_result(result: dict) -> str:
    """Process a gRPC execution result dict into a user-facing string."""
    if result.get("user_rejected"):
        return USER_REJECTED_MSG
    if result.get("read_only_violation"):
        err = result.get("error_message", "Unknown violation")
        if isinstance(err, list):
            err = "; ".join(str(e) for e in err)
        return READ_ONLY_VIOLATION_MSG % err
    if result["is_success"]:
        return summarize_execution_result(result)
    return format_execution_error(result)


# ── Tool implementations ───────────────────────────────────────────────────

def explore_revit_data(
    csharp_code: str,
    justification: str,
    *,
    session_id: str = "mcp-session",
    source: str = "mcp_agent",
) -> str:
    """
    Execute a READ-ONLY C# snippet in Revit for schema/data discovery.

    Results are summarized: first 5 table rows, first 10 text lines, + totals.
    BEFORE WRITING ANY C#: read paracore://system-prompt for the method catalog.

    PARACORE-FIRST: Use extension methods (.GetStr, .GetNum, .WhereParam,
    .OrderByParam, .GroupByParam, .SumParam, .Table, etc.) instead of raw
    LINQ, FilteredElementCollector, LookupParameter, or foreach+Println.
    """
    error = validate_csharp(csharp_code)
    if error:
        return error

    logger.info(f"Exploring Revit data: {justification}")
    try:
        result = execute_repl(csharp_code, session_id,
                              execution_mode="read_only", source=source)
        return handle_execution_result(result)
    except Exception as e:
        logger.error(f"Exploration exception: {e}")
        return f"Error executing exploration script: {str(e)}"


def execute_dynamic_query(
    csharp_code: str,
    justification: str,
    *,
    session_id: str = "mcp-session",
    source: str = "mcp_agent",
) -> str:
    """
    Execute C# in Revit (read or modify). The user's final action.
    Results are summarized. SELF-CORRECTION: retry up to 3 times on errors.

    BEFORE WRITING ANY C#: read paracore://system-prompt for the method catalog.

    WRITES: el.SetVal("Comments","Done"), el.SetNum("Offset",-150,"cm"),
    el.Delete(), el.Hide(), el.Unhide(), el.Isolate() — auto-transact.
    Collection batch writes (ONE transaction): .SetParam("Comments","Done"),
    .Delete(), .Hide(), .Unhide(), .Isolate().
    Manual foreach loops: ALWAYS wrap in Transact().

    DISPLAY: ALWAYS use .Table(). NEVER foreach+Println loops.
    """
    error = validate_csharp(csharp_code)
    if error:
        return error

    logger.info(f"Executing dynamic query: {justification}")
    try:
        result = execute_repl(csharp_code, session_id, source=source)
        return handle_execution_result(result)
    except Exception as e:
        logger.error(f"Execution exception: {e}")
        return f"Error executing task script: {str(e)}"


def agent_explore_revit_data(
    csharp_code: str,
    justification: str,
) -> str:
    """
    Agent-specific wrapper: same as explore_revit_data but uses execute_script
    (the agent's gRPC path) and supports ThinkingStep recording via the caller.
    """
    error = validate_csharp(csharp_code)
    if error:
        return error

    logger.info(f"Agent exploring data: {justification}")
    try:
        result = execute_script(csharp_code, "{}", source="paracore_agent")
        return handle_execution_result(result)
    except Exception as e:
        logger.error(f"Agent exploration exception: {e}")
        return f"Error executing exploration script: {str(e)}"


def search_schema(category_name: str) -> str:
    """
    Search the model schema for parameter definitions of a Revit category.
    Returns parameter names, storage types, and whether each is Type or Instance.
    PREFERRED discovery tool — faster than running .CombinedParams().Table().
    Results are cached in memory after first call per category.
    """
    logger.info(f"Searching schema for: {category_name}")
    try:
        from mcp_core.schema_cache import search_schema as do_search
        result = do_search(category_name)
        # Append usage example so the LLM knows how to use the discovered params
        usage = (
            f"\n\n// To query {category_name}, use the parameter names above:\n"
            f'GetElements("{category_name}").Select(e => new {{ '
            f"Id = e.Id.IntegerValue, "
            f'Level = e.GetStr("Level"), '
            f'Name = e.GetStr("Name") '
            f'}}).Table()\n'
            f'// Or group by a discovered parameter:\n'
            f'GetElements("{category_name}").GroupByParam("Level").Table()'
        )
        return result + usage
    except Exception as e:
        logger.error(f"Schema search failed: {e}")
        return (
            f"Schema search failed: {str(e)}. "
            "Try explore_revit_data with .CombinedParams().Table() instead."
        )


def read_extension_methods(query: str = "") -> str:
    """
    Returns the Paracore Extension Methods reference.
    If 'query' is provided, returns only the relevant section.
    Leave empty for the full reference (capped at 15,000 chars).
    """
    from mcp_core.prompt_assembler import build_extension_reference
    doc = build_extension_reference()
    if query and query.strip():
        return search_extension_methods(query.strip(), doc)
    return doc[:15000]


def ping() -> str:
    """Diagnostic tool to verify the server is alive and responding.
    Returns 'pong' + a quick-start cheat sheet that primes the LLM context."""
    return """pong

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PARACORE QUICK-START — Read before writing any code
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GLOBALS — use EXACTLY these names (PascalCase):
  Doc          → active Revit Document
  ActiveView   → current View
  Selection    → List<Element> of selected elements
  Println(msg) → output a line of text

QUERY — use Paracore methods, NOT raw Revit API:
  GetElements("Walls")           → all elements of that category
  GetElements<Wall>()            → typed retrieval
  GetElements("Walls").Count()   → element count

  .WhereParam("Name", "value")   → filter by parameter
  .GroupByParam("Name")          → group and count → chain .Table()
  .Select(e => new { ... })      → project columns → always put Id first → .Table()
  .Table()                       → render as interactive data grid
  .First().CombinedParams().Table() → discover ALL parameters on an element

WRITE (execute_dynamic_query only — auto-transacted):
  e.SetVal("Comments", "Done")
  e.SetNum("Offset", -150, "mm")
  GetElements("Walls").SetParam("Comments", "Done")   ← bulk, one transaction
  Transact("name", () => { /* foreach with writes */ })

PROJECT INFO: Doc.ProjectInformation.Name, Doc.Title, Doc.PathName, Doc.IsWorkshared

FORBIDDEN — these raw Revit API patterns will be REJECTED:
  new FilteredElementCollector(Doc)...
  doc  /  ActiveDocument  /  activeDocument  (use Doc)
  doc.ProjectInformation  (use Doc.ProjectInformation)
  .OfCategory(BuiltInCategory.OST_...)
  foreach+Println loops for data display (use .Table())"""


def get_globals() -> str:
    """Return the complete globals + pre-imported namespaces reference."""
    return """GLOBALS — available in every Paracore script:
  Doc          → Autodesk.Revit.DB.Document (active document)
  Uidoc        → Autodesk.Revit.UI.UIDocument
  UIApp        → Autodesk.Revit.UI.UIApplication
  ActiveView   → Autodesk.Revit.DB.View (current active view)
  Selection    → List<Autodesk.Revit.DB.Element> (selected elements)

METHODS — always available (no using needed):
  Println(string)              → output a line of text
  Print(string)                → output without newline
  GetElements<T>()             → typed retrieval (e.g. GetElements<Wall>())
  GetElements(string)          → category string retrieval
  GetElement<T>(string)        → single element by name/id
  GetElement(string)           → single element by name/id
  GetMagicNames()              → all targetable category/family/class names
  GetCategories()              → all project category names
  Transact(string, Action)     → wrap writes in a single undo transaction
  Table(object)                → render as interactive data grid
  BarChart(object)             → render bar chart
  PieChart(object)             → render pie chart
  LineChart(object)            → render line chart

PRE-IMPORTED NAMESPACES (no using needed):
  System, System.Linq, System.Collections.Generic
  Autodesk.Revit.DB, Autodesk.Revit.DB.Architecture
  Autodesk.Revit.DB.Structure, Autodesk.Revit.DB.Mechanical
  Autodesk.Revit.DB.Plumbing, Autodesk.Revit.DB.Electrical
  Autodesk.Revit.UI"""

