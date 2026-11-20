"""
Standalone lifecycle manager for the C# gRPC sidecar (`Paracore.Server.exe`).

OWNERSHIP RULING (2026-11-20, user)
-----------------------------------
There is ONE shared sidecar. Whichever app needs it first starts it; every other
app adopts the already-answering process instead of starting a second one.

  * The desktop app needs it for IntelliSense, gallery metadata and script
    parameters -- all of which must work with Revit CLOSED.
  * The Revit add-in connects only when the ribbon ToggleServer button is ON.
    Toggling OFF closes Revit's subscription and lease; it never kills the
    process or interrupts the desktop app. Revit can also be the FIRST starter:
    with the desktop closed, ribbon ON launches the single shared sidecar with
    PARACORE_REVIT_DIR pointing at the real Revit install.
  * Every connected app writes a fresh lease file. The sidecar's own watcher
    retires the process only when NO lease is fresh -- the last user has gone.
    Leases are time-based, not process handles, because the desktop shell
    hard-kills its Python backend on close; no graceful teardown is reliable.
  * A remote GRPC_SERVER_ADDRESS is deliberately left alone: there is no local
    sidecar to start when the answers come from another machine.
"""

import json
import logging
import os
import subprocess
import threading
import time
from pathlib import Path
from typing import Optional

import grpc

import corescript_pb2
import corescript_pb2_grpc

logger = logging.getLogger(__name__)

SIDECAR_EXE_ENV = "PARACORE_SIDECAR_EXE"
REVIT_DIR_ENV = "PARACORE_REVIT_DIR"
SIDECAR_BIND_ENV = "PARACORE_SIDECAR_BIND"
CLIENT_ADDRESS_ENV = "GRPC_SERVER_ADDRESS"
SIDECAR_OWNER_DIR_ENV = "PARACORE_SIDECAR_OWNER_DIR"
DEFAULT_ADDRESS = "localhost:50051"

# Newest last, so the first existing path wins and the list reads as a preference.
_REVIT_YEARS = (2025, 2026, 2027)

_CREATE_NO_WINDOW = 0x08000000
_CREATE_NEW_PROCESS_GROUP = 0x00000200

# A dead sidecar must come back without a desktop restart. Five seconds is
# short enough that the user sees "Offline" only briefly, long enough that a
# port still in TIME_WAIT is not fought over.
WATCHDOG_INTERVAL_SECONDS = 5.0
HEARTBEAT_INTERVAL_SECONDS = 5.0

