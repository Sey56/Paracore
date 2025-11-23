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
    manifest_file_path = os.path.join(agent_scripts_path, "manifest.json")
    
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
            
            # DEBUG: Log the manifest content to inspect descriptions
            for script in manifest_content:
                logger.info(f"Script: {script.get('name')}, Desc: {script.get('description')[:50] if script.get('description') else 'None'}")

            return manifest_content
    except Exception as e:
        logger.warning(f"Failed to get manifest via gRPC (Revit might be offline): {e}. Falling back to local manifest.json.")
    # --- END NEW ---

    # Fallback: Read local manifest.json
    if not os.path.exists(manifest_file_path):
        logger.warning(f"Manifest file not found at: {manifest_file_path}")
        return []
    
    try:
        with open(manifest_file_path, 'r', encoding='utf-8') as f:
            manifest_content = json.load(f)
        
        if not isinstance(manifest_content, list):
            logger.error(f"Manifest file content is not a list: {manifest_file_path}")
            return []
            
        return manifest_content
    except FileNotFoundError:
        logger.warning(f"Manifest file not found at: {manifest_file_path}")
        return []
    except json.JSONDecodeError as e:
        logger.error(f"Error decoding manifest.json at {manifest_file_path}: {e}")
        return []
    except Exception as e:
        logger.error(f"An unexpected error occurred while reading manifest at {manifest_file_path}: {e}")
        return []