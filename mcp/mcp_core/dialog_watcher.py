"""
dialog_watcher.py — THE SECOND EYE, resident inside every Paracore MCP server.

WHAT PROBLEM THIS SOLVES
    Revit reports most failures as a modal TaskDialog on its UI thread. An MCP tool
    call runs C# ON that thread inside a transaction, so when a dialog appears the
    very thread that must return the result is the one parked in the dialog's modal
    loop. The call never returns, the agent cannot act, and the client eventually
    times out. The agent cannot dismiss the dialog either — it IS what is blocked.

    The answer must therefore come from somewhere that is ALREADY RUNNING when the
    dialog appears. That is this module: a daemon thread started at server boot,
    which outlives every tool call.

WHY A THREAD AND NOT A SUBPROCESS
    The MCP server process is NOT blocked while a tool call is in flight — it is
    waiting on a gRPC socket, so its other threads keep running. A thread here can
    therefore watch and click while the call that provoked the dialog sits parked.
    (The alternative — spawning a helper process per call — is useless: the call
    that would launch it is the one hung on the dialog.)

WHY A NAMED MUTEX
    Several Paracore MCP servers can be running at once (gen, forge, model, takeoff).
    If each one clicked, they would race and could answer the same dialog twice, or
    with two different buttons. So every process MAY watch, but only the one that
    wins `Paracore.DialogWatcher.v1` may ACT. Election is per-dialog and needs no
    leader: whoever grabs the mutex clicks, everyone else skips that dialog.

DESIGN RULES (the user's ruling, 2026-10-09 — verbatim)
    "Never supress. just watch from outside and close it. i know revit is
     single-threaded and can't do stuff while that dialog is still open, but the
     other solutions of supressing are a disaster. do not interfere with the rolling
     back of transaction, etc... the transaction is already correct - i.e if
     something fails it rolls back and that is what we need."

    * NEVER suppress a failure from inside Revit. The engine is unmodified.
    * NEVER interfere with transaction rollback. If an edit fails, Revit rolls it
      back, and that is CORRECT — this module must not prevent or fake that.
    * ONLY click the button a human would click, so Revit proceeds on its own terms.
    * Log every action so the agent can read what happened and then ADJUST the model.
    * ⚠⚠ **ACT ONLY INSIDE `revit_call()`.** A dialog is answered ONLY while one of
      OUR OWN calls is waiting on it — never while the operator is working by hand.
      ⚠ This was added after the watcher closed the operator's own "Type Properties"
      editor 8× in 60 s (2026-10-10 08:07). A dialog's BUTTONS cannot distinguish
      "our call is blocked on this" from "the human opened this", so the watcher is
      TOLD, not left to guess. Outside a call it watches and logs only.

THE DECISION (the user's ruling, 2026-10-10 — verbatim)
    "the idea is not to remove the insert conflict. the idea is what is better by
     reading the warning: to click 'Okay' or 'Cancel'? in the case of creating door
     that cause that error, canceling undoes the creation. so that is not what you
     have to do. just allow so 'Ok', and then later zoom to the door and identify the
     insert conflict and then push/or adjust it... for other warning dialogs,
     clicking cancel may be work, because 'Okay' wont work."

⚠⚠ MEASURED LIMITATION — THE FAILURE TEXT CANNOT BE READ FROM OUTSIDE.
    A Revit failure TaskDialog exposes only its BUTTONS as text-bearing windows; the
    description ("Insert conflicts with joined Wall.") is drawn by a custom control
    that publishes no window text. So the decision is made from the BUTTON SET, which
    is also what a human reads:

        OK + Cancel     -> WARNING   -> press OK. Revit keeps the edit; we fix geometry after.
        OK + Delete     -> ERROR     -> press NEITHER. Discarding an edit is the user's call.
        Cancel only     -> no host   -> Cancel is the only answer Revit offers.
        OK only         -> informational -> press OK.

KILL SWITCH
    Set PARACORE_WATCH_DIALOGS=0 to disable the thread entirely.

LOG
    %APPDATA%\\paracore-data\\logs\\DialogWatcher.txt
"""
from __future__ import annotations

