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
import re
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
    check_read_only_violation,
    check_agent_file_policy,
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
    Execute a C# snippet in Revit for schema/data discovery.

    DISCOVERY ONLY. A snippet that changes the model is refused by a pattern guard —
    a mistake-catcher, NOT a sandbox (see check_read_only_violation). Use
    execute_dynamic_query to change anything.

    Results are summarized: tables show up to 50 rows (every row if the table is that
    small or smaller) plus a total count; text output shows the first 24 and last 16 lines
    (the middle is elided, so a result printed last is never lost).
    ⚠ PARAMETER SCHEMAS ARE NEVER CUT: .CombinedParams(), .InstanceParams(), .TypeParams(),
    .BuiltInParams(), .NativeProperties() and .Peek() come back complete, however many rows
    that is — the list IS the answer to "what parameters exist?". Element dumps
    (GetElements(...).Table()) and grouped aggregates still cap, because those you can
    narrow with .WhereParam(). The exemption survives only while the sequence does:
    .Select(...)/.Where(...)/.ToList() after a schema method returns a plain table again.
    BEFORE WRITING ANY C#: call the `_read_extension_methods` TOOL for the method
    catalog — it is a separate MCP call, not something you can do from inside C#.
    ⚠ NOT `paracore://system-prompt`. That is a RESOURCE, and the clients this server
    targets never read resources (measured: 0 `resources/read` in 70 Claude Desktop
    sessions — see mcp_core/domain.py). It also holds the RULES, not the method catalog.
    A pointer to something the caller cannot open is a dead end in an error message.

    PARACORE-FIRST: Use extension methods (.GetStr, .GetNum, .WhereParam,
    .OrderByParam, .GroupByParam, .SumParam, .Table, etc.) instead of raw
    LINQ, FilteredElementCollector, LookupParameter, or foreach+Println.
    """
    t0 = time.perf_counter()
    error = validate_csharp(csharp_code)
    if not error:
        # ⚠ THIS TOOL ONLY. The same snippet must run in execute_dynamic_query.
        error = check_read_only_violation(csharp_code)
    if not error:
        # ⚠ NOT a read-only rule — it applies to writes too, so both tools check it.
        error = check_agent_file_policy(csharp_code, source)
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


# ── Bulk write detection — a function, so the rule can be TESTED without Revit ──
# ⚠⚠ A STATIC SCAN CANNOT SEE THE RECEIVER'S TYPE, SO IT MUST AT LEAST SEE ITS SHAPE
#   (fixed 2026-10-27). `doors.First().Hide()` was reported as "bulk hide on ALL filtered
#   elements": the scan matched `.Hide(` and never looked at what it was called ON. The
#   warning was harmless but WRONG, and a warning that fires on correct code teaches the
#   agent to skim past the ones that are right. A call whose receiver chain ends in a
#   single-element selector is not bulk, so it is skipped.
_BULK_PATTERNS = [
    (r'\.SetParam\s*\(', '.SetParam() — bulk parameter write on ALL filtered elements'),
    (r'\.Delete\s*\(',   '.Delete() — bulk delete on ALL filtered elements'),
    (r'\.Hide\s*\(',     '.Hide() — bulk hide on ALL filtered elements'),
    (r'\.Isolate\s*\(',  '.Isolate() — bulk isolate on ALL filtered elements'),
]

# Anything that narrows a collection to ONE element. `GetElement`/`ToElement` return a single
# Element outright; the LINQ terminals are the usual way to reach one from a query.
#
# ⚠ THE CREATORS COUNT TOO (2026-10-29). `Wall.Create(...)`, `doc.Create.NewFamilyInstance(...)`
# and `.Duplicate(...)` each RETURN one element, so `var w = Wall.Create(...); w.Delete();` is a
# delete of exactly one wall. Without them the detector fell back to "unknown receiver" and
# printed BULK OPERATION for a single element — measured live on the big model, inside a
# `Transact` lambda. A warning that fires on correct code teaches the caller to skim past the
# ones that are right, which is the failure this whole helper exists to avoid.
# `Create` cannot over-match `doc.Create.NewFamilyInstance(` — that has a `.` after `Create`,
# not the `(` this pattern requires.
# ⚠ THE LEADING DOT IS OPTIONAL. `GetElement(359588).Delete()` calls the selector on the
# engine's static surface, not on a receiver, so there is no dot to match — the first version
# of this pattern reported that delete as bulk. (Measured offline, 2026-10-29.)
_SINGLE_ELEMENT = re.compile(
    r"\.?(?:First|FirstOrDefault|Last|LastOrDefault|Single|SingleOrDefault|"
    r"ElementAt|ElementAtOrDefault|GetElement|ToElement|"
    r"Create|NewFamilyInstance|Duplicate)\s*\("
)

# `var w = <expr>;` — the RHS is captured so _single_element_vars can tell a variable that
# holds ONE element from one that holds a collection. `[^;]` spans newlines on its own, which
# is what a chained call split across lines needs.
_ASSIGNMENT = re.compile(r"\b(?:var|Element|dynamic)\s+(\w+)\s*=\s*([^;]*);")


def _single_element_vars(code: str) -> set:
    """Variable names assigned from an expression that yields ONE element.

    ⚠⚠ WHY (2026-10-29, second release review). The single-element check was
    STATEMENT-LOCAL, so this read as an unknown collection:

        var w = GetElements("Walls").First();
        w.Delete();

    and fired "BULK OPERATION DETECTED: .Delete() — bulk delete on ALL filtered
    elements" for a delete of exactly one wall. The reviewer hit it with a
    single-element .Delete() and a one-wall .Hide(). A warning that fires on correct
    code trains the caller to ignore warnings — the same failure class as the
    "has no spaces" note, which is why that one was narrowed too.
    """
    return {
        m.group(1)
        for m in _ASSIGNMENT.finditer(code)
        if _SINGLE_ELEMENT.search(m.group(2))
    }


def _is_single_element_call(text: str, at: int, single_vars=frozenset()) -> bool:
    """True when the receiver chain immediately before `at` yields ONE element.

    The chain is read from the start of the enclosing statement, so `doors.First()` and the
    `.Hide()` that follows it are looked at together. A bare variable that was ASSIGNED from
    such an expression counts too — see _single_element_vars.
    """
    start = max(text.rfind(";", 0, at), text.rfind("}", 0, at), text.rfind("{", 0, at))
    chain = text[start + 1:at]
    if _SINGLE_ELEMENT.search(chain) is not None:
        return True
    return chain.strip() in single_vars


def bulk_operation_warnings(csharp_code: str) -> list:
    """One advisory per bulk-write method used on a COLLECTION. Never blocks."""
    warnings = []
    single_vars = _single_element_vars(csharp_code)
    for pattern, desc in _BULK_PATTERNS:
        for match in re.finditer(pattern, csharp_code):
            if not _is_single_element_call(csharp_code, match.start(), single_vars):
                warnings.append(desc)
                break
    return warnings


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
    if not error:
        # ⚠ Applies to WRITES too: the file policy is not a read-only rule.
        error = check_agent_file_policy(csharp_code, source)
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
    # ⚠ The rule lives in `bulk_operation_warnings()` so it can be tested without Revit.
    bulk_warnings = bulk_operation_warnings(csharp_code)
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


# ── The schema usage example — DERIVED from the rows, never a fixed template ──
# ⚠⚠ WHAT WENT WRONG (2026-10-27, review round 5). The example was a hard-coded template:
#   `e.GetStr("Level")`, `GroupByParam("Level")`. That is correct for Rooms, Doors and
#   Windows and WRONG for Walls, which have no `Level` parameter at all (62 of them, and
#   the nearest thing is `Base Constraint`). GetStr on a name that does not exist returns
#   "" with no error, so the example COMPILED, RAN, and produced a column of blanks —
#   precisely the silent failure this server's instructions spend a paragraph warning
#   about, shipped as its own advice directly under the parameter list.
#   A name printed two lines above the example cannot be a name that does not exist, so
#   the example is now built FROM the rows the caller was just shown.
_TEXT_PREFERENCE = ("Type Name", "Family and Type", "Comments", "Mark", "Description", "Name")
# ⚠ The unit is part of the pair, not decoration: `GetNum(name, "m2")` on a parameter that
#   is not an area does not throw — it converts the raw number as if it were square feet.
#   Measured: `GetNum("Absorptance", "m2")` returned 0.065 instead of 0.7. So only a
#   parameter whose unit is unambiguous from its own name gets a unit at all.
_NUM_PREFERENCE = (
    ("Area", "m2"), ("Volume", "m3"), ("Length", "m"), ("Perimeter", "m"),
    ("Unconnected Height", "m"),
)

_IDENT_STRIP = re.compile(r"[^0-9A-Za-z_]+")


def _csharp_identifier(name: str) -> str:
    """A C#-safe column name for a parameter.

    ⚠ display-visualize documents the convention: a column called `Base_Constraint`
    displays as "Base Constraint", so spaces become underscores. Any OTHER character that
    is illegal in a C# identifier has to go the same way, or the example will not compile
    — `Heat Transfer Coefficient (U)` is a real Walls parameter.
    """
    out = _IDENT_STRIP.sub("_", name or "").strip("_")
    if not out or out[0].isdigit():
        out = "_" + out
    return out


def _schema_usage_example(category_name: str, rows: list) -> str:
    """A runnable example built from the parameters this category actually has."""
    by_name = {r["name"].lower(): r for r in rows}

    text = next((n for n in _TEXT_PREFERENCE if n.lower() in by_name), None)
    if text is None:
        text = next((r["name"] for r in rows if r["storage"] == "String"), None)

    num = unit = None
    for candidate, candidate_unit in _NUM_PREFERENCE:
        if candidate.lower() in by_name:
            num, unit = by_name[candidate.lower()]["name"], candidate_unit
            break

    cols = ["Id = e.Id.Value"]
    if text:
        cols.append(f'{_csharp_identifier(text)} = e.GetStr("{text}")')
    if num:
        cols.append(f'{_csharp_identifier(num)} = e.GetNum("{num}", "{unit}")')

    lines = [
        f"\n\n// To query {category_name}, use the parameter names above:",
        f'GetElements("{category_name}").Select(e => new {{ {", ".join(cols)} }}).Table()',
    ]
    group = text or num
    if group:
        lines.append("// Or group by a discovered parameter:")
        lines.append(f'GetElements("{category_name}").GroupByParam("{group}").Table()')
    return "\n".join(lines)


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
        from mcp_core.schema_cache import schema_rows
        from mcp_core.schema_cache import search_schema as do_search
        result = do_search(category_name)
        # ⚠⚠ ONLY OFFER THE EXAMPLE WHEN THERE IS A SCHEMA (2026-10-27, review round 3).
        #   The usage block was appended unconditionally, so a "No parameters found for
        #   category 'X'" error was followed by a cheerful snippet querying `Level` and
        #   `Name` on a category that has neither. An example that cannot work, printed
        #   directly under an error, is worse than no example — it reads as advice.
        #   The test is now on the ROWS, which is the same fact the text was rendered
        #   from, so the two cannot disagree.
        rows = schema_rows(category_name)
        if not rows:
            return result
        return result + _schema_usage_example(category_name, rows)
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

  .WhereParam("Name", "value")   → filter by parameter (exact)
  .WhereParam("Name", "contains", "txt") → filter by parameter CONTAINS text
  .GroupByParam("Name")          → group and count → chain .Table()
  .Select(e => new { ... })      → project columns → always put Id first → .Table()
  .Table()                       → render as interactive data grid
  .First().CombinedParams().Table() → discover ALL parameters on an element

  ⚠ .WhereMatches("txt") matches the element's NAME and FAMILY name only — it never
    looks at a parameter. For a Comments value use .WhereParam("Comments","contains","txt").

TIME BUDGET — a script is KILLED after 90 s of wall clock, checked INSIDE each loop body:
  SetExecutionTimeout(600);      → put this on line 1 to raise it for a long run
  ⚠ It must be the FIRST statement to be any use, and it is re-armed per call.
  ⚠ ONLY LOOPS IN YOUR OWN CODE ARE CHECKED. A single blocking call cannot be interrupted
    (Thread.Sleep is refused outright for that reason), and neither can a loop that lives
    inside a framework method — Enumerable.Range(0, int.MaxValue).ToList() runs to the end
    and Revit stays frozen until it finishes. Keep bulk work in your own foreach.

WRITE (execute_dynamic_query only — auto-transacted):
  e.SetVal("Comments", "Done")
  e.SetNum("Offset", -150, "mm")
  GetElements("Walls").SetParam("Comments", "Done")   ← bulk, one transaction
  Transact("name", () => { /* foreach with writes */ })

BEFORE YOU CHANGE A VALUE — read it first, and say what it was:
  GetElements("Walls").Select(e => new { e.Id, Mark = e.GetStr("Mark") }).Table()
  ⚠ A write COMMITS. Bulk .SetParam() over a category overwrites every element at once,
    and nothing keeps the old values. If you did not read them, the user cannot undo it
    from your transcript — so read first, then write, then report old → new.
  ⚠ Never describe a value as "the original" unless you actually read it. If you are
    restoring something you never captured, SAY SO and ask instead of assuming 0 / "".
  ⚠ A rejected write RAISES — a read-only parameter or a misspelled name is an
    InvalidOperationException, not a warning. Do not treat "the script continued" as success.
  ⚠ A geometric write CASCADES: `modified 23` for one wall is Revit recomputing rooms,
    hosted doors and joins. Read the count, and re-read room areas after moving walls.
  ⚠ If the result says a Revit DIALOG was answered by the watcher, TELL THE USER —
    they did not see it and did not choose the answer.

PROJECT INFO: Doc.ProjectInformation.Name, Doc.Title, Doc.PathName, Doc.IsWorkshared

AVOID — the Paracore method is better. These RUN, with a note attached:
  new FilteredElementCollector(Doc)...   → GetElements("Walls")
  .OfCategory(BuiltInCategory.OST_...)   → the name alone: GetElements("Walls")
  .LookupParameter("Name")               → .GetStr("Name") / .GetNum("Name", "m")
  foreach+Println loops for display      → .Table()

REJECTED — these cannot work, so they are refused before anything runs:
  doc  /  document  (lowercase)          → Doc is the only global document
  .GroupByParam("X").Select(...)         → chain .Table() straight onto the group

DISCOVERY IS ROLLED BACK — explore_revit_data runs inside a transaction group that
  is always rolled back, so a write reached there is discarded, not applied.

TRUNCATION — which tables you get whole, and which are cut at 50 rows:
  NEVER CUT — .CombinedParams(), .InstanceParams(), .TypeParams(), .BuiltInParams(),
    .NativeProperties(), .Peek(). Every row arrives, however many. The list IS the
    answer to "what parameters exist?", so a cut list would hide a real parameter.
    They also print "(N rows, shown in full)" and no Totals line — summing parameter
    values is meaningless.
  CUT AT 50 (+ last 2) — GetElements(...).Table() and any grouped or projected table.
    That is deliberate: narrow it with .WhereParam() rather than paging.
  ⚠ The exemption ends the moment you project or filter: .Select(...), .Where(...) or
    .ToList() on a schema method gives you a plain table again, and it will cap.
  ⚠ A TEXT dump is still cut to the first 24 + last 16 lines. If you need 200 values,
    return a table, not a Println loop."""


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
        # ⚠⚠ THE REVIT INSTALL PATH IS DELIBERATELY NOT PRINTED (2026-10-27). It is
        #   `C:\Users\<login>\AppData\...`, so every ping echoed the Windows account
        #   name into a transcript that may be shared, logged or pasted into a chat.
        #   The agent never needs it: the port being live already proves Revit is up.
        #   A human who wants the path can read it in the Paracore panel.
        header = "pong — connected to Revit."
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
        # ⚠⚠ THE USERNAME IS DELIBERATELY NOT PRINTED (2026-10-27) — it is the
        #   Autodesk account of whoever is at the machine, and it is of no use to a
        #   query. It was echoing into transcripts next to the file path. The
        #   worksharing flag is the part that changes how the model behaves.
        out.append(f"Model:       {workshared}")
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

