import os
import json
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from grpc_client import get_script_manifest

router = APIRouter()
logger = logging.getLogger(__name__)

class GenerateManifestRequest(BaseModel):
    agent_scripts_path: str

@router.post("/api/manifest/generate", tags=["Manifest Management"])
async def generate_manifest(request: GenerateManifestRequest):
    """
    Generates a lightweight manifest.json file in the specified agent_scripts_path.
    This file is used for fast script discovery by the agent.
    """
    agent_scripts_path = request.agent_scripts_path
    
    if not os.path.exists(agent_scripts_path):
        raise HTTPException(status_code=400, detail=f"Agent scripts path does not exist: {agent_scripts_path}")

    try:
        logger.info(f"Generating manifest for path: {agent_scripts_path}")
        
        # 1. Get full manifest via gRPC
        manifest_json_str = get_script_manifest(agent_scripts_path)
        if not manifest_json_str:
            raise HTTPException(status_code=500, detail="Failed to retrieve manifest from Revit via gRPC.")
            
        full_manifest = json.loads(manifest_json_str)
        
        # 2. Create lightweight version
        # We keep essential fields for search and execution: Name, Description, AbsolutePath, Categories, Type
        # We strip potentially large fields like UsageExamples (unless needed for search?), Author, Website, History
        lightweight_manifest = []
        for script in full_manifest:
            lightweight_script = {
                "name": script.get("name"),
                "type": script.get("type"), # CRITICAL: Keep type for execution logic
                "absolutePath": script.get("absolutePath"),
                "metadata": {
                    "description": script.get("metadata", {}).get("description", "No description"),
                    "categories": script.get("metadata", {}).get("categories", []),
                    # We can add more fields here if the agent needs them for filtering
                }
            }
            lightweight_manifest.append(lightweight_script)
            
        # 3. Save to disk
        manifest_path = os.path.join(agent_scripts_path, "manifest.json")
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(lightweight_manifest, f, indent=2)
            
        logger.info(f"Successfully generated manifest.json with {len(lightweight_manifest)} scripts at {manifest_path}")
        
        return {"message": "Manifest generated successfully", "count": len(lightweight_manifest)}

    except Exception as e:
        logger.error(f"Error generating manifest: {e}")
        raise HTTPException(status_code=500, detail=str(e))