import contextlib
import ctypes
import ctypes.wintypes as wt
import datetime as dt
import os
import sys
import threading
import time

# ---------------------------------------------------------------------------
# Win32
# ---------------------------------------------------------------------------
user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32

try:
    user32.SetProcessDPIAware()
except Exception:
    pass

EnumWindows = user32.EnumWindows
EnumChildWindows = user32.EnumChildWindows
GetWindowTextW = user32.GetWindowTextW
GetWindowTextLengthW = user32.GetWindowTextLengthW
GetClassNameW = user32.GetClassNameW
IsWindowVisible = user32.IsWindowVisible
IsWindow = user32.IsWindow
IsWindowEnabled = user32.IsWindowEnabled
GetWindow = user32.GetWindow
GetWindowRect = user32.GetWindowRect
SendMessageW = user32.SendMessageW
PostMessageW = user32.PostMessageW
SetForegroundWindow = user32.SetForegroundWindow
SetCursorPos = user32.SetCursorPos
mouse_event = user32.mouse_event

# ⚠ HANDLE IS POINTER-SIZED. Without an explicit restype, ctypes assumes C int and
#   TRUNCATES the handle on 64-bit — the mutex would then be a garbage value and
#   WaitForSingleObject would fail for every process, so nobody would ever click.
kernel32.CreateMutexW.restype = wt.HANDLE
kernel32.CreateMutexW.argtypes = [wt.LPVOID, wt.BOOL, wt.LPCWSTR]
kernel32.WaitForSingleObject.restype = wt.DWORD
kernel32.WaitForSingleObject.argtypes = [wt.HANDLE, wt.DWORD]
kernel32.ReleaseMutex.restype = wt.BOOL
kernel32.ReleaseMutex.argtypes = [wt.HANDLE]

GW_OWNER = 4
BM_CLICK = 0x00F5
MOUSEEVENTF_LEFTDOWN = 0x0002
MOUSEEVENTF_LEFTUP = 0x0004

MUTEX_NAME = "Paracore.DialogWatcher.v1"
WAIT_OBJECT_0 = 0x00000000

POLL_SECONDS = 0.25
CLICK_WAIT = 1.2
MUTEX_WAIT_MS = 4000          # long enough to beat another process's click, short enough not to stall

LOG_NAME = "DialogWatcher.txt"

# "keep the edit and continue" — Revit's own default for a WARNING.
KEEP_LABELS = ["ok", "&ok", "close", "&close", "continue", "&continue",
               "yes", "&yes", "accept", "&accept", "keep", "&keep"]

# "discard the edit / undo the creation" — Revit's own default for an ERROR.
DISCARD_LABELS = ["cancel", "&cancel",
                  "delete element(s)", "&delete element(s)",
                  "delete elements", "&delete elements",
                  "no", "&no", "unjoin elements", "&unjoin elements"]

DIALOG_CLASSES = ("#32770", "WindowsForms10.Window")

# Revit's TaskDialog chrome — never a decision.
CHROME = {"&>>", "&<<", "&show", "more &info", "&expand >>", "&expand <<",
          "warning", "callback", "resolve first error:", "errors and warnings"}

# ⚠⚠ DIALOG TITLES THAT ARE NEVER A FAILURE — editor windows the OPERATOR opens by
# hand. Belt-and-braces only; the in-flight gate below is the real protection.
# ⚠ This list is inherently INCOMPLETE. Add to it whenever a new false positive is
# seen. Measured 2026-10-10: "Type Properties" (buttons OK+Cancel) was matched by
# rule 2 and closed EIGHT times in ~60 s while the user was editing a door family.
DENY_TITLES = {
    "type properties", "family types", "family editor",
    "project browser", "visibility/graphics override",
    "project not saved recently",
    "manage links", "manage images", "keyboard shortcuts",
}


