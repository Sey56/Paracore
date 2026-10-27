import logging
import os
import json
import subprocess
from contextlib import contextmanager
from typing import Optional

import corescript_pb2
import corescript_pb2_grpc
import grpc
from utils import format_grpc_error

# ── Constants ──────────────────────────────────────────────────────────────────
GRPC_UNAVAILABLE_MSG = "Revit is closed or Paracore server is unavailable."
_GRPC_RECONNECT_OPTIONS = [
    ('grpc.initial_reconnect_backoff_ms', 500),
    ('grpc.max_reconnect_backoff_ms', 2000),
    ('grpc.min_reconnect_backoff_ms', 500),
]

# Global channel variable
_channel = None

class RevitConfig:
    def __init__(self):
        self.revit_install_path: Optional[str] = None
        self.addin_server_path: Optional[str] = None

_revit_config = RevitConfig()

def get_revit_config():
    return _revit_config

def init_channel():
    """Initializes the global gRPC channel with aggressive reconnect limits."""
    global _channel
    if _channel is None:
        grpc_server_address = os.environ.get('GRPC_SERVER_ADDRESS', 'localhost:50051')
        logging.debug(f"Initializing gRPC channel to {grpc_server_address}")
        _channel = grpc.insecure_channel(grpc_server_address, options=_GRPC_RECONNECT_OPTIONS)

def close_channel():
    """Closes the global gRPC channel."""
    global _channel
    if _channel:
        logging.debug("Closing gRPC channel")
        _channel.close()
        _channel = None

@contextmanager
def get_corescript_runner_stub():
    """Provides a gRPC stub using the global singleton channel."""
    global _channel
    # Fallback if channel wasn't initialized (e.g. running outside main app)
    local_channel = None

    try:
        if _channel is None:
            logging.debug("Global gRPC channel not initialized. Creating temporary channel.")
            grpc_server_address = os.environ.get('GRPC_SERVER_ADDRESS', 'localhost:50051')
            local_channel = grpc.insecure_channel(grpc_server_address, options=_GRPC_RECONNECT_OPTIONS)
            stub = corescript_pb2_grpc.CoreScriptRunnerStub(local_channel)
            yield stub
        else:
            stub = corescript_pb2_grpc.CoreScriptRunnerStub(_channel)
            yield stub
    finally:
        if local_channel:
            local_channel.close()

def register_watchdog_source(path: str, parameters_json: Optional[str] = None):
    """
    Calls the gRPC service to scan a folder and arm all watchdogs found.
    """
    try:
        with get_corescript_runner_stub() as stub:
            req_params = {'path': path}
            if parameters_json is not None:
                req_params['parameters_json'] = parameters_json.encode('utf-8')
            
            request = corescript_pb2.RegisterWatchdogSourceRequest(**req_params)
            response = stub.RegisterWatchdogSource(request)
            return {
                "is_success": response.is_success,
                "error_message": response.error_message,
                "watchdogs_registered": response.watchdogs_registered,
                "load_details": list(response.load_details)
            }
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.UNAVAILABLE:
            return {
                "is_success": False,
                "error_message": GRPC_UNAVAILABLE_MSG,
                "watchdogs_registered": 0,
                "load_details": []
            }
        logging.error(format_grpc_error(e))
        return {
            "is_success": False,
            "error_message": f"gRPC Error: {e.details()}",
            "watchdogs_registered": 0,
            "load_details": []
        }
    except Exception as e:
        logging.error(f"Error calling RegisterWatchdogSource: {e}")
        return {
            "is_success": False,
            "error_message": str(e),
            "watchdogs_registered": 0,
            "load_details": []
        }

def get_status():
    try:
        with get_corescript_runner_stub() as stub:
            response = stub.GetStatus(corescript_pb2.GetStatusRequest(), timeout=2)
            if response.paracore_connected:
                _revit_config.revit_install_path = response.revit_install_path
                _revit_config.addin_server_path = response.addin_server_path
            return response
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.UNAVAILABLE:
            close_channel()
            return corescript_pb2.GetStatusResponse(paracore_connected=False, revit_open=False)
        logging.error(format_grpc_error(e))
        raise
    except Exception as e:
        logging.error(f"An unexpected error occurred during gRPC GetStatus call: {e}")
        raise

def is_revit_running() -> Optional[bool]:
    """
    Best-effort check whether a Revit process is running on this machine.

    Why this exists: the gRPC endpoint is hosted by the Paracore server inside Revit.
    When the server is toggled off, port 50051 stops answering — exactly as it does when
    Revit is closed. gRPC alone therefore cannot tell "Revit is open but the server is off"
    from "Revit is not running". A process check supplies the missing signal.

    Returns:
        True  — a Revit process is running
        False — no Revit process found
        None  — the check itself failed, so the caller must say "cannot tell" rather than guess
    """
    if os.name != "nt":
        return None
    try:
        # CREATE_NO_WINDOW so a console window never flashes on the user's screen.
        startupinfo = subprocess.STARTUPINFO()
        startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        completed = subprocess.run(
            ["tasklist", "/FI", "IMAGENAME eq Revit.exe", "/FO", "CSV", "/NH"],
            capture_output=True,
            text=True,
            timeout=5,
            startupinfo=startupinfo,
            creationflags=0x08000000,
        )
        return "Revit.exe" in (completed.stdout or "")
    except Exception as e:
        logging.debug(f"Revit process check failed: {e}")
        return None


def probe_connection() -> dict:
    """
    Single honest answer to "can we actually talk to Revit right now?".

    Distinguishes three states that gRPC alone cannot separate:
      * connected                     — server reachable AND it has a live Revit document
      * server_reachable, not connected — the endpoint answered but reports no document
      * not reachable + Revit running — Revit is open but the Paracore server is off
      * not reachable + no Revit      — Revit is not running

    Deliberately does NOT call close_channel() on failure. The global channel carries
    reconnect backoff options (see _GRPC_RECONNECT_OPTIONS); tearing it down on every
    failed probe would defeat them and force a fresh channel per call.
    """
    server_reachable = False
    paracore_connected = False
    revit_install_path = ""
    addin_server_path = ""
    detail = ""

    try:
        with get_corescript_runner_stub() as stub:
            response = stub.GetStatus(corescript_pb2.GetStatusRequest(), timeout=3)
            server_reachable = True
            paracore_connected = bool(response.paracore_connected)
            revit_install_path = response.revit_install_path or ""
            addin_server_path = response.addin_server_path or ""
            if paracore_connected:
                _revit_config.revit_install_path = revit_install_path
                _revit_config.addin_server_path = addin_server_path
    except grpc.RpcError as e:
        if e.code() != grpc.StatusCode.UNAVAILABLE:
            detail = f"{e.code()}: {e.details()}"
            logging.error(format_grpc_error(e))
    except Exception as e:
        detail = str(e)
        logging.error(f"GetStatus probe failed: {e}")

    # If the server answered and reports a live document, Revit is definitionally running —
    # no need to shell out to tasklist.
    revit_process = True if paracore_connected else is_revit_running()

    return {
        "server_reachable": server_reachable,
        "paracore_connected": paracore_connected,
        "revit_process": revit_process,
        "revit_install_path": revit_install_path,
        "addin_server_path": addin_server_path,
        "detail": detail,
    }


