import os
import json
import logging

logger = logging.getLogger(__name__)

# Persistent storage for active IDE sessions (which projects are currently open in VS Code)
SESSIONS_FILE = "active_ide_sessions.json"
ACTIVE_IDE_SESSIONS = {}

def load_ide_sessions():
    global ACTIVE_IDE_SESSIONS
    if os.path.exists(SESSIONS_FILE):
        try:
            with open(SESSIONS_FILE, "r") as f:
                ACTIVE_IDE_SESSIONS = json.load(f)
        except:
            ACTIVE_IDE_SESSIONS = {}

def save_ide_sessions():
    try:
        with open(SESSIONS_FILE, "w") as f:
            json.dump(ACTIVE_IDE_SESSIONS, f)
    except:
        pass

def set_active_ide_session(script_path: str):
    """Marks a project as currently open in VS Code."""
    normalized_path = script_path.lower().replace('\\', '/')
    ACTIVE_IDE_SESSIONS[normalized_path] = True
    save_ide_sessions()

def remove_active_ide_session(script_path: str):
    normalized_path = script_path.lower().replace('\\', '/')
    if normalized_path in ACTIVE_IDE_SESSIONS:
        del ACTIVE_IDE_SESSIONS[normalized_path]
        save_ide_sessions()

def is_ide_session_active(script_path: str) -> bool:
    normalized_path = script_path.lower().replace('\\', '/')
    return normalized_path in ACTIVE_IDE_SESSIONS

# Initialize
load_ide_sessions()