# ---------------------------------------------------------------------------
# THE IN-FLIGHT GATE — the watcher may ONLY answer a dialog OUR OWN call is on
# ---------------------------------------------------------------------------
# ⚠⚠ WHY THIS EXISTS (measured failure, 2026-10-10 08:07-08:08):
#   A dialog's BUTTON SET cannot tell "our tool call is blocked on this" from "the
#   human just opened this". Without a gate the watcher answered the operator's own
#   editor windows. The watcher cannot know — so it must be TOLD. Every Revit
#   round-trip is wrapped in revit_call(); OUTSIDE one, the watcher only watches.
#
#   This is also what makes the watcher safe to leave resident in every MCP: it is
#   inert unless one of OUR calls is actually waiting on a dialog.
#
# ⚠ The flag is PROCESS-LOCAL, and that is CORRECT: the dialog was provoked by
#   whichever server made the call, so only that server may answer it. Another
#   Paracore process (with no call in flight) keeps its hands off.
_call_depth = 0
_call_lock = threading.Lock()


@contextlib.contextmanager
def revit_call():
    """
    Mark a Revit round-trip as IN FLIGHT for as long as it runs.

    Wrap the blocking gRPC call, NOT the surrounding tool: the flag must stay set
    while Revit sits parked in a modal dialog, which is exactly when the watcher
    needs permission to act. Safe to nest.
    """
    global _call_depth
    with _call_lock:
        _call_depth += 1
    try:
        yield
    finally:
        with _call_lock:
            _call_depth -= 1


def call_in_flight() -> bool:
    """True while this process has a Revit call waiting. The watcher's permission."""
    with _call_lock:
        return _call_depth > 0


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
_log_lock = threading.Lock()


def _log_path() -> str:
    return os.path.join(os.environ.get("APPDATA", ""), "paracore-data",
                        "logs", LOG_NAME)


def log(msg: str) -> None:
    line = "%s\t%s\n" % (dt.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), msg)
    with _log_lock:
        try:
            p = _log_path()
            d = os.path.dirname(p)
            if d and not os.path.isdir(d):
                os.makedirs(d, exist_ok=True)
            with open(p, "a", encoding="utf-8") as fh:
                fh.write(line)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Window helpers
# ---------------------------------------------------------------------------
def wtext(h) -> str:
    n = GetWindowTextLengthW(h)
    buf = ctypes.create_unicode_buffer(n + 2)
    GetWindowTextW(h, buf, n + 2)
    return buf.value


def wclass(h) -> str:
    buf = ctypes.create_unicode_buffer(256)
    GetClassNameW(h, buf, 256)
    return buf.value


def top_level():
    out = []

    @ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, wt.LPARAM)
    def cb(h, l):
        out.append(h)
        return True

    EnumWindows(cb, 0)
    return out


def children(h):
    out = []

    @ctypes.WINFUNCTYPE(ctypes.c_bool, wt.HWND, wt.LPARAM)
    def cb(c, l):
        out.append(c)
        return True

    EnumChildWindows(h, cb, 0)
    return out


def find_revit():
    """
    The Revit MAIN window — not one of its dialogs.

    ⚠⚠ MEASURED TRAP: a Revit failure TaskDialog carries the title
    "Autodesk Revit 2025" — the SAME prefix as the main window
    ("Autodesk Revit 2025.4 - [OneStorehouse...rvt - ...]"). A title test alone can
    therefore return the DIALOG, and the watcher then "watches" the dialog while
    being blind to it AS a dialog. That bug actually happened.

    The main window is identified by a property a modal dialog cannot have:
        GetWindow(h, GW_OWNER) == 0     (a modal dialog is ALWAYS owned)
    plus the '[<file>.rvt' bracket only the main window carries.
    """
    for h in top_level():
        if not IsWindowVisible(h):
            continue
        t = wtext(h)
        if not t.startswith("Autodesk Revit"):
            continue
        if GetWindow(h, GW_OWNER) != 0:
            continue
        if ".rvt]" in t.lower() or " - [" in t:
            return h
    for h in top_level():
        if IsWindowVisible(h) and GetWindow(h, GW_OWNER) == 0:
            t = wtext(h)
            if t.startswith("Autodesk Revit") and "20" in t:
                return h
    return None