def get_model_categories():
    """
    Calls the gRPC service to fetch all model categories on demand.
    """
    try:
        with get_corescript_runner_stub() as stub:
            response = stub.GetModelCategories(corescript_pb2.GetModelCategoriesRequest())
            
            all_cats = []
            for cat in response.categories:
                all_cats.append({"id": cat.id, "label": cat.label})
            
            return {
                "categories": all_cats,
                "error_message": response.error_message
            }
    except Exception as e:
        if isinstance(e, grpc.RpcError) and e.code() == grpc.StatusCode.UNAVAILABLE:
            return {"categories": [], "error_message": GRPC_UNAVAILABLE_MSG}
        logging.error(f"Error calling GetModelCategories gRPC: {e}")
        return {"categories": [], "error_message": str(e)}

def get_watchdog_statuses():
    """
    Calls the gRPC service to fetch all active background watcher statuses.
    """
    try:
        with get_corescript_runner_stub() as stub:
            response = stub.GetWatchdogStatus(corescript_pb2.GetWatchdogStatusRequest(), timeout=2)
            
            watchdogs = []
            for w in response.watchdogs:
                watchdogs.append({
                    "script_path": w.script_path,
                    "script_name": w.script_name,
                    "summary": w.summary,
                    "status": w.status,
                    "details_json": w.details_json,
                    "timestamp": w.timestamp,
                    "parameters_json": getattr(w, "parameters_json", "")
                })

            failed_watchdogs = []
            for f in response.failed_watchdogs:
                failed_watchdogs.append({
                    "script_path": f.script_path,
                    "script_name": f.script_name,
                    "error_message": f.error_message,
                    "timestamp": f.timestamp
                })
            
            return {
                "watchdogs": watchdogs,
                "failed_watchdogs": failed_watchdogs
            }
    except grpc.RpcError as e:
        # Handle connection errors gracefully when Revit is closed
        if e.code() == grpc.StatusCode.UNAVAILABLE:
            # We don't log the full stack trace for a simple unavailable state (usually just Revit closed)
            return {"watchdogs": [], "failed_watchdogs": [], "error_message": GRPC_UNAVAILABLE_MSG}
        
        logging.error(f"gRPC Error in GetWatchdogStatus: {e.details()}")
        return {"watchdogs": [], "failed_watchdogs": [], "error_message": str(e)}
    except Exception as e:
        logging.error(f"Error calling GetWatchdogStatus gRPC: {e}")
        return {"watchdogs": [], "failed_watchdogs": [], "error_message": str(e)}

def _build_parameter_dict(p, parse_value: bool = False) -> dict:
    """Build a parameter dict from a protobuf Parameter message.

    Extracted to deduplicate the ~25-field construction that appears in
    both get_script_parameters() and get_bulk_metadata().
    """
    val = p.default_value_json
    if parse_value:
        try:
            val = json.loads(val)
        except (json.JSONDecodeError, TypeError):
            pass

    result = {
        "name": p.name,
        "type": p.type,
        "description": p.description,
        "options": list(p.options),
        "multiSelect": p.multi_select,
        "visibleWhen": p.visible_when,
        "numericType": p.numeric_type,
        "min": p.min if p.HasField('min') else None,
        "max": p.max if p.HasField('max') else None,
        "step": p.step if p.HasField('step') else None,
        "isRevitElement": p.is_revit_element,
        "revitElementType": p.revit_element_type,
        "revitElementCategory": p.revit_element_category,
        "requiresCompute": p.requires_compute,
        "group": p.group,
        "inputType": p.input_type,
        "required": p.required,
        "suffix": p.suffix,
        "pattern": p.pattern,
        "enabledWhenParam": p.enabled_when_param,
        "enabledWhenValue": p.enabled_when_value,
        "unit": p.unit,
        "selectionType": p.selection_type,
    }
    if parse_value:
        result["defaultValue"] = val
        result["value"] = val
    else:
        result["defaultValueJson"] = val
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# THE SESSION-GATE DEADLINE POLICY — ONE rule, every gate-bearing MCP
# ═══════════════════════════════════════════════════════════════════════════════
# ⚠⚠ WHY A POLICY AT ALL (2026-10-25). The session gate is a Revit TaskDialog and
#   `dialog.Show()` has NO timeout — it parks Revit's UI thread until a person clicks.
#   Only a human can end that wait, so a deadline does NOT resolve the block: the
#   dialog is still on screen afterwards. The deadline's ONLY job is to give the agent
#   its voice back so it can say "there is a dialog on your screen, please answer it".
#
#   That leaves the ambiguity the operator raised (2026-10-25): DEADLINE_EXCEEDED can
#   mean "the consent gate is waiting for a person" OR "the script is simply long", and
#   the two need OPPOSITE responses (ask them to click vs. wait / raise the timeout).
#
#   ⚠ THE GATE SETTLES EXACTLY ONCE PER REVIT SESSION — granted or denied, then latched
#   in the add-in (SessionGate.cs `_approved` / `_denied`). So the ambiguity can only
#   exist BEFORE this process has seen its first response. After that a consent dialog
#   can never appear again, and a timeout can only mean a long or blocked run. Hence:
#
#       consent unsettled  ->  CONSENT_WAIT_S        (a person has to read and click)
#       consent settled    ->  the caller's deadline (behaviour unchanged)
#
#   ⚠ A timed-out call NEVER loses the decision: the click still lands and latches, so
#     the NEXT call reports `granted` / `denied` immediately and for free.
#
#   ⚠⚠ CONSISTENCY IS THE REQUIREMENT (operator, 2026-10-25: "whatever you implement, it
#     must be consistent across all MCP"). This file is the ONE home for the policy and
#     gen / model / family / forge all import it — so there is no second copy to drift.
#     ⚠ paracore-takeoff is EXEMPT BY SOURCE, not by omission: it sends `takeoff_mcp` /
#     `takeoff_export`, which never contain AGENT_SOURCE_MARKER, so its calls are never
#     capped and its explicit 180 s exports are untouched. That is correct — takeoff runs
#     deterministic takeoff methods, never agent-generated code, so no gate can appear.
CONSENT_WAIT_S = 60.0      # long enough to read a 4-line dialog, short enough to report
DEFAULT_TIMEOUT_S = 120.0  # an ordinary agent call, once the gate is settled

