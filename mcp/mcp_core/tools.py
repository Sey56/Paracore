"""
Shared tool implementations — single source of truth for ALL tool logic.

Both the MCP server (mcp/mcp_server.py) and the in-app agent (agent/v4_repl_agent.py)
use these implementations. Each consumer wraps them with its own transport-specific
adapters (MCP: FastMCP positional args, Agent: PydanticAI models + ThinkingSteps).

SECURITY: Checks are ALWAYS enforced. No silent fallback. If tool_helpers can't
import, the module fails LOUD at import time — not silently at runtime.
"""

import glob
import logging
import os
import tempfile
import threading
import time
import uuid
from contextlib import contextmanager

from grpc_client import execute_repl
from mcp_core.metrics import record_tool_call

# ── Security imports — MUST succeed ──────────────────────────────────────
from mcp_core.tool_helpers import (
    sanitize_csharp_code,
    check_paracore_compliance,
    check_dangerous_patterns,
    check_suspicious_param_names,
    lint_paracore_conventions,
    summarize_execution_result,
    format_execution_error,
    search_extension_methods,
)

# ⚠ ONE logger for the whole shared core. It used to be the repo's own name
# ("paracore-gen" / "paracore-model" / ...), which is the ONLY line that differed between
# the five copies of this file. The per-repo name is now the log HANDLER's
# (`server.setup_logging(domain, ...)`), so the record still lands in the right file.
logger = logging.getLogger("paracore-mcp")


# ── Session state — workflow enforcement ─────────────────────────────────
# Soft guardrails: _execute_dynamic_query warns if no discovery happened first.
# Doesn't block — the user may have legitimate reasons to skip discovery.
# Resets on server restart (module-level state).

class _SessionState:
    def __init__(self):
        self.ping_called = False
        self.discovery_calls = 0       # _explore_revit_data or _search_schema
        self.modification_calls = 0    # _execute_dynamic_query

    def record_ping(self):            self.ping_called = True
    def record_discovery(self):       self.discovery_calls += 1
    def record_modification(self):    self.modification_calls += 1

    def workflow_warning(self) -> str | None:
        """Return a warning if modification is attempted without prior discovery."""
        if self.modification_calls > 0 and self.discovery_calls == 0:
            return (
                "WORKFLOW WARNING: _execute_dynamic_query called without any "
                "prior discovery (_explore_revit_data or _search_schema). "
                "Verify you have the correct parameter names and element counts "
                "before modifying the model. A bad parameter name returns empty "
                "results — indistinguishable from 'no matches.'\n\n"
            )
        return None

_SESSION = _SessionState()


# ── Single-flight guard — retry-storm protection ─────────────────────────────
# Revit's API is single-threaded. If a client times out and retries while the original
# request is STILL EXECUTING, the retry queues behind it. Repeat that and the queue grows
# until Revit has to be restarted — this is the documented failure mode of Autodesk's own
# Revit MCP server ("only a full restart clears it"), triggered by an impatient client that
# assumes failure at ~30s.
#
# We do NOT queue. A second concurrent request fails fast with an explicit "do not retry"
# instruction, so the client stops instead of piling on. A refusal is cheap; a wedged Revit
# is not.

_EXEC_LOCK = threading.Lock()
_EXEC_STARTED_AT: float | None = None
_EXEC_LABEL: str = ""


class RevitBusy(Exception):
    """Raised when a request arrives while another is still executing in Revit."""

    def __init__(self, label: str, elapsed: float):
        self.label = label
        self.elapsed = elapsed
        super().__init__(f"{label} running for {elapsed:.1f}s")


# ── The dialog watcher's read-back channel ───────────────────────────────
# ⚠⚠ WHY THIS EXISTS: a Revit failure dialog BLOCKS the tool call, and the resident
#   watcher closes it so the call can return — but the edit Revit refused has
#   already been rolled back. Without this note the agent sees a SUCCESS and then
#   cannot find the element it believes it created ("I created the Wall Opening —
#   where did it go?"). The note says what the dialog said and which button was
#   pressed, so the agent can ADJUST instead of re-trying blindly.
def _watcher():
    """The resident dialog watcher, resolved the way grpc_client resolves it."""
    import sys as _sys
    for _name in ("mcp_core.dialog_watcher", "forge_core.dialog_watcher"):
        _mod = _sys.modules.get(_name)
        if _mod is not None:
            return _mod
    return None