def is_button(h) -> bool:
    cl = wclass(h)
    return cl.startswith("Button") or cl.endswith("Button")


def dialog_buttons(h):
    """Buttons inside a dialog, searched two levels deep. -> [(hwnd, label, enabled)]"""
    found = []
    for c in children(h):
        if is_button(c):
            t = wtext(c)
            if t:
                found.append((c, t, bool(IsWindowEnabled(c))))
    if not found:
        for c in children(h):
            for g in children(c):
                if is_button(g):
                    t = wtext(g)
                    if t:
                        found.append((g, t, bool(IsWindowEnabled(g))))
    return found


def actionable_buttons(buttons):
    """
    Only the buttons a human would actually click.

    ⚠ A Revit failure TaskDialog carries ~9 Button-class children: `&OK`, `&Cancel`,
    `&Show`, `More &Info`, `&Expand >>` and hidden `&>>`/`&<<`/`Callback` chrome.
    An earlier "at most N buttons" heuristic dropped the whole dialog and the watcher
    reported nothing. Chrome is filtered BY NAME here, never by count.
    """
    out, seen = [], set()
    for h, t, en in buttons:
        lab = t.strip().lower()
        if not en or lab in CHROME or lab in seen:
            continue
        seen.add(lab)
        out.append((h, t, en))
    return out


def extract_dialog_text(h) -> str:
    """
    Any Static/SysLink text in the dialog.

    ⚠ MEASURED: for a Revit failure TaskDialog this is EMPTY. Only the buttons
    publish text. Kept because a future Revit, or a different dialog, may publish it
    — and because a non-empty result is genuinely useful when it happens.
    """
    parts = []
    for c in children(h):
        if is_button(c):
            continue
        for g in [c] + children(c):
            if is_button(g):
                continue
            gl = wclass(g)
            if gl.startswith("Static") or "Link" in gl or "Text" in gl:
                t = wtext(g)
                if t.strip():
                    parts.append(t.strip())
    return " | ".join(dict.fromkeys(parts))


# ---------------------------------------------------------------------------
# THE FAILURE MESSAGE — what the dialog is actually complaining about
# ---------------------------------------------------------------------------
# ⚠⚠ MEASURED LIVE, 2026-10-10 (Revit 2025.4). `GetWindowTextW` returns the CAPTION
#   of another process's window, not its content. For a Button the caption IS the
#   label, so buttons read fine — but a Revit failure TaskDialog carries its message
#   in an `Edit`-class control whose caption is EMPTY, so `GetWindowTextW` gives "".
#   That is the entire reason this file used to claim the text "cannot be read from
#   outside": the MECHANISM was wrong, not the window.
#
#   `SendMessageW(WM_GETTEXT)` asks the owning thread for the real text, and the
#   system marshals it across processes. Measured on the same control, same instant:
#       GetWindowTextW           -> ""
#       SendMessageW(WM_GETTEXT) -> "Highlighted walls overlap. One of them may be
#                                    ignored when Revit finds room boundaries. ..."
#
#   ⚠ No new dependency — the same ctypes/user32 the rest of this module already uses.
WM_GETTEXT = 0x000D
WM_GETTEXTLENGTH = 0x000E


def wtext_xproc(h) -> str:
    """Another process's window text — the CONTENT, not the caption (see above)."""
    try:
        n = int(SendMessageW(h, WM_GETTEXTLENGTH, 0, 0))
    except Exception:
        return wtext(h)
    if n <= 0:
        return wtext(h)
    buf = ctypes.create_unicode_buffer(n + 4)
    try:
        SendMessageW(h, WM_GETTEXT, len(buf), buf)
    except Exception:
        return wtext(h)
    return buf.value


def _is_counter(t: str) -> bool:
    """True for the bare "1 of 1" counter a multi-failure dialog carries."""
    p = t.split()
    return len(p) == 3 and p[1] == "of" and p[0].isdigit() and p[2].isdigit()