# ⚠ Mirrors `SessionGate.EnsureApproved`'s test (`source.Contains("agent")`) in
#   Paracore.Addin/Services/SessionGate.cs. If that test ever changes, change this too.
#   A mismatch here only ever costs a wrong DEADLINE, never a wrong permission.
AGENT_SOURCE_MARKER = "agent"

# ⚠⚠ TRI-STATE: None = never known, True = the session gate is settled, False = unsettled.
#   It is a LAST-KNOWN cache, never the first answer.
#   ⚠⚠ WHY IT MUST BE ASKED AND NOT ASSUMED (2026-10-25, operator): the gate is per
#   SESSION, not per MCP — once one MCP's operator grants it, model / family / forge may
#   all run with NO dialog. A per-process default of False got that wrong: a second MCP
#   started out believing the session was ungated, capped its first call at
#   CONSENT_WAIT_S, and then blamed a consent dialog for a timeout that was really a long
#   automation. `_consent_state()` asks Revit instead, over GetStatus.
_consent_settled = None


def _is_agent_source(source):
    """True when this call can hit the session gate (mirrors SessionGate.cs)."""
    return AGENT_SOURCE_MARKER in (source or "").lower()


def _consent_state():
    """Ask Revit whether the session gate is settled — EVERY call — and fall back to cache.

    Returns True (settled), False (unsettled) or None (never known and could not ask).

    ⚠⚠ ASK EVERY CALL, NOT ONCE PER PROCESS (2026-10-25, forced by the operator's own
    live test). The cached value describes a REVIT SESSION, but the MCP process OUTLIVES
    it: close Revit and reopen it while the MCP server is still running and a cached
    "granted" describes a session that no longer exists. The first call of the new session
    would then get the long deadline and — on a timeout — be told "this is NOT the consent
    dialog" WHILE the dialog is on screen. Exactly the misdiagnosis this whole policy
    exists to prevent, one level up.
    ⚠ MEASURED cost of asking: **22 ms**, taken against a modal consent dialog
    (2026-10-25 20:48) — because `GetStatus` reads a cached UIApplication reference and
    never hops to the Revit UI thread. That is what makes asking affordable.
    ⚠ 2 s deadline: this must never become the thing that stalls the call it is pricing.
    ⚠ On failure, fall back to the LAST KNOWN value rather than to "unknown": the execute
    call that follows shares this channel, so if the ask fails the call is about to fail
    too, and a stale answer is less disruptive than a spurious 60 s cap on a long run.
    ⚠ An OLD installed add-in has no `session_consent` on GetStatus, so this stays None
    and the caller takes the conservative cap — the Python half can therefore ship before
    the add-in is reinstalled.
    """
    global _consent_settled
    try:
        with get_corescript_runner_stub() as stub:
            response = stub.GetStatus(corescript_pb2.GetStatusRequest(), timeout=2)
        state = (getattr(response, "session_consent", "") or "").strip()
    except grpc.RpcError as e:
        # Expected: Revit closed, or an add-in too old to know this RPC's new field.
        logging.debug(f"Session-consent probe unavailable, keeping last known: {e}")
        return _consent_settled
    except Exception:
        # ⚠ NOT silent, and NOT a bare `pass`. A probe must never break the call it is
        #   diagnosing — but a bug here would otherwise hide: a wrong stub in the probe
        #   harness raised TypeError on 2026-10-25 and the broad except made it look
        #   exactly like "the installed add-in has no session_consent field".
        logging.warning("Session-consent probe failed unexpectedly", exc_info=True)
        return _consent_settled
    if state in ("granted", "denied"):
        _consent_settled = True
    elif state == "unsettled":
        _consent_settled = False
    return _consent_settled


def _note_consent(consent):
    """Learn from a response whether the session gate is settled for good.

    ⚠ `""` (NotEvaluated) proves nothing — the run failed before reaching the gate — so
    it must NOT settle the flag, or the next call would be given the long deadline while
    a dialog is still waiting for a person.
    ⚠ `not_required` is deliberately NOT in the list either: it describes THIS CALLER
    (a non-agent run), not the session, and a takeoff process must not be able to make
    a later agent call skip the cap.
    """
    global _consent_settled
    if (consent or "") in ("granted", "already_granted", "denied"):
        _consent_settled = True


def _reset_consent():
    """Revit went away, so its session latch went with it — ASK again next time."""
    global _consent_settled
    _consent_settled = None


def _deadline(requested, source, fallback):
    """The gRPC deadline for ONE call.

    `requested` wins whenever the caller passed one: only the caller knows how long its
    own operation takes (takeoff exports pass 180 s, and that must not be capped).
    """
    if requested is not None:
        return requested
    # ⚠ `is not True` (not `not ...`) on purpose: BOTH "unsettled" and "could not tell"
    #   must take the cap, and only an explicit True earns the long deadline.
    if _is_agent_source(source) and _consent_state() is not True:
        return CONSENT_WAIT_S
    return fallback


