import logging
import subprocess
import os
import re
import grpc

logger = logging.getLogger(__name__)

def launch_vscode(project_path: str):
    """
    Robustly launches VS Code for a given project path.
    Uses shell=True to ensure the 'code' command is found via PATH.
    """
    try:
        # Normalize for Windows
        win_path = project_path.replace('/', '\\')
        
        # Method 1: Use the 'code' command (standard)
        # We use Popen so it is completely non-blocking for the Python server
        subprocess.Popen(f'code "{win_path}"', shell=True)
        return True
    except Exception as e:
        logger.error(f"[Utils] Failed to launch VS Code via 'code' command: {e}")
        return False

def open_in_explorer(project_path: str):
    """
    Opens the project folder in Windows File Explorer.
    """
    try:
        win_path = project_path.replace('/', '\\')
        subprocess.Popen(f'explorer "{win_path}"', shell=True)
        return True
    except Exception as e:
        logger.error(f"[Utils] Failed to open folder in Explorer: {e}")
        return False

def read_script_files(project_path: str) -> list:
    """
    Read all .cs files from a project's Scripts/ subdirectory.
    Skips globals.cs. Returns a list of {"file_name", "content"} dicts.
    """
    import glob as glob_module
    scripts_dir = os.path.join(project_path, "Scripts")
    if not os.path.isdir(scripts_dir):
        return []
    files = []
    for fp in sorted(glob_module.glob(os.path.join(scripts_dir, "*.cs"))):
        if os.path.basename(fp).lower() == "globals.cs":
            continue
        try:
            with open(fp, 'r', encoding='utf-8-sig') as f:
                files.append({"file_name": os.path.basename(fp), "content": f.read()})
        except Exception:
            continue
    return files


def format_grpc_error(e: grpc.RpcError) -> str:
    """
    Formats a gRPC error into a user-friendly message.
    """
    details = e.details()
    if "failed to connect to all addresses" in details or "10061" in details:
        return "Failed to connect to Paracore server. Ensure Revit is open and the server is toggled ON. If connection persists after refreshing, try restarting the Paracore app."
    return f"Error: {details}"

def redact_secrets(text: str) -> str:
    """
    Redacts sensitive information like API keys from text.
    Currently targets common patterns like Google's 'AIza' keys.
    """
    if not text:
        return text

    # Redact Google AIza keys: AIza followed by ~35 chars
    redacted = re.sub(r'AIza[a-zA-Z0-9_-]{35}', '[REDACTED_API_KEY]', text)

    # Redact 'key=' query parameters in URLs
    redacted = re.sub(r'key=[a-zA-Z0-9_-]{10,}', 'key=[REDACTED]', redacted)

    return redacted

def resolve_script_path(relative_or_absolute_path: str) -> str:
    """
    Resolves a script path to a consistent, absolute, and normalized form.
    Handles both absolute and relative paths.
    """
    # 1. Normalize slashes first
    path_to_resolve = relative_or_absolute_path.replace('\\', '/')

    if os.path.isabs(path_to_resolve):
        # For absolute paths, just normalize
        safe_path = os.path.normpath(path_to_resolve)
    else:
        # For relative paths, resolve against a known base directory
        script_root_for_defaults = os.path.abspath(os.path.join(os.path.dirname(__file__), '../src/data'))
        safe_path = os.path.abspath(os.path.join(script_root_for_defaults, path_to_resolve))

    # 2. Convert to absolute path to handle any '..' or '.' components
    safe_path = os.path.abspath(safe_path)

    # 3. Ensure consistent forward slashes for storage/comparison
    safe_path = safe_path.replace('\\', '/')

    # 4. CRITICAL: On Windows, normalize the drive letter to uppercase for consistency
    if len(safe_path) > 1 and safe_path[1] == ':':
        safe_path = safe_path[0].upper() + safe_path[1:]

    # We do NOT use os.path.exists() here because in some containerized or 
    # remote-mount scenarios, the server might be looking up a path that 
    # doesn't exist on its local FS but is a valid logical path in the DB.
    # The caller should handle missing files if they need to read them.
    return safe_path

def get_or_create_script(db: "Session", script_path: str, owner_id: int) -> "models.Script":
    """
    Retrieves a script from the database by its path, creating it if it doesn't exist.
    The script_path provided should be the already resolved and normalized path.
    """
    from sqlalchemy.exc import IntegrityError
    from sqlalchemy.orm import Session
    import models
    # Ensure the path is normalized and consistent before querying
    normalized_path = resolve_script_path(script_path) # Use the centralized resolver

    script = db.query(models.Script).filter(models.Script.path == normalized_path).first()
    if script:
        return script

    # If script does not exist, create it
    script_name = os.path.basename(normalized_path.replace('/', os.sep)) # Convert back for basename
    script = models.Script(
        name=script_name,
        path=normalized_path,
        owner_id=owner_id
    )
    db.add(script)
    try:
        db.commit()
        db.refresh(script)
    except IntegrityError:
        # This can happen in a race condition where another request created the script
        # after our initial query but before our commit.
        db.rollback()
        script = db.query(models.Script).filter(models.Script.path == normalized_path).first()
        if not script:
            # If it's still not found after rollback, something is seriously wrong.
            # Re-raise or handle appropriately. For now, let's assume it will be found.
            raise
    return script
