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

# Global observer for file changes
_observer = Observer()
_watchers = {} # normalized_path -> watch_object

class ScriptChangeHandler(FileSystemEventHandler):
    def __init__(self, normalized_path):
        self.normalized_path = normalized_path

    def _trigger_update(self, event_path):
        if event_path.lower().endswith(".cs"):
            if self.normalized_path in ACTIVE_IDE_SESSIONS:
                ACTIVE_IDE_SESSIONS[self.normalized_path]["last_modified"] = time.time()
                save_ide_sessions()

    def on_modified(self, event):
        if event.is_directory: return
        self._trigger_update(event.src_path)

    def on_created(self, event):
        if event.is_directory: return
        self._trigger_update(event.src_path)

    def on_moved(self, event):
        if event.is_directory: return
        self._trigger_update(event.dest_path)

def _start_watcher(script_path: str):
    """Starts a watchdog on the Scripts/ folder of the tool."""
    normalized = script_path.lower().replace('\\', '/')
    scripts_dir = os.path.join(script_path, "Scripts")
    
    if not os.path.isdir(scripts_dir):
        return
        
    if normalized in _watchers:
        return

    try:
        handler = ScriptChangeHandler(normalized)
        watch = _observer.schedule(handler, scripts_dir, recursive=False)
        _watchers[normalized] = watch
    except Exception as e:
        logger.error(f"Failed to start watcher for {scripts_dir}: {e}")

def load_ide_sessions():
    global ACTIVE_IDE_SESSIONS
    if os.path.exists(SESSIONS_FILE):
        try:
            with open(SESSIONS_FILE, "r") as f:
                data = json.load(f)
                ACTIVE_IDE_SESSIONS = {
                    k: (v if isinstance(v, dict) else {"last_modified": time.time()})
                    for k, v in data.items()
                }
                # Restart watchers for existing sessions
                for path in ACTIVE_IDE_SESSIONS.keys():
                    _start_watcher(path)
        except:
            ACTIVE_IDE_SESSIONS = {}
    
    # V5: Always ensure the observer is running
    if not _observer.is_alive():
        try:
            _observer.start()
        except: pass

def save_ide_sessions():
    try:
        with open(SESSIONS_FILE, "w") as f:
            json.dump(ACTIVE_IDE_SESSIONS, f)
    except:
        pass

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

def normalize_ide_path(path: str) -> str:
    """Normalizes a path for IDE session lookups."""
    return path.lower().replace('\\', '/')

def is_folder_locked(normalized_path: str) -> bool:
    """Checks if a folder is tracked as an active IDE session."""
    return normalized_path in ACTIVE_IDE_SESSIONS

def cleanup_stale_sessions():
    """
    Removes IDE sessions where the directory no longer exists.
    V5: Removed the timeout cleanup - sessions persist as long as folder exists.
    """
    stale_keys = []

    for normalized_path in list(ACTIVE_IDE_SESSIONS.keys()):
        # Handle path variations
        scripts_dir = os.path.join(normalized_path, "Scripts")
        
        if not os.path.isdir(scripts_dir):
            # Try original OS path if normalization was too aggressive
            found = False
            for orig in list(_watchers.keys()):
                if orig.lower().replace('\\', '/') == normalized_path:
                    if os.path.isdir(os.path.join(orig, "Scripts")):
                        found = True
                        break
            if not found:
                stale_keys.append(normalized_path)

    for key in stale_keys:
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