def _deadline_message(seconds, source):
    """What to tell the agent when a call ran out of time.

    ⚠ The two causes need OPPOSITE responses, and once the gate has settled only one of
    them is possible — so name it instead of listing both (the old text made a 280 s
    takeoff look like a hung Revit).
    """
    if not _is_agent_source(source):
        # ⚠ THIRD BRANCH (2026-10-25): a caller that can NEVER hit the gate — takeoff —
        #   must not be told "the consent gate is already settled", because its gate was
        #   never consulted at all (`not_required`). Saying so would send the operator
        #   hunting for a dialog that cannot exist.
        return (
            f"Revit did not answer within {seconds:.0f}s.\n\n"
            "No consent gate is involved for this caller, so the cause is one of:\n"
            "  - Revit is showing a dialog, or is otherwise blocked. Look at the Revit "
            "window and clear it.\n"
            "  - The operation is simply LONG. A full finishing takeoff measures ~280 s, "
            "so it cannot fit inside a short deadline. This is a deadline miss, not a "
            "failure.\n\n"
            "IMPORTANT: this deadline does NOT stop the work. Revit runs it on its UI "
            "thread and cannot be interrupted, so it may still be working and may still "
            "finish — wait for Revit to become responsive again before doing anything "
            "else.\n\n"
            "DO NOT RETRY THIS CALL. Revit's API is single-threaded — a retry queues "
            "behind the request that is still running and makes the stall worse. If the "
            "operation is legitimately long, raise the timeout for that call instead of "
            "re-sending it."
        )
    if not _consent_settled:
        return (
            f"Revit did not answer within {seconds:.0f}s.\n\n"
            "MOST LIKELY THE SESSION CONSENT DIALOG: this is the first agent call of the "
            "Revit session, so it may be waiting for a person to answer the Paracore "
            "consent prompt. Nothing has executed yet.\n\n"
            "Ask the operator to answer that dialog — Allow or Block. Do NOT re-send this "
            "call while the dialog is still on screen: Revit's API is single-threaded and "
            "the retry queues behind the block.\n\n"
            "Then call again. That call is cheap and definitive, because the gate latches "
            "its answer for the whole session: it returns `granted` / `already_granted` / "
            "`denied` immediately and tells you exactly what they chose.\n\n"
            "If the operator says NO dialog is on screen, then this call was simply long — "
            "raise the timeout for it and re-send once."
        )
    return (
        f"Revit did not answer within {seconds:.0f}s.\n\n"
        "The consent gate is already settled for this session, so this is NOT the consent "
        "dialog. Two remaining causes:\n"
        "  - Revit is showing some other dialog, or is otherwise blocked. Look at the "
        "Revit window and clear it.\n"
        "  - The script is simply LONG. A full finishing takeoff measures ~280 s, so it "
        "cannot fit inside a short deadline. This is a deadline miss, not a failure.\n\n"
        "IMPORTANT: this deadline does NOT stop the script. Revit runs it on its UI thread "
        "and cannot be interrupted, so it may still be working and may still finish — wait "
        "for Revit to become responsive again before doing anything else.\n\n"
        "DO NOT RETRY THIS CALL. Revit's API is single-threaded — a retry queues behind "
        "the request that is still running and makes the stall worse. If the script is "
        "legitimately long, raise the timeout for that call instead of re-sending it."
    )


def execute_script(script_content, parameters_json, compiled_assembly=None,
                   source="Paracore", timeout=None):
    """Run a compiled script bundle.

    ⚠ `timeout=None` (the default) resolves through `_deadline`: an agent call made
    before the consent gate is settled is capped at CONSENT_WAIT_S, and once settled it
    is UNBOUNDED — which is exactly this function's historical behaviour, so the
    rap-server UI path (source "Paracore", never an agent source) is unaffected.
    """
    timeout = _deadline(timeout, source, None)
    # logging.info("Attempting to execute script via gRPC.")
    with get_corescript_runner_stub() as stub:
        request = corescript_pb2.ExecuteScriptRequest(
            script_content=script_content.encode('utf-8') if script_content else b"",
            parameters_json=parameters_json.encode('utf-8'),
            compiled_assembly=compiled_assembly if compiled_assembly else b"",
            source=source
        )
        try:
            response = stub.ExecuteScript(request, timeout=timeout)
            # logging.info("gRPC ExecuteScript call successful.")
            # Process and return the successful response
            # ⚠ `cap_exempt` (proto field 4, 2026-10-27): the ENGINE says whether the MCP may
            #   truncate this table. A parameter schema must arrive whole — see SchemaRows in
            #   CoreScript.Engine. An older add-in leaves it false, so the cap still applies.
            structured_output_data = [{"type": item.type, "data": item.data, "title": item.title,
                                       "cap_exempt": item.cap_exempt} for item in response.structured_output]
            pipeline_diags = list(getattr(response, 'pipeline_diagnostics', []))
            # ⚠ Learn the gate's state BEFORE returning, so the NEXT call can pick the
            #   right deadline instead of guessing.
            _note_consent(getattr(response, 'session_consent', ""))

            return {
                "is_success": response.is_success,
                "output": response.output,
                "error_message": response.error_message,
                "error_details": list(response.error_details),
                "structured_output": structured_output_data,
                "internal_data": response.internal_data,
                "pipeline_diagnostics": pipeline_diags,
                "user_rejected": getattr(response, 'user_rejected', False),
                # ⚠ WHO satisfied the [Confirm("WORD")] gate, if anyone:
                #   "not_required" / "not_agent_run" / "user_confirmed" / "user_declined" / "unavailable"
                #   "" means the run failed before the gate was reached.
                # `getattr` (not `response.confirmation`) so this file still runs against an OLDER
                # installed engine whose stub predates the field — an AttributeError here would turn
                # a missing diagnostic into a failed call.
                "confirmation": getattr(response, 'confirmation', ""),
                # ⚠ THE SESSION GATE — "a person allowed this Revit session" vs "there was no
                #   gate at all". Same defensive getattr as `confirmation`: an OLDER installed
                #   engine predates the field, and an AttributeError here would turn a missing
                #   diagnostic into a failed call.
                "session_consent": getattr(response, 'session_consent', ""),
            }
        except grpc.RpcError as e:
            if e.code() == grpc.StatusCode.UNAVAILABLE:
                _reset_consent()
                return {
                    "is_success": False,
                    "output": "",
                    "error_message": GRPC_UNAVAILABLE_MSG,
                    "error_details": [],
                    "structured_output": [],
                    "internal_data": "",
                    "user_rejected": False,
                    "confirmation": "",
                    "session_consent": "",
                }
            if e.code() == grpc.StatusCode.DEADLINE_EXCEEDED:
                # ⚠⚠ THIS BRANCH DID NOT EXIST BEFORE 2026-10-25, because this function had
                #   no deadline at all: forge would block on an unanswered consent dialog
                #   FOREVER. It must RETURN a dict, not raise — every `except grpc.RpcError`
                #   here used to re-raise, so a new deadline would have reached forge as an
                #   uncaught traceback instead of a message it can act on.
                return {
                    "is_success": False,
                    "output": "",
                    "error_message": _deadline_message(timeout, source),
                    "error_details": [],
                    "structured_output": [],
                    "internal_data": "",
                    "user_rejected": False,
                    "confirmation": "",
                    "session_consent": "",
                }
            logging.error(format_grpc_error(e))
            raise # Re-raise the gRPC error

def get_script_metadata(script_files):
    with get_corescript_runner_stub() as stub:
        grpc_script_files = [corescript_pb2.ScriptFile(file_name=f['file_name'], content=f['content']) for f in script_files]
        request = corescript_pb2.GetScriptMetadataRequest(script_files=grpc_script_files)
        response = stub.GetScriptMetadata(request)

    # Manually construct the dictionary to ensure empty fields are included (Proto3 omits them by default in MessageToDict)
    # and to avoid version-specific keyword arguments errors.
    m = response.metadata
    metadata_dict = {
        "name": m.name,
        "file_path": m.file_path,
        "description": m.description,
        "author": m.author,
        "categories": list(m.categories),
        "dependencies": list(m.dependencies),
        "document_type": m.document_type,
        "usage_examples": list(m.usage_examples),
        "website": m.website,
        "last_run": m.last_run,
        "is_protected": m.is_protected,
        "is_compiled": m.is_compiled,
        "is_watchdog": m.is_watchdog
    }

    return {
        "metadata": metadata_dict,
        "error_message": response.error_message
    }

