import os
import json
import logging

# Configure logging for this module
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO) # Set desired logging level

def read_local_script_manifest(agent_scripts_path: str) -> list[dict]:
    """
    Reads and parses the local manifest.json file from the specified agent_scripts_path.
    The manifest.json is assumed to be a list of dictionaries, where each dictionary
    represents a script's metadata.
    """
    
    logger.info(f"Attempting to read manifest from: {agent_scripts_path}")

    if not os.path.exists(agent_scripts_path):
        logger.error(f"Agent scripts path does not exist: {agent_scripts_path}")
        return []

    # --- NEW: Try to get manifest via gRPC from C# backend (Recursive Scan) ---
    try:
        from grpc_client import get_script_manifest
        logger.info("Calling gRPC GetScriptManifest...")
        manifest_json_str = get_script_manifest(agent_scripts_path)
        if manifest_json_str:
            manifest_content = json.loads(manifest_json_str)
            logger.info(f"Successfully retrieved {len(manifest_content)} scripts via gRPC.")
            
            return manifest_content
    except Exception as e:
        logger.warning(f"Failed to get manifest via gRPC (Revit might be offline): {e}.")
        return []
    
    return []