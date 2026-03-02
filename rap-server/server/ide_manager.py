import os
import json
import logging
import time
import psutil
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

logger = logging.getLogger(__name__)

# Persistent storage for active IDE sessions
SESSIONS_FILE = "active_ide_sessions.json"
ACTIVE_IDE_SESSIONS = {}  # normalized_path -> { "last_modified": timestamp }

# Stale session threshold: 2 minutes without any file change
STALE_SESSION_TIMEOUT_SECONDS = 120

# Global observer for file changes
_observer = Observer()
_watchers = {} # normalized_path -> watch_object

def _get_all_vscode_open_paths() -> set:
    """
    Scans the system process list once and returns a set of all normalized 
    folder paths currently open in VS Code instances.
    """
    open_paths = set()
    try:
        for proc in psutil.process_iter(['name', 'cmdline']):
            try:
                # Check if it's a VS Code process
                if proc.info['name'] and 'code' in proc.info['name'].lower():
                    cmdline = proc.info.get('cmdline')
                    if cmdline:
                        for arg in cmdline:
                            # VS Code arguments often include the path to the folder/file
                            # We look for strings that look like absolute paths
                            if (len(arg) > 3 and (arg[1:3] == ":/" or arg[1:3] == ":\\")):
                                open_paths.add(arg.lower().replace('\\', '/').rstrip('/'))
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue
    except Exception as e:
        logger.error(f"Error gathering VS Code paths: {e}")
    
    return open_paths

class ScriptChangeHandler(FileSystemEventHandler):
    def __init__(self, normalized_path):
        self.normalized_path = normalized_path

    def on_modified(self, event):
        if event.is_directory: return
        if event.src_path.lower().endswith(".cs"):
            # Update the last_modified timestamp for this session
            if self.normalized_path in ACTIVE_IDE_SESSIONS:
                # Ensure it is a dict before assignment
                if not isinstance(ACTIVE_IDE_SESSIONS[self.normalized_path], dict):
                    ACTIVE_IDE_SESSIONS[self.normalized_path] = {"last_modified": time.time()}
                else:
                    ACTIVE_IDE_SESSIONS[self.normalized_path]["last_modified"] = time.time()
                logger.info(f"Detected change in tool: {self.normalized_path}")

def load_ide_sessions():
    global ACTIVE_IDE_SESSIONS
    if os.path.exists(SESSIONS_FILE):
        try:
            with open(SESSIONS_FILE, "r") as f:
                data = json.load(f)
                # Ensure all entries are dictionaries
                ACTIVE_IDE_SESSIONS = {
                    k: (v if isinstance(v, dict) else {"last_modified": time.time()})
                    for k, v in data.items()
                }
                # Restart watchers for existing sessions
                for path in ACTIVE_IDE_SESSIONS.keys():
                    _start_watcher(path)
        except:
            ACTIVE_IDE_SESSIONS = {}

def save_ide_sessions():
    try:
        with open(SESSIONS_FILE, "w") as f:
            json.dump(ACTIVE_IDE_SESSIONS, f)
    except:
        pass

def _start_watcher(script_path: str):
    """Starts a watchdog on the Scripts/ folder of the tool."""
    normalized = script_path.lower().replace('\\', '/')
    scripts_dir = os.path.join(script_path, "Scripts")
    
    # Check if directory exists and we aren't already watching it
    if not os.path.isdir(scripts_dir) or normalized in _watchers:
        return

    try:
        if not _observer.is_alive():
            _observer.start()
        
        handler = ScriptChangeHandler(normalized)
        watch = _observer.schedule(handler, scripts_dir, recursive=False)
        _watchers[normalized] = watch
        logger.info(f"Started watcher for: {scripts_dir}")
    except Exception as e:
        logger.error(f"Failed to start watcher: {e}")

def set_active_ide_session(script_path: str):
    """Marks a project as currently open in VS Code and starts a watcher."""
    normalized_path = script_path.lower().replace('\\', '/')
    ACTIVE_IDE_SESSIONS[normalized_path] = {
        "last_modified": time.time()
    }
    _start_watcher(script_path)
    save_ide_sessions()

def remove_active_ide_session(script_path: str):
    normalized_path = script_path.lower().replace('\\', '/')
    if normalized_path in ACTIVE_IDE_SESSIONS:
        del ACTIVE_IDE_SESSIONS[normalized_path]
        # Stop watcher
        if normalized_path in _watchers:
            try:
                _observer.unschedule(_watchers[normalized_path])
                del _watchers[normalized_path]
            except: pass
        save_ide_sessions()

def is_ide_session_active(script_path: str) -> bool:
    normalized_path = script_path.lower().replace('\\', '/')
    return normalized_path in ACTIVE_IDE_SESSIONS

def cleanup_stale_sessions():
    """
    Removes IDE sessions that have been inactive beyond the timeout threshold.
    Called on every /api/sync/active-sessions poll to keep the list accurate.
    """
    now = time.time()
    stale_keys = []

    # Get all currently open VS Code project paths in ONE scan
    vscode_paths = _get_all_vscode_open_paths()

    for normalized_path, session_data in ACTIVE_IDE_SESSIONS.items():
        last_modified = session_data.get("last_modified", 0) if isinstance(session_data, dict) else 0

        # 1. Physical Check: Does the Scripts folder even exist?
        scripts_dir = os.path.join(normalized_path, "Scripts")
        if not os.path.isdir(scripts_dir):
            stale_keys.append(normalized_path)
            continue

        # 2. Process Check: Is VS Code actually running this project?
        # Use our pre-scanned set for O(1) lookup
        is_running = normalized_path in vscode_paths
        
        # 3. Time Check: How long since last .cs change?
        idle_time = now - last_modified

        # DECISION LOGIC:
        # If it's NOT running in VS Code AND it's been idle for > 30s, clear it.
        if not is_running and idle_time > 30:
            stale_keys.append(normalized_path)
            continue
            
        # If it IS running or very recently active, but overall idle for > timeout (2 mins), clear it.
        if idle_time > STALE_SESSION_TIMEOUT_SECONDS:
            stale_keys.append(normalized_path)

    for key in stale_keys:
        logger.info(f"Auto-removing stale IDE session: {key}")
        # Stop watcher
        if key in _watchers:
            try:
                _observer.unschedule(_watchers[key])
                del _watchers[key]
            except: pass
        del ACTIVE_IDE_SESSIONS[key]

    if stale_keys:
        save_ide_sessions()

# Initialize
load_ide_sessions()
