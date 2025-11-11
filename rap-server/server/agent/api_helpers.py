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
    
    logger.info(f"Attempting to read manifest from: {manifest_file_path}")

    if not os.path.exists(agent_scripts_path):
        logger.error(f"Agent scripts path does not exist: {agent_scripts_path}")
        return []

    # List contents of the directory for debugging
    try:
        dir_contents = os.listdir(agent_scripts_path)
        logger.info(f"Contents of '{agent_scripts_path}': {dir_contents}")
    except Exception as e:
        logger.error(f"Could not list contents of '{agent_scripts_path}': {e}")

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