def failure_text(h) -> str:
    """
    The dialog's FAILURE MESSAGE — the `Edit` control(s), read cross-process.

    ⚠ A Revit failure TaskDialog puts the message in an Edit-class control that
    `extract_dialog_text` never looks at (it scans only Static/Link/Text classes)
    AND that `GetWindowTextW` reports as empty. Both had to be fixed at once.
    """
    parts = []
    for c in children(h):
        if is_button(c):
            continue
        for g in [c] + children(c):
            if is_button(g):
                continue
            cl = wclass(g)
            if cl == "Edit" or cl.startswith("Edit"):
                t = wtext_xproc(g).strip()
                if t and not _is_counter(t):
                    parts.append(t)
    return " | ".join(dict.fromkeys(parts))


# ---------------------------------------------------------------------------
# THE CAPTURE BUFFER — what the watcher answered, for the agent to read back
# ---------------------------------------------------------------------------
# ⚠ The agent's tool result is assembled by the MCP's tools.py AFTER the call
#   returns; the watcher cannot reach into it. So the watcher leaves a record here
#   and tools.py drains it (pop_captured) and appends it to the result.
# ⚠ Only dialogs answered INSIDE revit_call() are recorded, so a drain right after
#   the call yields exactly that call's dialogs — no correlation problem.
_captured = []
_captured_lock = threading.Lock()


def _record(entry) -> None:
    with _captured_lock:
        _captured.append(entry)


def pop_captured() -> list:
    """Return the dialogs recorded since the last drain, and clear them."""
    with _captured_lock:
        out = list(_captured)
        _captured.clear()
    return out


def scan_dialogs(revit_hwnd):
    """Modal dialogs owned by the Revit main window."""
    out = []
    for h in top_level():
        if h == revit_hwnd:
            continue
        if not IsWindowVisible(h) or not IsWindowEnabled(h):
            continue
        if not wclass(h).startswith(DIALOG_CLASSES):
            continue
        if GetWindow(h, GW_OWNER) != revit_hwnd:
            continue
        # ⚠ Editor windows the operator opens by hand are never a failure we are
        #   blocked on — see DENY_TITLES. Checked BEFORE the button test, because a
        #   "Type Properties" dialog has OK+Cancel and would otherwise look like a
        #   warning to rule 2.
        if wtext(h).strip().lower() in DENY_TITLES:
            continue
        btns = actionable_buttons(dialog_buttons(h))
        if not btns:
            continue
        labels = {t.strip().lower() for _, t, _ in btns}
        if not (labels & set(KEEP_LABELS) or labels & set(DISCARD_LABELS)):
            continue
        out.append({"hwnd": h, "cls": wclass(h), "title": wtext(h),
                    "text": extract_dialog_text(h), "message": failure_text(h),
                    "buttons": btns})
    return out


def find_button(buttons, labels):
    """First enabled button whose label is in `labels`, in the given order."""
    for w in labels:
        for h, t, en in buttons:
            if t.strip().lower() == w:
                return (h, t, en) if en else (None, t, False)
    return (None, None, False)