def _drain_dialogs() -> list:
    """Take (and clear) the dialogs the watcher answered. [] when there are none."""
    mod = _watcher()
    if mod is None:
        return []
    try:
        return mod.pop_captured()
    except Exception:
        return []


def _dialog_note() -> str:
    """Render the watcher's records as a note appended to the tool result."""
    notes = _drain_dialogs()
    if not notes:
        return ""
    lines = ["", "",
             "⚠ REVIT SHOWED A DIALOG WHILE THIS CALL RAN — the watcher answered it to unblock you."]
    for n in notes:
        # ⚠⚠ REPORT THE TITLE. A Revit failure TaskDialog carries the SAME title as the Revit
        #   main window ("Autodesk Revit 2025"), so the title alone never identifies the dialog —
        #   but it is the first thing a human reads, and for a NON-failure dialog it is the only
        #   thing that says what the dialog WAS. The watcher captures it; this is where the
        #   agent gets to see it.
        title = (n.get("title") or "").strip()
        if title:
            lines.append("   title   : %s" % title)
        # ⚠ `message` is the dialog's failure text, read CROSS-PROCESS from its Edit control.
        #   `text` is the Static/SysLink fallback, which a Revit failure dialog leaves EMPTY.
        msg = (n.get("message") or "").strip()
        if msg:
            lines.append("   message : %s" % msg)
        elif (n.get("text") or "").strip():
            lines.append("   dialog  : %s" % n["text"].strip())
        btns = ", ".join(n.get("buttons") or []) or "(none)"
        pressed = n.get("pressed") or "(left for the operator)"
        lines.append("   buttons : %s   ->   pressed: %s" % (btns, pressed))
        # ⚠ WHICH button, and WHY — `keep` pressed OK, so the edit survived; `discard` pressed
        #   Cancel, so Revit ROLLED THE EDIT BACK; `needs-human` was deliberately left alone.
        action = n.get("action")
        if action:
            reason = (n.get("reason") or "").strip()
            lines.append("   action  : %s%s" % (action, (" — %s" % reason) if reason else ""))
        # ⚠ An UNCONFIRMED close is its own hazard: the click was sent but the dialog stayed up.
        if n.get("pressed") and n.get("closed") is False:
            lines.append("   ⚠ the button was pressed but the dialog did NOT close — it may still be up.")
    lines.append("   ⚠ If Revit reported an ERROR, the edit may have been ROLLED BACK — verify the")
    lines.append("     element exists before assuming success, then adjust the operation.")
    return "\n".join(lines)


@contextmanager
def single_flight(label: str):
    """Allow exactly one in-flight Revit execution. Refuse (never queue) a second."""
    global _EXEC_STARTED_AT, _EXEC_LABEL

    if not _EXEC_LOCK.acquire(blocking=False):
        started = _EXEC_STARTED_AT if _EXEC_STARTED_AT is not None else time.perf_counter()
        raise RevitBusy(_EXEC_LABEL or "a previous request", time.perf_counter() - started)

    # ⚠ Clear stale watcher records so a dialog from a PREVIOUS call cannot be
    #   reported against this one (a call that raised after a dialog would leave one).
    _drain_dialogs()
    _EXEC_STARTED_AT = time.perf_counter()
    _EXEC_LABEL = label
    try:
        yield
    finally:
        _EXEC_STARTED_AT = None
        _EXEC_LABEL = ""
        _EXEC_LOCK.release()


def busy_message(exc: RevitBusy) -> str:
    """The explicit 'do not retry' signal. Deliberately blunt — the client must stop."""
    return (
        "REVIT IS BUSY — request refused. Nothing was executed.\n\n"
        f"'{exc.label}' has been running for {exc.elapsed:.1f}s and has not returned yet.\n\n"
        "DO NOT RETRY. Revit's API is single-threaded, so a retry queues behind the request "
        "that is still running, and repeated retries can wedge Revit until it is restarted.\n\n"
        "What to do instead:\n"
        "  1. Wait for the current operation to finish.\n"
        "  2. If it never finishes, ask the user to check Revit for a modal dialog.\n"
        "  3. Then confirm Revit responds again with a small query before continuing."
    )


# ── Shared messages ───────────────────────────────────────────────────────

