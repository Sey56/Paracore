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

def read_local_script_manifest(agent_scripts_path: str, force_refresh: bool = False) -> list[dict]:
    """
    Reads and parses the local manifest.json file from the specified agent_scripts_path.
    If multiple paths are provided (ROOT|path1,path2), or if force_refresh is True,
    it skips the local file check and goes directly to gRPC for a fresh scan.
    """
    global _MANIFEST_CACHE, _LAST_CACHE_UPDATE
    
    current_time = time.time()
    
    # Handle multi-path format
    is_multi_path = "|" in agent_scripts_path
    
    if not force_refresh and not is_multi_path and _MANIFEST_CACHE is not None and (current_time - _LAST_CACHE_UPDATE) < _CACHE_TTL:
        logger.info("Returning cached script manifest.")
        return _MANIFEST_CACHE
    
    logger.info(f"Attempting to read manifest from: {agent_scripts_path}")

    # For single paths, check if directory exists and look for manifest.json
    if not is_multi_path and not force_refresh:
        if not os.path.exists(agent_scripts_path):
            logger.error(f"Agent scripts path does not exist: {agent_scripts_path}")
            return []

        # --- Try to read from persistent manifest.json file (FASTEST) ---
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
            
            # --- AUTO-PERSIST: Save the manifest.json to disk so it's ready for next time ---
            if not is_multi_path:
                try:
                    manifest_file_path = os.path.join(agent_scripts_path, "manifest.json")
                    with open(manifest_file_path, 'w', encoding='utf-8') as f:
                        json.dump(manifest_content, f, indent=2)
                    logger.info(f"Auto-persisted manifest.json to {manifest_file_path}")
                except Exception as save_err:
                    logger.warning(f"Failed to auto-persist manifest: {save_err}")

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