def decide(dlg, prefer="keep"):
    """
    -> (hwnd, label, action, reason). action in {keep, discard, needs-human}.

    ⚠⚠ ORDER ENCODES THE USER'S RULING (2026-10-10): **if a keep-option exists,
    PRESS IT** — even when the dialog ALSO offers a Delete button. A Delete button
    is NEVER pressed: removing an element on the user's behalf is the one thing the
    ruling forbids. Cancel is used only when Revit offers no way to keep the edit,
    and a rollback is then CORRECT.

    ⚠ What this replaced: an earlier rule 1 sent "OK + Delete" to NEEDS-HUMAN, on the
    reasoning that "discarding an edit is the user's call". That was wrong twice —
    pressing OK discards NOTHING (only Delete would), and in an UNATTENDED run there
    is no operator to answer, so the dialog was never answered at all and the whole
    modelling session deadlocked (measured: Claude Desktop, 2026-10-10 08:01).
    """
    buttons = dlg["buttons"]

    # ⚠ A Delete button is never ours to press — drop them from every candidate list
    #   before any rule looks at them, so no later rule can reach one by accident.
    safe = [(h, t, en) for h, t, en in buttons if "delete" not in t.strip().lower()]

    labels = {t.strip().lower() for _, t, _ in safe}
    has_keep = bool(labels & set(KEEP_LABELS))
    has_discard = bool(labels & set(DISCARD_LABELS))

    # rule 1 — a keep-option exists: KEEP. Covers OK-only, OK+Cancel, and OK+Delete.
    if has_keep:
        h, t, en = find_button(safe, KEEP_LABELS)
        if h:
            if has_discard:
                return (h, t, "keep",
                        "warning-style (OK+Cancel) -> OK keeps the edit; adjust geometry after")
            return (h, t, "keep", "OK-only dialog (informational)")
        return (None, None, "needs-human", "a keep-option exists but is disabled/absent")

    # rule 2 — no keep-option, Cancel offered: Revit's own answer. Rollback is correct.
    if has_discard:
        h, t, en = find_button(safe, DISCARD_LABELS)
        if h:
            return (h, t, "discard",
                    "no keep-option offered -> Cancel is Revit's own answer")

    # rule 3 — the operator's stated preference (still Delete-free).
    order = KEEP_LABELS if prefer == "keep" else DISCARD_LABELS
    h, t, en = find_button(safe, order)
    if h:
        act = "keep" if t.strip().lower() in KEEP_LABELS else "discard"
        return (h, t, act, "fallback to prefer=%s" % prefer)

    return (None, None, "needs-human", "no recognisable button")


# ---------------------------------------------------------------------------
# Clicking — a VERIFIED chain, never one blind call
# ---------------------------------------------------------------------------
def _gone(hwnd, secs) -> bool:
    deadline = time.time() + secs
    while time.time() < deadline:
        if not IsWindow(hwnd) or not IsWindowVisible(hwnd):
            return True
        time.sleep(0.04)
    return False


def _mouse_click(hwnd) -> None:
    r = wt.RECT()
    GetWindowRect(hwnd, ctypes.byref(r))
    x = (r.left + r.right) // 2
    y = (r.top + r.bottom) // 2
    SetForegroundWindow(hwnd)
    SetCursorPos(x, y)
    time.sleep(0.05)
    mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
    time.sleep(0.04)
    mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)


def _try(fn, hwnd, wait) -> bool:
    try:
        fn()
    except Exception:
        return False
    return _gone(hwnd, wait)


def click(hwnd):
    """
    Press the button and CONFIRM the dialog is gone. -> (ok, mechanism)

    ⚠ WHY A CHAIN, NOT ONE CALL:
      * An earlier version sent `SendMessageW(BM_CLICK)` once and returned
        immediately. The log then read `-> clicked '&OK'` while the dialog was STILL
        UP — an unconfirmed success. That is a real bug this design removes.
      * `SendMessageW(BM_CLICK)` is SYNCHRONOUS ACROSS PROCESSES: it blocks the caller
        until the target thread processes it. If that ever stalls, the watcher thread
        stalls with it — so it is NOT the first choice.
    Order: PostMessage (async, cannot block) -> SendMessage -> real cursor click.
    Only the mechanism that actually closed the window is reported.
    """
    if _try(lambda: PostMessageW(hwnd, BM_CLICK, 0, 0), hwnd, CLICK_WAIT):
        return True, "PostMessage(BM_CLICK)"
    if _try(lambda: SendMessageW(hwnd, BM_CLICK, 0, 0), hwnd, CLICK_WAIT):
        return True, "SendMessage(BM_CLICK)"
    if _try(lambda: _mouse_click(hwnd), hwnd, CLICK_WAIT + 0.6):
        return True, "mouse click"
    return False, "none"


# ---------------------------------------------------------------------------
# The resident loop
# ---------------------------------------------------------------------------
_started = threading.Event()
_state_lock = threading.Lock()
_handled = set()          # hwnds already acted on / deliberately skipped


