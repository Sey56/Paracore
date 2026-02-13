import json
import os
from typing import Dict, Optional

SYNC_SESSION_CACHE_FILE = "active_sync_sessions.json"

def load_sync_session_cache() -> Dict[str, str]:
    try:
        if os.path.exists(SYNC_SESSION_CACHE_FILE):
            with open(SYNC_SESSION_CACHE_FILE, 'r') as f:
                cache = json.load(f)
                # --- AUTO-CLEANUP: Verify directory existence ---
                cleaned_cache = {}
                for script_path, workspace_path in cache.items():
                    if os.path.isdir(workspace_path):
                        cleaned_cache[script_path] = workspace_path
                return cleaned_cache
    except Exception as e:
        print(f"[SyncManager] Failed to load sync session cache: {e}")
    return {}

def save_sync_session_cache(cache: Dict[str, str]):
    try:
        with open(SYNC_SESSION_CACHE_FILE, 'w') as f:
            json.dump(cache, f, indent=2)
    except Exception as e:
        print(f"[SyncManager] Failed to save sync session cache: {e}")

# original_script_path -> temp_vscode_workspace_path
# This dictionary serves as the in-memory source of truth for IDE sync sessions.
ACTIVE_SYNC_SESSIONS: Dict[str, str] = load_sync_session_cache()

def get_active_sync_session(script_path: str) -> Optional[str]:
    """
    Returns the temporary IDE workspace path for a given script path, if a sync session is active.
    Also validates that the directory still exists.
    """
    normalized_path = script_path.replace('\\', '/').lower()
    workspace_path = ACTIVE_SYNC_SESSIONS.get(normalized_path)
    
    if workspace_path:
        if os.path.isdir(workspace_path):
            return workspace_path
        else:
            # Directory was deleted (e.g. user cleaned temp files)
            remove_active_sync_session(script_path)
            
    return None

def set_active_sync_session(script_path: str, temp_workspace_path: str):
    """
    Registers an active sync session for a script.
    """
    normalized_path = script_path.replace('\\', '/').lower()
    ACTIVE_SYNC_SESSIONS[normalized_path] = temp_workspace_path
    save_sync_session_cache(ACTIVE_SYNC_SESSIONS)

def remove_active_sync_session(script_path: str):
    """
    Removes an active sync session entry, releasing the IDE lock.
    """
    normalized_path = script_path.replace('\\', '/').lower()
    if normalized_path in ACTIVE_SYNC_SESSIONS:
        del ACTIVE_SYNC_SESSIONS[normalized_path]
        save_sync_session_cache(ACTIVE_SYNC_SESSIONS)

def get_scripts_dir(script_path: str, script_type: str = "multi-file") -> str:
    """
    Determines the directory containing the script files.
    Prioritizes the active IDE Sync Session if one exists.
    """
    temp_workspace_path = get_active_sync_session(script_path)

    if temp_workspace_path and os.path.isdir(temp_workspace_path):
        # Redirect to the temporary IDE workspace
        return os.path.join(temp_workspace_path, "Scripts")

    if os.path.isfile(script_path):
        return os.path.dirname(script_path)
    return script_path
