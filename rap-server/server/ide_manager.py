import os
import json
import logging
import time
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
    Sessions are considered stale if:
    1. The Scripts/ folder no longer exists on disk, OR
    2. No .cs file modification detected within STALE_SESSION_TIMEOUT_SECONDS
    """
    now = time.time()
    stale_keys = []

    for normalized_path, session_data in ACTIVE_IDE_SESSIONS.items():
        last_modified = session_data.get("last_modified", 0) if isinstance(session_data, dict) else 0

        # Check if the folder still exists on disk
        # Try to reconstruct the original path (it was lowercased)
        scripts_dir_exists = False
        for orig_path in list(_watchers.keys()) + [normalized_path]:
            candidate = os.path.join(orig_path, "Scripts")
            if os.path.isdir(candidate):
                scripts_dir_exists = True
                break

        if not scripts_dir_exists:
            stale_keys.append(normalized_path)
            continue

        # Check if session is stale (no file activity)
        if (now - last_modified) > STALE_SESSION_TIMEOUT_SECONDS:
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