def _handle(dlg) -> bool:
    h, t, action, reason = decide(dlg)
    label_list = ", ".join("%r%s" % (x, "" if en else "(disabled)")
                           for _, x, en in dlg["buttons"])
    log("DIALOG hwnd=%d title=%r text=%r message=%r buttons=[%s]"
        % (dlg["hwnd"], dlg["title"], dlg["text"][:400],
           dlg.get("message", "")[:400], label_list))
    log("  decide: action=%s reason=%s" % (action, reason))

    # ⚠ Record BEFORE clicking — the click destroys the dialog, and with it the
    #   message. This record is what tools.py hands back to the agent.
    entry = {"title": dlg["title"], "text": dlg["text"],
             "message": dlg.get("message", ""), "action": action, "reason": reason,
             "buttons": [x for _, x, _ in dlg["buttons"]], "pressed": None,
             "closed": False}

    if action == "needs-human":
        log("  !! NEEDS-HUMAN: %s -- left for the operator" % reason)
        _record(entry)
        return False
    if h is None:
        log("  !! %s, but no enabled button -- left for the operator" % action)
        _record(entry)
        return False

    ok, how = click(h)
    entry["closed"] = bool(ok)
    entry["pressed"] = t if ok else None
    entry["how"] = how
    _record(entry)
    if ok:
        log("  -> clicked %r  [%s] CLOSED via %s" % (t, action, how))
        return True
    log("  !! clicked %r [%s] but the dialog did NOT close -- operator needed"
        % (t, action))
    return False


def _loop(mutex_handle) -> None:
    log("watcher thread up (pid=%d) -- waiting for Revit dialogs" % os.getpid())
    while True:
        try:
            revit = find_revit()
            if revit is None:
                time.sleep(1.0)
                continue

            # prune hwnds that are gone, so a recycled handle is treated as new
            if _handled:
                with _state_lock:
                    _handled.intersection_update(
                        {x for x in _handled if IsWindow(x)})

            for dlg in scan_dialogs(revit):
                hwnd = dlg["hwnd"]

                # ⚠⚠ IN-FLIGHT GATE — see revit_call() above. If NO Paracore call is
                #   waiting on a dialog, this dialog is not ours to touch: the
                #   operator may have opened it by hand. Do not mark it handled
                #   either, so a call that starts later can still be answered.
                if not call_in_flight():
                    continue

                with _state_lock:
                    if hwnd in _handled:
                        continue
                    _handled.add(hwnd)

                # ⚠ ONLY ONE PROCESS MAY ACT. Several Paracore MCPs can be running;
                #   without this they would race and could answer twice.
                if kernel32.WaitForSingleObject(mutex_handle, MUTEX_WAIT_MS) != WAIT_OBJECT_0:
                    log("  (another Paracore process handled hwnd=%d)" % hwnd)
                    continue
                try:
                    _handle(dlg)
                finally:
                    kernel32.ReleaseMutex(mutex_handle)
        except Exception as exc:                      # never kill the host server
            try:
                log("watcher error: %r" % (exc,))
            except Exception:
                pass
        time.sleep(POLL_SECONDS)


def start_dialog_watcher() -> bool:
    """
    Start the resident watcher thread. Safe to call once at server boot.

    Returns True if the thread was started, False if disabled or already running.
    Never raises — a watcher failure must not stop the MCP server from serving.
    """
    if os.environ.get("PARACORE_WATCH_DIALOGS", "1").strip() in ("0", "false", "no"):
        log("watcher DISABLED by PARACORE_WATCH_DIALOGS")
        return False
    if _started.is_set():
        return False
    _started.set()

    try:
        handle = kernel32.CreateMutexW(None, False, MUTEX_NAME)
        if not handle:
            log("watcher: CreateMutexW failed (err=%d)" % kernel32.GetLastError())
            return False
    except Exception as exc:
        log("watcher: could not create mutex: %r" % (exc,))
        return False

    t = threading.Thread(target=_loop, args=(handle,),
                         name="paracore-dialog-watcher", daemon=True)
    t.start()
    return True