def get_script_parameters(script_files):
    with get_corescript_runner_stub() as stub:
        grpc_script_files = [corescript_pb2.ScriptFile(file_name=f['file_name'], content=f['content']) for f in script_files]
        request = corescript_pb2.GetScriptParametersRequest(script_files=grpc_script_files)
        response = stub.GetScriptParameters(request)

    params_to_return = [_build_parameter_dict(p) for p in response.parameters]

    return {
        "parameters": params_to_return,
        "error_message": response.error_message
    }

def get_combined_script(script_files):
    with get_corescript_runner_stub() as stub:
        grpc_script_files = [corescript_pb2.ScriptFile(file_name=f['file_name'], content=f['content']) for f in script_files]
        request = corescript_pb2.GetCombinedScriptRequest(script_files=grpc_script_files)
        response = stub.GetCombinedScript(request)

    return {
        "combined_script": response.combined_script,
        "error_message": response.error_message
    }

def get_bulk_metadata(projects_data: list):
    """
    Fetches metadata for multiple project folders in a single gRPC call.
    projects_data: list of {'project_name': str, 'absolute_path': str, 'files': list of ScriptFiles}
    """
    with get_corescript_runner_stub() as stub:
        grpc_projects = []
        for p in projects_data:
            grpc_files = [corescript_pb2.ScriptFile(file_name=f['file_name'], content=f['content']) for f in p['files']]
            grpc_projects.append(corescript_pb2.ScriptProjectFiles(
                project_name=p['project_name'],
                absolute_path=p['absolute_path'],
                files=grpc_files
            ))
        
        request = corescript_pb2.GetBulkMetadataRequest(projects=grpc_projects)
        response = stub.GetBulkMetadata(request)

    results = []
    for pm in response.project_metadata:
        m = pm.metadata
        metadata_dict = {
            "displayName": m.name,
            "description": m.description,
            "author": m.author,
            "categories": list(m.categories),
            "dependencies": list(m.dependencies),
            "document_type": m.document_type,
            "usage_examples": list(m.usage_examples),
            "website": m.website,
            "lastRun": m.last_run,
            "dateCreated": m.date_created,
            "dateModified": m.date_modified,
            "isProtected": m.is_protected,
            "isCompiled": m.is_compiled,
            "isWatchdog": m.is_watchdog
        }
        
        params_list = [_build_parameter_dict(p, parse_value=True) for p in pm.parameters]

        results.append({
            "project_name": pm.project_name,
            "absolute_path": pm.absolute_path,
            "metadata": metadata_dict,
            "parameters": params_list,
            "error_message": pm.error_message
        })

    return results

def create_and_open_workspace(tool_path: str):
    """
    Tells the Addin to scaffold the Tool folder and open it in VS Code.
    """
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.CreateWorkspaceRequest(
                script_path=tool_path
            )
            response = stub.CreateAndOpenWorkspace(request)
        return {
            "workspace_path": response.workspace_path,
            "error_message": response.error_message
        }
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.UNAVAILABLE:
            return {"workspace_path": "", "error_message": GRPC_UNAVAILABLE_MSG}
        return {"workspace_path": "", "error_message": str(e)}
    except Exception as e:
        return {"workspace_path": "", "error_message": str(e)}

def stop_sync_session(script_path: str):
    """
    Calls the gRPC service to stop file watchers for a given script.
    """
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.StopSyncSessionRequest(script_path=script_path)
            response = stub.StopSyncSession(request)
            return {
                "is_success": response.is_success,
                "error_message": response.error_message
            }
    except Exception as e:
        logging.error(f"Error calling StopSyncSession gRPC: {e}")
        return {"is_success": False, "error_message": str(e)}


def get_context():
    """
    Calls the gRPC service to get the current Revit context (selection, view, etc.).
    """
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.GetContextRequest()
            response = stub.GetContext(request)

        return {
            "active_view_name": response.active_view_name,
            "active_view_type": response.active_view_type,
            "active_view_scale": response.active_view_scale,
            "active_view_detail_level": response.active_view_detail_level,
            "selection_count": response.selection_count,
            "selected_element_ids": list(response.selected_element_ids),
            "selected_elements": [
                {"id": item.id, "category": item.category}
                for item in response.selected_elements
            ],
            "levels": [
                {"id": l.id, "name": l.name, "elevation": l.elevation}
                for l in response.levels
            ],
            "project_info": {
                "name": response.project_info.name,
                "number": response.project_info.number,
                "title": response.project_info.title,
                "file_path": response.project_info.file_path,
                "is_workshared": response.project_info.is_workshared,
                "username": response.project_info.username
            } if response.HasField("project_info") else None
        }
    except Exception:
        logging.error("Error calling GetContext gRPC", exc_info=True)
        raise


def compute_parameter_options(script_content: str, parameter_name: str, parameters: dict = None):
    """
    Calls the gRPC service to execute the {parameter_name}_Options() function in Revit.
    """
    logging.info(f"Attempting to compute options for parameter '{parameter_name}' via gRPC.")
    try:
        parameters_json = json.dumps(parameters or {})
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.ComputeParameterOptionsRequest(
                script_content=script_content,
                parameter_name=parameter_name,
                parameters_json=parameters_json.encode('utf-8')
            )
            response = stub.ComputeParameterOptions(request)
            return {
                "options": list(response.options),
                "is_success": response.is_success,
                "error_message": response.error_message,
                "min": response.min if response.HasField('min') else None,
                "max": response.max if response.HasField('max') else None,
                "step": response.step if response.HasField('step') else None
            }
    except grpc.RpcError as e:
        logging.error(format_grpc_error(e))
        return {
            "options": [],
            "is_success": False,
            "error_message": f"gRPC error: {e.details()}"
        }
    except Exception as e:
        logging.error(f"An unexpected error occurred during gRPC ComputeParameterOptions call: {e}")
        return {
            "options": [],
            "is_success": False,
            "error_message": f"Unexpected error: {str(e)}"
        }

