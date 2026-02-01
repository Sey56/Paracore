import json
import os
from typing import Dict, Optional

WORKSPACE_CACHE_FILE = "active_workspaces.json"

def load_workspace_cache() -> Dict[str, str]:
    try:
        if os.path.exists(WORKSPACE_CACHE_FILE):
            with open(WORKSPACE_CACHE_FILE, 'r') as f:
                return json.load(f)
    except Exception as e:
        print(f"[WorkspaceManager] Failed to load workspace cache: {e}")
    return {}

def save_workspace_cache(cache: Dict[str, str]):
    try:
        with open(WORKSPACE_CACHE_FILE, 'w') as f:
            json.dump(cache, f, indent=2)
    except Exception as e:
        print(f"[WorkspaceManager] Failed to save workspace cache: {e}")

# original_script_path -> temp_workspace_path
# This dictionary serves as the in-memory source of truth, backed by the file.
ACTIVE_SESSION_WORKSPACES: Dict[str, str] = load_workspace_cache()

def get_active_workspace(script_path: str) -> Optional[str]:
    """
    Returns the active workspace path for a given script path, if it exists.
    """
    normalized_path = script_path.replace('\\', '/')
    return ACTIVE_SESSION_WORKSPACES.get(normalized_path)

def set_active_workspace(script_path: str, workspace_path: str):
    """
    Sets the active workspace path for a script.
    """
    normalized_path = script_path.replace('\\', '/')
    ACTIVE_SESSION_WORKSPACES[normalized_path] = workspace_path
    save_workspace_cache(ACTIVE_SESSION_WORKSPACES)

def get_scripts_dir(script_path: str, script_type: str = "multi-file") -> str:
    """
    Determines the directory containing the script files.
    Prioritizes the Active Workspace if one exists.
    """
    workspace_path = get_active_workspace(script_path)

    if workspace_path and os.path.isdir(workspace_path):
        # Redirect to workspace
        return os.path.join(workspace_path, "Scripts")

    # Fallback to source
    # If multi-file, the script_path is the folder itself.
    # If single-file, script_path is the file, so we need the dirname.
    # HOWEVER, the 'script_path' passed from frontend for single-file is usually the file path.
    # For multi-file, it's the folder path.

    # Simple check: is it a file or dir? (If it exists)
    if os.path.isfile(script_path):
        return os.path.dirname(script_path)
    return script_path
