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
                
                # V4: Multi-stage Pruning
                # 1. Path must exist
                # 2. Must have been touched in the last 24 hours (86400 seconds)
                now = time.time()
                pruned_data = {}
                for path, session_info in data.items():
                    # Ensure session_info is a dict
                    info = session_info if isinstance(session_info, dict) else {"last_modified": now}
                    last_mod = info.get("last_modified", 0)
                    
                    if os.path.isdir(path):
                        if (now - last_mod) < 86400: # 24 hour window
                            pruned_data[path] = info
                        else:
                            logger.info(f"Pruning stale IDE session (inactive > 24h): {path}")
                    else:
                        logger.info(f"Pruning non-existent IDE session: {path}")
                
                ACTIVE_IDE_SESSIONS = pruned_data
                
                # Restart watchers for valid active sessions
                for path in ACTIVE_IDE_SESSIONS.keys():
                    _start_watcher(path)
                    
                # Save the pruned list back to file
                if len(ACTIVE_IDE_SESSIONS) != len(data):
                    save_ide_sessions()
        except Exception as e:
            logger.error(f"Failed to load IDE sessions: {e}")
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
            _observer.unschedule(_watchers[normalized_path])
            del _watchers[normalized_path]
        save_ide_sessions()

def is_ide_session_active(script_path: str) -> bool:
    normalized_path = script_path.lower().replace('\\', '/')
    return normalized_path in ACTIVE_IDE_SESSIONS

# Initialize
load_ide_sessions()