def select_elements(element_ids: list[int]):
        """
        Calls the gRPC service to set the selection in the active Revit document.
        """
        logging.info(f"Attempting to select {len(element_ids)} elements via gRPC.")
        try:
            with get_corescript_runner_stub() as stub:
                request = corescript_pb2.SelectElementsRequest(element_ids=element_ids)
                response = stub.SelectElements(request)
                return {
                    "is_success": response.is_success,
                    "error_message": response.error_message
                }
        except grpc.RpcError as e:
            logging.error(format_grpc_error(e))
            return {
                "is_success": False,
                "error_message": f"gRPC error: {e.details()}"
            }
        except Exception as e:
            logging.error(f"An unexpected error occurred during gRPC SelectElements call: {e}")
            return {
                "is_success": False,
                "error_message": f"Unexpected error: {str(e)}"
            }

def update_element_parameter(element_id: int, parameter_name: str, new_value_string: str, unit: Optional[str] = None):
    """
    Calls the gRPC service to update a parameter on a specific element.
    """
    logging.info(f"Attempting to update parameter '{parameter_name}' on element {element_id} via gRPC (Unit: {unit}).")
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.UpdateElementParameterRequest(
                element_id=element_id,
                parameter_name=parameter_name,
                new_value_string=new_value_string,
                unit=unit or ""
            )
            response = stub.UpdateElementParameter(request)
            return {
                "is_success": response.is_success,
                "error_message": response.error_message
            }
    except grpc.RpcError as e:
        logging.error(format_grpc_error(e))
        return {
            "is_success": False,
            "error_message": f"gRPC error: {e.details()}"
        }
    except Exception as e:
        logging.error(f"An unexpected error occurred during gRPC UpdateElementParameter call: {e}")
        return {
            "is_success": False,
            "error_message": f"Unexpected error: {str(e)}"
        }

def batch_update_element_parameters(updates: list):
    """
    Calls the gRPC service to update multiple parameters in a single transaction.
    `updates` is a list of dicts: [{'element_id': int, 'parameter_name': str, 'new_value_string': str}]
    """
    logging.info(f"Attempting to batch update {len(updates)} parameters via gRPC.")
    try:
        with get_corescript_runner_stub() as stub:
            proto_items = [
                corescript_pb2.ParameterUpdateItem(
                    element_id=int(u["element_id"]),
                    parameter_name=str(u["parameter_name"]),
                    new_value_string=str(u["new_value_string"]),
                    unit=str(u.get("unit") or "")
                ) for u in updates
            ]
            request = corescript_pb2.BatchUpdateElementParametersRequest(updates=proto_items)
            response = stub.BatchUpdateElementParameters(request)
            return {
                "is_success": response.is_success,
                "error_message": response.error_message,
                "count": response.count
            }
    except grpc.RpcError as e:
        logging.error(format_grpc_error(e))
        return {
            "is_success": False,
            "error_message": f"gRPC error: {e.details()}"
        }
    except Exception as e:
        logging.error(f"An unexpected error occurred during gRPC BatchUpdateElementParameters call: {e}")
        return {
            "is_success": False,
            "error_message": f"Unexpected error: {str(e)}"
        }

def pick_object(selection_type: str, category_filter: str = None, timeout: float = 120):
    """
    Calls the gRPC service to let the user pick an object in Revit.

    This BLOCKS Revit's UI thread until the user clicks (or cancels). The timeout is a
    backstop so a tool call cannot hang forever if the user walks away — Revit returns
    cancelled=True when the user presses Escape, which is the normal exit path.
    """
    logging.info(f"Attempting to pick object (Type: {selection_type}, Filter: {category_filter}) via gRPC.")
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.PickObjectRequest(
                selection_type=selection_type,
                category_filter=category_filter if category_filter else ""
            )
            response = stub.PickObject(request, timeout=timeout)
            return {
                "value": response.value,
                "is_success": response.is_success,
                "cancelled": response.cancelled,
                "error_message": response.error_message
            }
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.UNAVAILABLE:
            return {
                "value": "",
                "is_success": False,
                "cancelled": False,
                "error_message": GRPC_UNAVAILABLE_MSG
            }
        if e.code() == grpc.StatusCode.DEADLINE_EXCEEDED:
            return {
                "value": "",
                "is_success": False,
                "cancelled": True,
                "error_message": (
                    f"No pick within {timeout:.0f}s — nothing was selected. Ask the user to "
                    f"pick an element in Revit, or press Escape to cancel deliberately."
                )
            }
        logging.error(format_grpc_error(e))
        return {
            "is_success": False,
            "error_message": f"gRPC error: {e.details()}"
        }
    except Exception as e:
        logging.error(f"An unexpected error occurred during gRPC PickObject call: {e}")
        return {
            "is_success": False,
            "error_message": f"Unexpected error: {str(e)}"
        }

def rename_script(old_path: str, new_name: str):
    """
    Calls the gRPC service to rename a script file.
    """
    logging.info(f"Attempting to rename script '{old_path}' to '{new_name}' via gRPC.")
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.RenameScriptRequest(
                old_path=old_path,
                new_name=new_name
            )
            response = stub.RenameScript(request)
            return {
                "is_success": response.is_success,
                "new_path": response.new_path,
                "error_message": response.error_message
            }
    except grpc.RpcError as e:
        logging.error(format_grpc_error(e))
        return {
            "is_success": False,
            "new_path": "",
            "error_message": f"gRPC error: {e.details()}"
        }
    except Exception as e:
        logging.error(f"An unexpected error occurred during gRPC RenameScript call: {e}")
        return {
            "is_success": False,
            "new_path": "",
            "error_message": f"Unexpected error: {str(e)}"
        }
def build_script(script_content):
    """
    Calls the gRPC service to compile a script and return the assembly bytes.
    """
    logging.info("Attempting to build script via gRPC.")
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.BuildScriptRequest(
                script_content=script_content
            )
            response = stub.BuildScript(request)
            return {
                "is_success": response.is_success,
                "compiled_assembly": response.compiled_assembly,
                "error_message": response.error_message
            }
    except grpc.RpcError as e:
        logging.error(format_grpc_error(e))
        return {
            "is_success": False,
            "error_message": f"gRPC error: {e.details()}"
        }
    except Exception as e:
        logging.error(f"An unexpected error occurred during gRPC BuildScript call: {e}")
        return {
            "is_success": False,
            "error_message": f"Unexpected error: {str(e)}"
        }