# The sidecar is shared. Any app currently using it keeps a fresh lease here;
# the sidecar exits only when no lease is fresh (the last user has gone).
# The override is used by isolated tests and by non-standard user-profile setups;
# the default stays the same APPDATA\paracore-data\sidecar-owners location.
_LEASE_DIR = Path(
    os.environ.get(SIDECAR_OWNER_DIR_ENV)
    or str(Path(os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")) / "paracore-data" / "sidecar-owners")
)
DESKTOP_LEASE = _LEASE_DIR / "desktop.json"


def _write_desktop_lease() -> None:
    """Announce that this desktop app is using the shared sidecar."""
    try:
        _LEASE_DIR.mkdir(parents=True, exist_ok=True)
        tmp = DESKTOP_LEASE.with_name(DESKTOP_LEASE.name + ".tmp")
        tmp.write_text(
            json.dumps({"pid": os.getpid(), "updatedAt": int(time.time())}),
            encoding="utf-8",
        )
        os.replace(tmp, DESKTOP_LEASE)
    except Exception as exc:
        logger.warning("[sidecar] could not write desktop lease: %s", exc)


LEASE_TIMEOUT_SECONDS = int(os.environ.get("PARACORE_LEASE_TIMEOUT_SECONDS") or 30)


def _has_fresh_lease(exclude: Optional[Path] = None) -> bool:
    """True when some OTHER app is still using the shared sidecar."""
    try:
        for file in _LEASE_DIR.glob("*.json"):
            if exclude is not None and file.name == exclude.name:
                continue
            try:
                data = json.loads(file.read_text(encoding="utf-8"))
                if time.time() - float(data.get("updatedAt", 0)) <= LEASE_TIMEOUT_SECONDS:
                    return True
            except Exception:
                continue
    except Exception:
        return False
    return False


def _clear_desktop_lease() -> None:
    try:
        DESKTOP_LEASE.unlink(missing_ok=True)
    except Exception as exc:
        logger.warning("[sidecar] could not clear desktop lease: %s", exc)


def _client_address() -> str:
    return (os.environ.get(CLIENT_ADDRESS_ENV) or DEFAULT_ADDRESS).strip()


def _is_local_address(address: str) -> bool:
    host = address.rsplit(":", 1)[0].strip().strip("[]").lower()
    return host in ("", "localhost", "127.0.0.1", "::1")


def _probe(address: str, timeout: float = 0.75) -> bool:
    """True when a gRPC CoreScriptRunner is already answering at `address`."""
    try:
        with grpc.insecure_channel(address) as channel:
            stub = corescript_pb2_grpc.CoreScriptRunnerStub(channel)
            stub.GetStatus(corescript_pb2.GetStatusRequest(), timeout=timeout)
            return True
    except Exception:
        return False


def _env_path(name: str) -> Optional[Path]:
    raw = (os.environ.get(name) or "").strip().strip('"')
    if not raw:
        return None
    path = Path(os.path.expandvars(raw))
    return path if path.exists() else None


def find_sidecar_exe() -> Optional[Path]:
    """
    Resolution order, first hit wins:
      1. PARACORE_SIDECAR_EXE -- explicit override (tests and recovery).
      2. This checkout's Release then Debug build output. In a dev checkout this
         is the freshly compiled code, so a stale installed copy cannot mask it.
      3. The Revit add-in install folders -- the ONE shipped install home. The
         add-in publishes a framework-dependent copy; the old desktop-bundled
         self-contained copy is deliberately NOT a candidate, so an upgrade
         cannot silently keep using a 127 MB duplicate we meant to remove.
    """
    explicit = _env_path(SIDECAR_EXE_ENV)
    if explicit and explicit.is_file():
        return explicit

    # Walk up from rap-server/server/ to the repo root.
    here = Path(__file__).resolve()
    for base in here.parents:
        for config in ("Release", "Debug"):
            candidate = (
                base / "Paracore.Server" / "bin" / config
                / "net8.0-windows" / "win-x64" / "Paracore.Server.exe"
            )
            if candidate.is_file():
                return candidate
        if (base / "Paracore.Server" / "Paracore.Server.csproj").is_file():
            break  # found the repo root; no need to walk into the user's home

    program_data = os.environ.get("PROGRAMDATA", r"C:\ProgramData")
    program_files = os.environ.get("PROGRAMFILES", r"C:\Program Files")
    for year in _REVIT_YEARS:
        for root in (program_data, program_files):
            candidate = (
                Path(root) / "Autodesk" / "Revit" / "Addins" / str(year)
                / "Paracore" / "Paracore.Server.exe"
            )
            if candidate.is_file():
                return candidate
    return None


def find_revit_dir() -> Optional[Path]:
    """
    Directory containing RevitAPI.dll, which Roslyn reads as METADATA only --
    no Revit process, document, or licence is involved.

    Order: explicit env override, then the known install folders. Never guess a
    path that has no DLL: a wrong-version API would produce completions that do
    not match the user's Revit, which is worse than no completion.
    """
    explicit = _env_path(REVIT_DIR_ENV)
    if explicit and (explicit / "RevitAPI.dll").is_file():
        return explicit

    roots = [
        Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "Autodesk",
        Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")) / "Autodesk",
    ]
    for root in roots:
        for year in _REVIT_YEARS:
            candidate = root / f"Revit {year}"
            if (candidate / "RevitAPI.dll").is_file():
                return candidate
    return None


class ManagedSidecar:
    """Starts the sidecar if nobody else has, and always announces this app's use."""

    def __init__(self) -> None:
        self.process: Optional[subprocess.Popen] = None
        self.exe: Optional[Path] = None
        self.revit_dir: Optional[Path] = None
        self.address: str = _client_address()
        self.reason: str = "not attempted"
        self._lock = threading.Lock()
        self._stop_event = threading.Event()
        self._heartbeat_stop = threading.Event()
        self._watchdog: Optional[threading.Thread] = None
        self._heartbeat: Optional[threading.Thread] = None

    @property
    def is_ours(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def status(self) -> dict:
        """Small diagnostic surface; also handy when checking ownership live."""
        return {
            "address": self.address,
            "startedByDesktop": self.is_ours,
            "pid": self.process.pid if self.process is not None else None,
            "answering": _probe(self.address, timeout=0.5),
            "revitDir": str(self.revit_dir) if self.revit_dir else None,
            "reason": self.reason,
        }

    def start(self) -> None:
        """Start once at app boot, announce usage, and keep the process available."""
        if not _is_local_address(self.address):
            self.reason = f"remote address {self.address}; no local sidecar needed"
            logger.info("[sidecar] %s", self.reason)
            return

        self.ensure_running()
        self._stop_event.clear()
        self._watchdog = threading.Thread(
            target=self._watchdog_loop,
            name="paracore-sidecar-watchdog",
            daemon=True,
        )
        self._watchdog.start()
        logger.info("[sidecar] watchdog started (every %.1fs)", WATCHDOG_INTERVAL_SECONDS)

        # The lease is written whether WE started the process or adopted one
        # started by Revit. It is what keeps the shared server alive.
        _write_desktop_lease()
        self._heartbeat_stop.clear()
        self._heartbeat = threading.Thread(
            target=self._heartbeat_loop,
            name="paracore-sidecar-lease",
            daemon=True,
        )
        self._heartbeat.start()

    def _heartbeat_loop(self) -> None:
        while not self._heartbeat_stop.wait(HEARTBEAT_INTERVAL_SECONDS):
            _write_desktop_lease()

    def _watchdog_loop(self) -> None:
        while not self._stop_event.wait(WATCHDOG_INTERVAL_SECONDS):
            if self.is_ours:
                # Process alive. A silent server is still worth reporting, but
                # we do not start a second one while the first holds the port.
                if not _probe(self.address, timeout=0.5):
                    logger.warning("[sidecar] owned process (%s) is not answering yet", self.process.pid)
                continue
            # Our process died (or was never started). Re-acquire the port.
            logger.warning("[sidecar] owned process is gone; re-acquiring %s", self.address)
            self.ensure_running()

    def ensure_running(self) -> None:
        if not _is_local_address(self.address):
            self.reason = f"remote address {self.address}; no local sidecar needed"
            logger.info("[sidecar] %s", self.reason)
            return

        with self._lock:
            if self.is_ours:
                return
            if self.process is not None:
                # Dead process from an earlier attempt: forget it, do not kill it.
                self.process = None

            if _probe(self.address):
                # ONE port, ONE process. If Revit (or another app) started it,
                # adopt it: we never start a second server on the same address
                # and never kill something we did not start. The sidecar's own
                # lease watcher retires it when the last app disconnects.
                self.reason = "another process answers; adopted shared sidecar"
                logger.info("[sidecar] %s at %s", self.reason, self.address)
                return

            self.exe = find_sidecar_exe()
            if self.exe is None:
                self.reason = "Paracore.Server.exe not found; set PARACORE_SIDECAR_EXE"
                logger.warning("[sidecar] %s", self.reason)
                return

            self.revit_dir = find_revit_dir()
            if self.revit_dir is None:
                # The sidecar still starts: GetStatus, metadata extraction and
                # filesystem RPCs work. Only Roslyn reference-bearing answers
                # (intellisense, compile) degrade -- honestly, to empty/error.
                logger.warning(
                    "[sidecar] RevitAPI.dll not found; set %s for full intellisense",
                    REVIT_DIR_ENV,
                )

            env = os.environ.copy()
            if self.revit_dir is not None:
                env[REVIT_DIR_ENV] = str(self.revit_dir)
            # Match the sidecar's bind to the address the Python client uses.
            env[SIDECAR_BIND_ENV] = self.address

            try:
                self.process = subprocess.Popen(
                    [str(self.exe)],
                    cwd=str(self.exe.parent),
                    env=env,
                    stdin=subprocess.PIPE,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=_CREATE_NO_WINDOW | _CREATE_NEW_PROCESS_GROUP,
                )
            except Exception as exc:
                self.process = None
                self.reason = f"failed to start: {exc}"
                logger.error("[sidecar] %s", self.reason)
                return

            # Wait briefly for the port to answer. gRPC's channel reconnects, so a
            # slow start is not fatal; this only makes startup logs deterministic.
            for _ in range(30):
                if _probe(self.address, timeout=0.25):
                    self.reason = f"started standalone from {self.exe}"
                    logger.info("[sidecar] %s (PARACORE_REVIT_DIR=%s)", self.reason, self.revit_dir)
                    return
                if self.process.poll() is not None:
                    self.reason = f"exited immediately with code {self.process.returncode}"
                    logger.error("[sidecar] %s", self.reason)
                    self.process = None
                    return
                time.sleep(0.1)

            # Do not kill it: the process may still be warming up. gRPC will reconnect.
            self.reason = f"started from {self.exe}; not answering yet"
            logger.warning("[sidecar] %s", self.reason)

    def stop(self) -> None:
        """Release this app's lease; stop the process only if nobody else is using it."""
        self._heartbeat_stop.set()
        heartbeat = self._heartbeat
        if heartbeat is not None and heartbeat.is_alive():
            if threading.current_thread() is not heartbeat:
                heartbeat.join(timeout=1.0)
        self._heartbeat = None
        _clear_desktop_lease()

        self._stop_event.set()
        watchdog = self._watchdog
        if watchdog is not None and watchdog.is_alive():
            if threading.current_thread() is not watchdog:
                watchdog.join(timeout=1.0)
        self._watchdog = None

        # The sidecar is shared. If Revit (or another app) has a fresh lease,
        # leave the process alone — its own watcher will retire it when the
        # last user disconnects.
        if _has_fresh_lease():
            logger.info("[sidecar] another app still has a lease; leaving shared process running")
            self.process = None
            return

        with self._lock:
            proc = self.process
            if proc is None:
                return
            self.process = None
            if proc.poll() is not None:
                return
            try:
                if proc.stdin is not None:
                    proc.stdin.write(b"exit\n")
                    proc.stdin.flush()
                    proc.wait(timeout=3)
                    return
            except Exception:
                pass
            try:
                proc.terminate()
                proc.wait(timeout=3)
            except Exception:
                pass


# One per Python server process.
sidecar_manager = ManagedSidecar()