# ⚠⚠ TWO DIFFERENT "THE HUMAN SAID NO"s arrive as the same `user_rejected` flag:
#   the SESSION gate (a person clicked Block on the one-time dialog) and the
#   [Confirm("WORD")] gate (a person declined the word). They need different advice,
#   so they are told apart by `session_consent` / `confirmation` — never by guessing
#   from the text. USER_REJECTED_MSG stays as the fallback for an engine too old to
#   report either, where the honest answer is that we do not know which one it was.
SESSION_DENIED_MSG = (
    "⛔ The operator DENIED agent code execution for this Revit session.\n"
    "Nothing was executed. This is a human decision, not a fault — do not retry it and do "
    "not try to work around it. The block stands until Revit is restarted, and only the "
    "person at the machine can approve it."
)

CONFIRM_DECLINED_MSG = (
    "⛔ The operator declined the confirmation this script requires, so nothing was "
    "executed. Ask them whether to run it again, and only if they agree."
)

USER_REJECTED_MSG = (
    "Code execution denied for this Revit session. "
    "Open Revit and approve the one-time session dialog, or restart Revit to reset."
)

READ_ONLY_VIOLATION_MSG = (
    "Read-only violation: exploration code contains write operations "
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


def _consent_note(result: dict) -> str:
    """One line stating WHO allowed this run — or that no gate was involved.

    ⚠⚠ WHY (2026-10-25): without this a caller could not tell "a person approved agent
    execution for this Revit session" from "there was no gate at all" — both came back as
    a plain success. MEASURED: the operator clicked Allow on the session dialog and the
    tool result said nothing whatsoever about it; the only way to know was to ask them.
    """
    consent = (result.get("session_consent") or "").strip()
    if consent == "granted":
        return ("\n\n🔓 Session consent: the operator ALLOWED agent code execution for this "
                "Revit session — they saw the dialog and clicked Allow.")
    if consent == "already_granted":
        return ("\n\n🔓 Session consent: already granted earlier in this Revit session, so "
                "no dialog was shown for this call.")
    return ""


def handle_execution_result(result: dict, source_code: str = "") -> str:
    """Process a gRPC execution result dict into a user-facing string.

    `source_code` is the snippet that was submitted — passed to the error
    formatter so a compile failure can quote the offending line (see
    tool_helpers.format_execution_error).
    """
    consent = (result.get("session_consent") or "").strip()
    if result.get("user_rejected"):
        # ⚠ Two different human refusals share this flag — tell them apart by the
        #   recorded reason, never by the text (see the message definitions above).
        if consent == "denied":
            return SESSION_DENIED_MSG
        if (result.get("confirmation") or "") == "user_declined":
            return CONFIRM_DECLINED_MSG
        return USER_REJECTED_MSG
    if result.get("read_only_violation"):
        err = result.get("error_message", "Unknown violation")
        if isinstance(err, list):
            err = "; ".join(str(e) for e in err)
        return READ_ONLY_VIOLATION_MSG % err
    if result["is_success"]:
        return summarize_execution_result(result) + _consent_note(result) + _dialog_note()
    return format_execution_error(result, source_code) + _consent_note(result) + _dialog_note()


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

    Results are summarized: tables show up to 50 rows (every row if the table is that
    small or smaller) plus a total count; text output shows the first 20 lines.
    BEFORE WRITING ANY C#: read paracore://system-prompt for the method catalog.

    PARACORE-FIRST: Use extension methods (.GetStr, .GetNum, .WhereParam,
    .OrderByParam, .GroupByParam, .SumParam, .Table, etc.) instead of raw
    LINQ, FilteredElementCollector, LookupParameter, or foreach+Println.
    """
    t0 = time.perf_counter()
    error = validate_csharp(csharp_code)
    if error:
        record_tool_call("explore_revit_data", False, (time.perf_counter() - t0) * 1000,
                         anti_pattern_blocked=True)
        return error

    param_warning = check_suspicious_param_names(csharp_code)
    suspicious_count = 1 if param_warning else 0
    # Advisory only — never blocks. Cheap regex pass, no round-trip cost.
    lint_note = lint_paracore_conventions(csharp_code)
    _SESSION.record_discovery()
    logger.info(f"Exploring Revit data: {justification}")
    try:
        with single_flight(justification or "an explore request"):
            result = execute_repl(csharp_code, session_id,
                                  execution_mode="read_only", source=source)
        duration_ms = (time.perf_counter() - t0) * 1000
        record_tool_call("explore_revit_data", result.get("is_success", False),
                         duration_ms, suspicious_params=suspicious_count,
                         lint_notes=1 if lint_note else 0)
        return param_warning + (lint_note or "") + handle_execution_result(result, csharp_code)
    except RevitBusy as busy:
        duration_ms = (time.perf_counter() - t0) * 1000
        record_tool_call("explore_revit_data", False, duration_ms, refused_busy=True)
        logger.warning(f"Refused concurrent explore request: {busy}")
        return busy_message(busy)
    except Exception as e:
        duration_ms = (time.perf_counter() - t0) * 1000
        record_tool_call("explore_revit_data", False, duration_ms)
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
    Results are summarized. SELF-CORRECTION: fix the reported cause, then retry ONCE.
    Repeating an identical call is pointless — it fails the same way.

    BEFORE WRITING ANY C#: call the read_extension_methods tool (NOT inside C# —
    it's a separate MCP tool call) to look up method syntax. The catalog in your
    system prompt already covers the most common methods; use this tool when you
    need a specific method signature or an overload you don't recognize.

    WRITES: el.SetVal("Comments","Done"), el.SetNum("Offset",-150,"cm"),
    el.Delete(), el.Hide(), el.Unhide(), el.Isolate() — auto-transact.
    Collection batch writes (ONE transaction): .SetParam("Comments","Done"),
    .Delete(), .Hide(), .Unhide(), .Isolate().
    Manual foreach loops: ALWAYS wrap in Transact().

    DISPLAY: ALWAYS use .Table(). NEVER foreach+Println loops.
    """
    import re

    t0 = time.perf_counter()
    error = validate_csharp(csharp_code)
    if error:
        record_tool_call("execute_dynamic_query", False, (time.perf_counter() - t0) * 1000,
                         anti_pattern_blocked=True)
        return error

    param_warning = check_suspicious_param_names(csharp_code)
    suspicious_count = 1 if param_warning else 0
    # Advisory only — never blocks. Cheap regex pass, no round-trip cost.
    lint_note = lint_paracore_conventions(csharp_code)
    _SESSION.record_modification()

    # ── Workflow guard: warn if no discovery happened first ──────────────
    workflow_warning = _SESSION.workflow_warning()

    # ── Bulk write detection ─────────────────────────────────────────────
    _BULK_PATTERNS = [
        (r'\.SetParam\s*\(',     '.SetParam() — bulk parameter write on ALL filtered elements'),
        (r'\.Delete\s*\(',       '.Delete() — bulk delete on ALL filtered elements'),
        (r'\.Hide\s*\(',         '.Hide() — bulk hide on ALL filtered elements'),
        (r'\.Isolate\s*\(',      '.Isolate() — bulk isolate on ALL filtered elements'),
    ]
    bulk_warnings = []
    for pattern, desc in _BULK_PATTERNS:
        if re.search(pattern, csharp_code):
            bulk_warnings.append(desc)
    bulk_msg = ""
    if bulk_warnings:
        bulk_msg = (
            "BULK OPERATION DETECTED:\n"
            + "\n".join(f"  • {w}" for w in bulk_warnings)
            + "\n\nVerify the filter scope BEFORE proceeding. "
            + "Use .Count() first to check how many elements will be affected.\n\n"
        )

    prefix = param_warning + (lint_note or "") + (workflow_warning or "") + bulk_msg

    logger.info(f"Executing dynamic query: {justification}")
    try:
        with single_flight(justification or "a write request"):
            result = execute_repl(csharp_code, session_id, source=source)
        duration_ms = (time.perf_counter() - t0) * 1000
        record_tool_call("execute_dynamic_query", result.get("is_success", False),
                         duration_ms, suspicious_params=suspicious_count,
                         workflow_warning=bool(workflow_warning),
                         bulk_write_detected=bool(bulk_warnings),
                         lint_notes=1 if lint_note else 0)
        return prefix + handle_execution_result(result, csharp_code)
    except RevitBusy as busy:
        duration_ms = (time.perf_counter() - t0) * 1000
        record_tool_call("execute_dynamic_query", False, duration_ms, refused_busy=True)
        logger.warning(f"Refused concurrent write request: {busy}")
        return prefix + busy_message(busy)
    except Exception as e:
        duration_ms = (time.perf_counter() - t0) * 1000
        record_tool_call("execute_dynamic_query", False, duration_ms)
        logger.error(f"Execution exception: {e}")
        return prefix + f"Error executing task script: {str(e)}"


def search_schema(category_name: str) -> str:
    """
    Search the model schema for parameter definitions of a Revit category.
    Returns parameter names, storage types, and whether each is Type or Instance.
    PREFERRED discovery tool — faster than running .CombinedParams().Table().
    Results are cached in memory after first call per category.
    """
    logger.info(f"Searching schema for: {category_name}")
    _SESSION.record_discovery()
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


# Cheat sheet is shown ONLY when we are genuinely connected. It is useless — and
# actively misleading — when there is no connection to Revit.
_PING_CHEATSHEET = """
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


def ping() -> str:
    """
    Verify the server is alive AND that Revit is genuinely reachable.

    Three failure states are distinguished because they need different fixes:
      * connected                — server up, live document
      * server up, no document   — Revit is open but no project is loaded
      * not reachable            — Revit closed, or the in-Revit server is toggled off

    gRPC alone cannot separate "Revit closed" from "server toggled off" — both close
    port 50051. A Revit process check supplies the missing signal.
    """
    from grpc_client import probe_connection

    probe = probe_connection()

    if probe["paracore_connected"]:
        header = "pong — connected to Revit."
        if probe["revit_install_path"]:
            header += f"\n  Revit: {probe['revit_install_path']}"
        header += "\n\nNext: call get_context to learn the active view, the current selection and the project levels."
        return header + "\n" + _PING_CHEATSHEET

    revit = probe["revit_process"]
    if probe["server_reachable"]:
        reason = (
            "The Paracore server is reachable but reports NO active Revit document. "
            "Open a project in Revit."
        )
    elif revit is True:
        reason = (
            "Revit IS running, but nothing is answering on localhost:50051. The in-Revit "
            "Paracore server is most likely toggled OFF — turn it on in the Paracore panel "
            "inside Revit."
        )
    elif revit is False:
        reason = "Revit is NOT running. Start Revit and open a project."
    else:
        reason = (
            "Nothing is answering on localhost:50051, and the Revit process check could not "
            "run, so the cause cannot be determined from here."
        )

    detail = f"\n  Server detail: {probe['detail']}" if probe["detail"] else ""

    return (
        "NO CONNECTION TO REVIT.\n\n"
        f"{reason}{detail}\n\n"
        "Do NOT attempt any Revit operation until this is resolved — every call will fail. "
        "Tell the user what to fix, then call ping again."
    )


def get_globals() -> str:
    """Return the complete globals + pre-imported namespaces reference.
    Single source of truth: reads from mcp_core/prompts/globals.md."""
    from mcp_core.prompt_assembler import get_section
    return get_section("globals.md")


# Internal Revit length unit is feet. Elevations arrive raw, so convert for display.
_FT_TO_M = 0.3048
_MAX_SELECTION_LISTED = 10


def get_context_report() -> str:
    """
    Current Revit context: project, active view, selection, levels.

    Cheap, and the agent is blind without it — nothing else in the tool surface reveals
    which view is active or what the user has selected.
    """
    from grpc_client import get_context

    try:
        ctx = get_context()
    except Exception as e:
        logger.error(f"get_context failed: {e}")
        return (
            f"Could not read the Revit context: {e}\n\n"
            "Revit is probably not reachable. Call ping to find out why."
        )

    out: list[str] = []

    info = ctx.get("project_info")
    if info:
        name = info.get("name") or "(unnamed)"
        number = info.get("number") or "-"
        title = info.get("title") or ""
        out.append(f"Project:     {name}  ({number}){'  — ' + title if title else ''}")
        out.append(f"File:        {info.get('file_path') or '(not saved)'}")
        workshared = "workshared" if info.get("is_workshared") else "not workshared"
        out.append(f"User:        {info.get('username') or '-'}  [{workshared}]")
    else:
        out.append("Project:     (project info unavailable)")

    out.append("")
    out.append(
        f"Active view: {ctx.get('active_view_name') or '(none)'}"
        f"  [{ctx.get('active_view_type') or '?'}"
        f", scale 1:{ctx.get('active_view_scale') or '?'}"
        f", {ctx.get('active_view_detail_level') or '?'} detail]"
    )

    count = ctx.get("selection_count") or 0
    if count:
        out.append("")
        out.append(f"Selection:   {count} element(s)")
        for item in (ctx.get("selected_elements") or [])[:_MAX_SELECTION_LISTED]:
            out.append(f"  Id {item.get('id')}  {item.get('category')}")
        if count > _MAX_SELECTION_LISTED:
            out.append(f"  ... and {count - _MAX_SELECTION_LISTED} more")
    else:
        out.append("")
        out.append("Selection:   nothing selected")

    levels = ctx.get("levels") or []
    if levels:
        out.append("")
        out.append(f"Levels ({len(levels)}):")
        for lvl in levels:
            elev = lvl.get("elevation")
            elev_str = f"{elev * _FT_TO_M:.3f} m" if isinstance(elev, (int, float)) else "?"
            out.append(f"  {lvl.get('name')}   (Id {lvl.get('id')})   elevation {elev_str}")

    return "\n".join(out)


def pick_object_report(selection_type: str = "Element", category_filter: str = "") -> str:
    """
    Let the user click an element in Revit and hand it back to the agent.

    Blocks until the user picks or cancels. Revit's UI thread is held during the pick,
    which is expected for an interactive selection.
    """
    from grpc_client import pick_object

    result = pick_object(selection_type, category_filter or None)

    if result.get("cancelled"):
        return (
            "The user cancelled the pick (or nothing was selected in time). "
            "Nothing was picked — ask what they would like to select, or pick again."
        )
    if not result.get("is_success"):
        return f"Pick failed: {result.get('error_message', 'unknown error')}"

    value = (result.get("value") or "").strip()
    if not value:
        return "The pick succeeded but returned no value."

    try:
        element_id = int(value)
    except ValueError:
        return f"User picked: {value}"

    return (
        f"User picked element Id {element_id}.\n\n"
        f"Resolve it in a query with id.ToElement(Doc), or read it with "
        f'GetElements(...).WhereParam("Id", "{element_id}").'
    )


# ── View export — the agent's eyes ─────────────────────────────────────────
# Renders a Revit view to an image so a multimodal agent can LOOK at what it built.
# An image tells you a proportion is wrong; it never tells you a quantity is right —
# it complements the Tier 1 counts, it does not replace them.
#
# ⚠ The export is done by the engine's SHARED ExportImage(path, viewName, pixelSize)
#   (CoreScript.Engine/Globals/ScriptApi.ViewExport.cs). It resolves the view, rejects
#   view templates, creates the directory, and returns the path ACTUALLY written —
#   Revit appends " - <view name>" and may switch the extension, so the path you ask
#   for is not the file that exists. Routing through it keeps those two traps handled
#   in ONE place instead of duplicated here (a rule in N places drifts).
#
# ⚠ The path is NOT read back from the transcript. `output` is a transcript that
#   accumulates Println and can be truncated at the TAIL, so the file is located by
#   PREFIX, newest match, from the base path we chose. The call only has to succeed.

_VIEW_EXPORT_DIR = os.path.join(tempfile.gettempdir(), "paracore_views")

# Annotation modes. Measured 2026-10-08 on the house model, exporting the ground-floor plan:
#   "model" — the engine hides every annotation category. The MODEL fills the frame, but
#             dimensions, room tags and the AREA note are all invisible.
#   "all"   — the engine hides nothing. Every dimension and tag IS visible, but Revit does
#             not clip annotation to the view, so the four section marks beside the plan are
#             rendered too and the model shrinks to roughly a seventh of the frame.
#   "tags"  — MCP-side: hide only the DATUM/MARKER categories and keep the ones a drawing is
#             read for. That is the legible annotated plan, and it is the mode to use when
#             checking dimensions or tags.
#
# ⚠ "tags" is implemented HERE, in the snippet, using raw Autodesk.Revit.DB — so it needs no
#   engine change, no add-in rebuild and no Revit restart. If it is ever promoted into the
#   engine it becomes a new SHARED method (see Docs/PROJECT_MODELING_PLAN.md §4).
_ANNOTATION_MODES = {
    "model": "model", "none": "model",
    "tags": "tags", "annotated": "tags", "dimensions": "tags",
    "all": "all", "everything": "all",
}

# The categories a dimensioned drawing is READ for. Everything else in
# CategoryType.Annotation is treated as a datum/marker and hidden — the allowlist
# fails safe: an annotation category nobody thought of gets hidden, which can only
# ever improve the framing, never break the drawing.
_KEEP_ANNOTATION_BICS = (
    "OST_Dimensions",
    "OST_TextNotes",
    "OST_RoomTags",
    "OST_DoorTags",
    "OST_WindowTags",
)


def _export_view_snippet(base_path: str, view_name: str, pixel_size: int,
                         hide_annotation: bool) -> str:
    """Minimal C#: one call, no Transact (an export does not modify the model)."""
    view_arg = "null"  # null => the active view
    if view_name:
        escaped = view_name.replace("\\", "\\\\").replace('"', '\\"')
        view_arg = f'"{escaped}"'
    hide_arg = "true" if hide_annotation else "false"
    # @-verbatim for the path (backslashes stay literal); an escaped literal for the name.
    return (
        f'var __shot = ExportImage(@"{base_path}", {view_arg}, {int(pixel_size)}, {hide_arg});\n'
        f'Println("exported: " + __shot);\n'
    )


def _export_view_tags_snippet(base_path: str, view_name: str, pixel_size: int) -> str:
    """Keep dimensions and tags; hide the datum/marker categories that overflow the frame.

    Wrapped in a TransactionGroup so the rollback restores every category's visibility in
    one step and leaves NO undo entry — the user's view is exactly as they left it.
    """
    escaped = view_name.replace("\\", "\\\\").replace('"', '\\"') if view_name else ""
    view_arg = f'"{escaped}"' if view_name else "null"
    keep = ", ".join(f"(long)BuiltInCategory.{bic}" for bic in _KEEP_ANNOTATION_BICS)
    return (
        f'var __vname = "{escaped}";\n'
        f'View __v = null;\n'
        f'if (__vname.Length == 0) {{ __v = Doc.ActiveView; }}\n'
        f'else {{\n'
        f'  foreach (var __c in new FilteredElementCollector(Doc).OfClass(typeof(View)).Cast<View>()) {{\n'
        f'    if (!__c.IsTemplate && __c.Name.Equals(__vname, StringComparison.OrdinalIgnoreCase)) {{ __v = __c; break; }}\n'
        f'  }}\n'
        f'}}\n'
        f'if (__v == null) {{ throw new InvalidOperationException('
        f'"export_view: no view named \'" + __vname + "\' in this document."); }}\n'
        f'var __keep = new HashSet<long> {{ {keep} }};\n'
        f'var __tg = new TransactionGroup(Doc, "export_view: keep tags");\n'
        f'__tg.Start();\n'
        f'int __hid = 0;\n'
        f'using (var __t = new Transaction(Doc, "hide annotation markers")) {{\n'
        f'  __t.Start();\n'
        f'  foreach (Category __cat in Doc.Settings.Categories) {{\n'
        f'    try {{\n'
        f'      if (__cat.CategoryType != CategoryType.Annotation) continue;\n'
        f'      if (__keep.Contains(__cat.Id.Value)) continue;\n'
        f'      __v.SetCategoryHidden(__cat.Id, true);\n'
        f'      __hid++;\n'
        f'    }} catch {{ }}\n'
        f'  }}\n'
        f'  __t.Commit();\n'
        f'}}\n'
        f'try {{\n'
        f'  var __shot = ExportImage(@"{base_path}", {view_arg}, {int(pixel_size)}, false);\n'
        f'  Println("exported: " + __shot);\n'
        f'  Println("marker categories hidden: " + __hid);\n'
        f'}} finally {{\n'
        f'  try {{ __tg.RollBack(); }} catch {{ }}\n'
        f'}}\n'
    )


def export_view_report(
    view_name: str = "",
    pixel_size: int = 1200,
    annotations: str = "model",
    *,
    session_id: str = "mcp-session",
    source: str = "mcp_agent",
    execution_mode: str = "read_write",
    license_tier: str = "free",
) -> dict:
    """
    Render a Revit view to an image file and return the path that was written.

    `annotations` selects what the export does with annotation:
      * "model" (default) — every annotation category is hidden, so the picture frames the
        MODEL. Nothing readable is lost if you only care about geometry.
      * "tags" — hide the datum/marker categories (levels, grids, section/elevation marks,
        callouts) but KEEP dimensions, text notes and room/door/window tags. Use this to
        check a dimensioned drawing or read a room tag.
      * "all" — hide nothing. Every tag is visible, but Revit does not clip annotation to
        the view, so markers that sit outside the model are drawn too and the model shrinks
        to a small part of the frame.

    Returns {"path": str | None, "view": str, "annotations": str, "error": str | None}.
    The transport layer (MCP) turns "path" into an image content block; the in-app
    agent can read the file directly. Kept FastMCP-free so both consumers share it.

    No transaction is opened by the caller — an export does not modify the model, and the
    "tags" mode rolls its own TransactionGroup back before returning.

    `execution_mode` / `license_tier` exist so a caller with its OWN posture can say so
    instead of inheriting this one. paracore-takeoff is read-only and enterprise-gated, so
    it passes execution_mode="read_only". ⚠ That is safe for THIS tool, and the reason is
    worth keeping: the engine's read-only gate (ReplHandler.ContainsWriteOperations) is a
    substring scan for .SetVal( / .SetNum( / .SetParam( / .Delete() / .Hide() / Transact( /
    NewFamilyInstance / Wall.Create / Floor.Create / doc.Create — and neither snippet
    contains one. The "tags" mode's hide is `SetCategoryHidden(...)` inside
    `new Transaction(...)`, and `Transact(` is not a substring of `Transaction(`. The
    engine's `ExportImage` also transacts with its own TransactionGroup, which the
    read-only flag never touches (it only gates the script-facing `ExecutionGlobals.Transact`
    helper). Defaults reproduce the previous behaviour exactly, so gen / model / family are
    unaffected.
    """
    t0 = time.perf_counter()
    view_name = (view_name or "").strip()

    mode = _ANNOTATION_MODES.get((annotations or "").strip().lower())
    if mode is None:
        return {"path": None, "view": view_name, "annotations": annotations,
                "error": ("Unknown annotations mode "
                          f"'{annotations}'. Use 'model' (annotation hidden), "
                          "'tags' (dimensions and tags kept, markers hidden) or "
                          "'all' (nothing hidden).")}

    try:
        pixel = max(200, min(int(pixel_size or 1200), 8000))
    except (TypeError, ValueError):
        pixel = 1200

    os.makedirs(_VIEW_EXPORT_DIR, exist_ok=True)
    base = os.path.join(_VIEW_EXPORT_DIR, f"view_{uuid.uuid4().hex[:8]}")
    label = f"export view {view_name or '(active)'} [{mode}]"

    if mode == "tags":
        code = _export_view_tags_snippet(base, view_name, pixel)
    else:
        code = _export_view_snippet(base, view_name, pixel, hide_annotation=(mode == "model"))
    logger.info(f"Exporting view: {view_name or '(active view)'} at {pixel}px, mode={mode}")

    try:
        with single_flight(label):
            result = execute_repl(code, session_id, source=source,
                                  execution_mode=execution_mode,
                                  license_tier=license_tier)
    except RevitBusy as busy:
        record_tool_call("export_view", False, (time.perf_counter() - t0) * 1000,
                         refused_busy=True)
        logger.warning(f"Refused concurrent export request: {busy}")
        return {"path": None, "view": view_name, "annotations": mode,
                "error": busy_message(busy)}
    except Exception as e:
        record_tool_call("export_view", False, (time.perf_counter() - t0) * 1000)
        logger.error(f"export_view exception: {e}")
        return {"path": None, "view": view_name, "annotations": mode,
                "error": f"Export failed: {e}"}

    if not result.get("is_success"):
        record_tool_call("export_view", False, (time.perf_counter() - t0) * 1000)
        return {"path": None, "view": view_name, "annotations": mode,
                "error": format_execution_error(result, code)}

    # ⚠ Find by PREFIX, newest match. Never trust the exact name we passed in.
    written = None
    try:
        candidates = glob.glob(glob.escape(base) + "*")
        if candidates:
            written = max(candidates, key=os.path.getmtime)
    except OSError as e:
        logger.warning(f"export_view could not scan {_VIEW_EXPORT_DIR}: {e}")

    if not written or not os.path.exists(written):
        record_tool_call("export_view", False, (time.perf_counter() - t0) * 1000)
        return {"path": None, "view": view_name, "annotations": mode,
                "error": ("The export reported success but no image file matching "
                          f"'{os.path.basename(base)}*' appeared in {_VIEW_EXPORT_DIR}. "
                          "Check the view is not a view template, then try again.")}

    record_tool_call("export_view", True, (time.perf_counter() - t0) * 1000)
    return {"path": written, "view": view_name, "annotations": mode, "error": None}