def get_category_parameters(category_name: str):
    """
    Calls the gRPC service to get parameter definitions for a category.
    """
    logging.info(f"Fetching parameters for category: {category_name}")
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.GetCategoryParametersRequest(category_name=category_name)
            response = stub.GetCategoryParameters(request)
            
            params = []
            for p in response.parameters:
                # Differentiate identical names with extra context: Name [StorageType][Type/Instance][BuiltInName]
                storage = p.storage_type or "Unknown"
                is_type_val = getattr(p, 'is_type', False)
                type_or_instance = "Type" if is_type_val else "Instance"
                builtin = p.builtin_name if p.builtin_name else ""
                
                # Compose enriched display name
                display_name = f"{p.name} [{storage}][{type_or_instance}]"
                if builtin:
                    display_name += f"[{builtin}]"

                params.append({
                    "name": p.name,
                    "displayName": display_name,
                    "storage_type": p.storage_type,
                    "is_builtin": p.is_builtin,
                    "builtin_id": p.builtin_id,
                    "builtin_name": p.builtin_name,
                    "revit_element_type": p.revit_element_type,
                    "spec_type_id": p.spec_type_id,
                    "is_type": is_type_val
                })
            
            return {
                "parameters": params,
                "error_message": response.error_message
            }
    except grpc.RpcError as e:
        logging.error(format_grpc_error(e))
        return {
            "parameters": [],
            "error_message": f"gRPC error: {e.details()}"
        }
def unregister_watchdog_source(path: str):
    """
    Calls the gRPC service to stop all watchdogs from a specific source folder.
    """
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.UnregisterWatchdogSourceRequest(path=path)
            response = stub.UnregisterWatchdogSource(request)
            return {
                "is_success": response.is_success,
                "error_message": response.error_message,
                "watchdogs_removed": response.watchdogs_removed
            }
    except grpc.RpcError as e:
        logging.error(format_grpc_error(e))
        return {
            "is_success": False,
            "error_message": f"gRPC Error: {e.details()}",
            "watchdogs_removed": 0
        }
    except Exception as e:
        logging.error(f"Error calling UnregisterWatchdogSource: {e}")
        return {
            "is_success": False,
            "error_message": str(e),
            "watchdogs_removed": 0
        }

def clear_assembly_cache():
    """
    Calls the gRPC service to clear the internal in-memory assembly cache.
    """
    try:
        with get_corescript_runner_stub() as stub:
            response = stub.ClearAssemblyCache(corescript_pb2.ClearAssemblyCacheRequest())
            return {
                "is_success": response.is_success,
                "message": response.message
            }
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.UNAVAILABLE:
            return {"is_success": False, "message": GRPC_UNAVAILABLE_MSG}
        logging.error(format_grpc_error(e))
        return {"is_success": False, "message": f"gRPC Error: {e.details()}"}

def execute_repl(code: str, session_id: str, license_tier: str = "free",
                 execution_mode: str = "read_write", source: str = "paracore",
                 timeout: float = None):
    """
    Calls the gRPC service to execute a REPL command in Revit.

    Args:
        code: The C# code to execute.
        session_id: Session identifier for REPL state persistence.
        license_tier: License tier string.
        execution_mode: "read_only" or "read_write" (default).
        source: Caller identifier — "mcp_agent", "paracore_agent", "paracore_ui", "paracore".
        timeout: gRPC deadline in seconds. ⚠⚠ `None` (the default) is NOT "no deadline":
            it means "apply the session-gate policy" — see `_deadline` above. An agent
            call made before the consent gate is settled gets CONSENT_WAIT_S (a person
            has to click); once settled it gets DEFAULT_TIMEOUT_S. Passing a number
            always wins, for callers running LONG jobs (the bundled GetAllTakeoffs
            export passes 180 s and must never be capped).
            ⚠ DEFAULT_TIMEOUT_S is TOO SMALL for a full takeoff — MEASURED ~280 s
            (2026-09-30). A user-typed REPL command goes through
            rap-server's execute_repl_logic, which passes 600 s; keep that in
            mind before lowering anything here.
    """
    timeout = _deadline(timeout, source, DEFAULT_TIMEOUT_S)
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.ExecuteReplRequest(
                code=code,
                session_id=session_id,
                license_tier=license_tier,
                execution_mode=execution_mode,
                source=source
            )
            # ⚠⚠ THE IN-FLIGHT GATE — tell the resident dialog watcher that a Revit
            #   round-trip is WAITING, so it may answer a modal failure dialog that
            #   blocks THIS call. Outside this window the watcher must not touch any
            #   dialog: the operator may have opened one by hand.
            #   ⚠ Resolved via sys.modules, never re-imported by path — a second copy
            #   of the module would own a DIFFERENT _call_depth and the gate would
            #   silently never open.
            import sys as _sys
            _gate = None
            for _name in ("mcp_core.dialog_watcher", "forge_core.dialog_watcher"):
                _mod = _sys.modules.get(_name)
                if _mod is not None and hasattr(_mod, "revit_call"):
                    _gate = _mod.revit_call
                    break
            if _gate is None:
                response = stub.ExecuteRepl(request, timeout=timeout)
            else:
                with _gate():
                    response = stub.ExecuteRepl(request, timeout=timeout)
            structured_output_data = [{"type": item.type, "data": item.data, "title": item.title,
                                       "cap_exempt": getattr(item, "cap_exempt", False)}
                                      for item in getattr(response, 'structured_output', [])]
            pipeline_diags = list(getattr(response, 'pipeline_diagnostics', []))
            # ⚠ Learn the gate's state BEFORE returning, so the NEXT call can pick the
            #   right deadline instead of guessing.
            _note_consent(getattr(response, 'session_consent', ""))
            return {
                "is_success": response.is_success,
                "output": response.output,
                "error_message": response.error_message,
                "structured_output": structured_output_data,
                "pipeline_diagnostics": pipeline_diags,
                "user_rejected": getattr(response, 'user_rejected', False),
                "read_only_violation": getattr(response, 'read_only_violation', False),
                # ⚠ Same contract as ExecuteScript — see the note there.
                "session_consent": getattr(response, 'session_consent', ""),
            }
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.UNAVAILABLE:
            _reset_consent()
            return {"is_success": False, "output": "", "error_message": GRPC_UNAVAILABLE_MSG,
                    "user_rejected": False, "read_only_violation": False, "session_consent": ""}
        if e.code() == grpc.StatusCode.DEADLINE_EXCEEDED:
            # ⚠ The text is chosen by `_deadline_message`, NOT fixed here: the two causes
            # need OPPOSITE responses, and once the consent gate has settled only one of
            # them is still possible. A fixed message made a 280 s takeoff look like a
            # hung Revit (MEASURED 2026-09-30 — the old text said only "likely busy, or
            # showing a modal dialog").
            # The deadline does NOT cancel the work either: ReplHandler runs the script on
            # the Revit UI thread and AddinBridgeService.RelayTaskAsync ignores
            # CancellationToken, so Revit stays busy after this error appears.
            return {"is_success": False, "output": "",
                    "error_message": _deadline_message(timeout, source),
                    "user_rejected": False, "read_only_violation": False, "session_consent": ""}
        logging.error(format_grpc_error(e))
        return {"is_success": False, "output": "", "error_message": f"gRPC Error: {e.details()}",
                "user_rejected": False, "read_only_violation": False, "session_consent": ""}
    except Exception as e:
        logging.error(f"Error calling ExecuteRepl gRPC: {e}")
        return {"is_success": False, "output": "", "error_message": str(e),
                "user_rejected": False, "read_only_violation": False, "session_consent": ""}