# ⚠ EXPORTS ARE KEPT FOR A WEEK, THEN PRUNED (found in the pre-release review, 2026-10-27:
#   "a temp file left in Windows Temp"). Every export writes a fresh PNG here and nothing
#   ever removed them, so the directory grew without limit. Pruning happens on the NEXT
#   export, not on a timer, so it costs nothing when the tool is unused.
#
#   The predicate is deliberately narrow: OUR directory, OUR `view_` prefix, an image
#   extension, and an mtime past the cutoff. Anything else in the folder is left alone —
#   a file this tool did not write is not this tool's to delete.
_VIEW_EXPORT_KEEP_DAYS = 7
_VIEW_EXPORT_EXTS = (".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff")


def _prune_old_exports(keep_days: int = _VIEW_EXPORT_KEEP_DAYS) -> int:
    """Delete `view_*` images older than `keep_days`. Returns how many went.

    Never raises: a failure to tidy up must not fail the export that triggered it.
    """
    cutoff = time.time() - keep_days * 86400
    removed = 0
    try:
        with os.scandir(_VIEW_EXPORT_DIR) as entries:
            for entry in entries:
                try:
                    if not entry.is_file(follow_symlinks=False):
                        continue
                    name = entry.name
                    if not name.startswith("view_"):
                        continue
                    if os.path.splitext(name)[1].lower() not in _VIEW_EXPORT_EXTS:
                        continue
                    if entry.stat(follow_symlinks=False).st_mtime >= cutoff:
                        continue
                    os.remove(entry.path)
                    removed += 1
                except OSError:
                    continue          # one locked/stale entry must not stop the sweep
    except OSError:
        return removed
    if removed:
        logger.info(f"Pruned {removed} export image(s) older than {keep_days} days")
    return removed

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
    _prune_old_exports()
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

