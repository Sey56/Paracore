import os
import json
import logging

import time

# Configure logging for this module
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO) # Set desired logging level

# Global cache for the manifest
_MANIFEST_CACHE = None
_LAST_CACHE_UPDATE = 0
_CACHE_TTL = 300  # 5 minutes

def read_local_script_manifest(agent_scripts_path: str) -> list[dict]:
    """
    Reads and parses the local manifest.json file from the specified agent_scripts_path.
    The manifest.json is assumed to be a list of dictionaries, where each dictionary
    represents a script's metadata.
    """
    global _MANIFEST_CACHE, _LAST_CACHE_UPDATE
    
    current_time = time.time()
    if _MANIFEST_CACHE is not None and (current_time - _LAST_CACHE_UPDATE) < _CACHE_TTL:
        logger.info("Returning cached script manifest.")
        return _MANIFEST_CACHE
    
import os
import json
import logging

import time

# Configure logging for this module
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO) # Set desired logging level

# Global cache for the manifest
_MANIFEST_CACHE = None
_LAST_CACHE_UPDATE = 0
_CACHE_TTL = 300  # 5 minutes

def read_local_script_manifest(agent_scripts_path: str) -> list[dict]:
    """
    Reads and parses the local manifest.json file from the specified agent_scripts_path.
    The manifest.json is assumed to be a list of dictionaries, where each dictionary
    represents a script's metadata.
    """
    global _MANIFEST_CACHE, _LAST_CACHE_UPDATE
    
    current_time = time.time()
    if _MANIFEST_CACHE is not None and (current_time - _LAST_CACHE_UPDATE) < _CACHE_TTL:
        logger.info("Returning cached script manifest.")
        return _MANIFEST_CACHE
    
    logger.info(f"Attempting to read manifest from: {agent_scripts_path}")

    if not os.path.exists(agent_scripts_path):
        logger.error(f"Agent scripts path does not exist: {agent_scripts_path}")
        return []

    # --- NEW: Try to read from persistent manifest.json file (FASTEST) ---
    manifest_file_path = os.path.join(agent_scripts_path, "manifest.json")
    if os.path.exists(manifest_file_path):
        try:
            logger.info(f"Reading persistent manifest from: {manifest_file_path}")
            with open(manifest_file_path, 'r', encoding='utf-8') as f:
                manifest_content = json.load(f)
            
            # Update memory cache
            _MANIFEST_CACHE = manifest_content
            _LAST_CACHE_UPDATE = current_time
            
            return manifest_content
        except Exception as e:
            logger.error(f"Failed to read persistent manifest.json: {e}")
            # Fallback to gRPC if file read fails

    # --- NEW: Try to get manifest via gRPC from C# backend (Recursive Scan) ---
    try:
        from grpc_client import get_script_manifest
        logger.info("Calling gRPC GetScriptManifest...")
        manifest_json_str = get_script_manifest(agent_scripts_path)
        if manifest_json_str:
            manifest_content = json.loads(manifest_json_str)
            logger.info(f"Successfully retrieved {len(manifest_content)} scripts via gRPC.")
            
            # Update cache
            _MANIFEST_CACHE = manifest_content
            _LAST_CACHE_UPDATE = current_time
            
            return manifest_content
    except Exception as e:
        logger.warning(f"Failed to get manifest via gRPC (Revit might be offline): {e}.")
        # If gRPC fails, try to return cached version even if expired
        if _MANIFEST_CACHE is not None:
            logger.warning("Returning expired cache due to gRPC failure.")
            return _MANIFEST_CACHE
        return []
    
    return []