def get_repl_completions(code: str, caret_offset: int, session_id: str = "global",
                         timeout: float = 10.0):
    """
    Calls the gRPC service to get IntelliSense completions for a REPL buffer.

    Read-only: the add-in compiles the buffer in an in-memory Roslyn workspace and
    returns completion suggestions. It never executes the code and never touches the
    Revit document, so it does NOT need the Revit UI thread.

    ⚠ Short timeout on purpose (default 10 s). Completion runs on EVERY keystroke, so a
    slow answer is worse than no answer: the editor debounces and cancels superseded
    requests, and a hung completion must never block typing. Never raise this to the
    REPL execution deadline (600 s) — that would make the editor feel frozen.
    """
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.GetReplCompletionsRequest(
                code=code,
                caret_offset=caret_offset,
                session_id=session_id,
            )
            response = stub.GetReplCompletions(request, timeout=timeout)
            items = [
                {
                    "label": item.label,
                    "insert_text": item.insert_text,
                    "kind": item.kind,
                    "detail": item.detail,
                    "sort_text": item.sort_text,
                }
                for item in response.items
            ]
            return {
                "is_success": response.is_success,
                "items": items,
                "error_message": response.error_message,
            }
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.UNAVAILABLE:
            return {"is_success": False, "items": [], "error_message": GRPC_UNAVAILABLE_MSG}
        if e.code() == grpc.StatusCode.DEADLINE_EXCEEDED:
            # Completion is an editor convenience — a miss is silent, never an error
            # the user must read. The editor simply shows nothing and tries again on
            # the next keystroke.
            return {"is_success": False, "items": [],
                    "error_message": f"completion timed out after {timeout:.0f}s"}
        logging.error(format_grpc_error(e))
        return {"is_success": False, "items": [], "error_message": f"gRPC Error: {e.details()}"}
    except Exception as e:
        logging.error(f"Error calling GetReplCompletions gRPC: {e}")
        return {"is_success": False, "items": [], "error_message": str(e)}


def get_repl_diagnostics(code: str, session_id: str = "global", timeout: float = 15.0):
    """
    Calls the gRPC service for REPL diagnostics (the red squiggles).

    Read-only: the add-in compiles the buffer in the same in-memory Roslyn workspace as
    completion and returns warnings/errors in the buffer's own coordinates. It never
    executes the code and never touches the Revit document.

    ⚠ Slightly longer timeout than completion (15 s vs 10 s): diagnostics need a full
    compilation, not just a semantic query, and they are requested on idle rather than on
    every keystroke — a slow answer here does not block typing.
    """
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.GetReplDiagnosticsRequest(
                code=code,
                session_id=session_id,
            )
            response = stub.GetReplDiagnostics(request, timeout=timeout)
            items = [
                {
                    "start_line": item.start_line,
                    "start_column": item.start_column,
                    "end_line": item.end_line,
                    "end_column": item.end_column,
                    "message": item.message,
                    "severity": item.severity,
                }
                for item in response.items
            ]
            return {
                "is_success": response.is_success,
                "items": items,
                "error_message": response.error_message,
            }
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.UNAVAILABLE:
            return {"is_success": False, "items": [], "error_message": GRPC_UNAVAILABLE_MSG}
        if e.code() == grpc.StatusCode.DEADLINE_EXCEEDED:
            return {"is_success": False, "items": [],
                    "error_message": f"diagnostics timed out after {timeout:.0f}s"}
        logging.error(format_grpc_error(e))
        return {"is_success": False, "items": [], "error_message": f"gRPC Error: {e.details()}"}
    except Exception as e:
        logging.error(f"Error calling GetReplDiagnostics gRPC: {e}")
        return {"is_success": False, "items": [], "error_message": str(e)}


def get_repl_hover(code: str, caret_offset: int, session_id: str = "global",
                   timeout: float = 10.0):
    """
    Calls the gRPC service for REPL symbol hover.

    Read-only: the add-in resolves the symbol under the caret in the same in-memory Roslyn
    workspace as completion and diagnostics, and returns its signature and XML documentation.
    It never executes the code and never touches the Revit document.

    ⚠ "Nothing to show" is NOT an error. A caret over whitespace comes back `is_success`
    True with `info` None; the editor simply shows no tooltip. Do not turn that into a
    failure the UI has to special-case.

    ⚠ Same short timeout as completion: hover fires as the mouse moves, so a slow answer is
    worse than no answer.
    """
    try:
        with get_corescript_runner_stub() as stub:
            request = corescript_pb2.GetReplHoverRequest(
                code=code,
                caret_offset=caret_offset,
                session_id=session_id,
            )
            response = stub.GetReplHover(request, timeout=timeout)

            # ⚠ `HasField` is the only reliable presence test for a message field in proto3:
            # reading `response.info` when it was never set yields a DEFAULT instance, not
            # None, so `if response.info:` would be truthy for an empty tooltip.
            info = None
            if response.HasField("info"):
                info = {
                    "signature": response.info.signature,
                    "documentation": response.info.documentation,
                    "kind": response.info.kind,
                    "start_line": response.info.start_line,
                    "start_column": response.info.start_column,
                    "end_line": response.info.end_line,
                    "end_column": response.info.end_column,
                }
            return {
                "is_success": response.is_success,
                "info": info,
                "error_message": response.error_message,
            }
    except grpc.RpcError as e:
        if e.code() == grpc.StatusCode.UNAVAILABLE:
            return {"is_success": False, "info": None, "error_message": GRPC_UNAVAILABLE_MSG}
        if e.code() == grpc.StatusCode.DEADLINE_EXCEEDED:
            return {"is_success": False, "info": None,
                    "error_message": f"hover timed out after {timeout:.0f}s"}
        logging.error(format_grpc_error(e))
        return {"is_success": False, "info": None, "error_message": f"gRPC Error: {e.details()}"}
    except Exception as e:
        logging.error(f"Error calling GetReplHover gRPC: {e}")
        return {"is_success": False, "info": None, "error_message": str(e)}
