import os
import re

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

import models


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
    if os.path.isabs(relative_or_absolute_path):
        # For absolute paths, just normalize and ensure consistent slashes
        safe_path = os.path.normpath(relative_or_absolute_path)
    else:
        # For relative paths, resolve against a known base directory
        # Assuming scripts are typically in a 'src/data' like structure relative to the server
        script_root_for_defaults = os.path.abspath(os.path.join(os.path.dirname(__file__), '../src/data'))
        safe_path = os.path.abspath(os.path.join(script_root_for_defaults, relative_or_absolute_path))

    # Ensure consistent forward slashes for storage/comparison
    safe_path = safe_path.replace('\\', '/')

    if not os.path.exists(safe_path):
        raise FileNotFoundError(f"Script not found at the resolved path: {safe_path}")
    return safe_path

def get_or_create_script(db: Session, script_path: str, owner_id: int) -> models.Script:
    """
    Retrieves a script from the database by its path, creating it if it doesn't exist.
    The script_path provided should be the already resolved and normalized path.
    """
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
        owner_id=str(owner_id)
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
