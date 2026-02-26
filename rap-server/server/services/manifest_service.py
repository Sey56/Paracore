import json
import logging
import os
from fastapi import HTTPException
from grpc_client import get_script_manifest

logger = logging.getLogger(__name__)

async def generate_manifest_logic(agent_scripts_path: str):
    if not os.path.exists(agent_scripts_path):
        raise HTTPException(status_code=400, detail=f"Path does not exist: {agent_scripts_path}")

    try:
        logger.info(f"Generating manifest for path: {agent_scripts_path}")
        manifest_json_str = get_script_manifest(agent_scripts_path)
        if not manifest_json_str:
            raise HTTPException(status_code=500, detail="Failed to retrieve manifest from Revit.")

        full_manifest = json.loads(manifest_json_str)
        lightweight_manifest = []
        for script in full_manifest:
            metadata = script.get("metadata", {})
            name = script.get("name", "unnamed_script")
            rel_path = metadata.get("relativePath") or script.get("absolutePath") or name
            tool_id = rel_path.lower().replace(".cs", "").replace("\\", "_").replace("/", "_").replace(" ", "_").replace(".", "_")

            lightweight_manifest.append({
                "id": tool_id,
                "name": script.get("name"),
                "type": script.get("type"),
                "absolutePath": script.get("absolutePath"),
                "parameters": script.get("parameters", []),
                "metadata": {
                    "description": metadata.get("description", "No description"),
                    "categories": metadata.get("categories", []),
                    "documentType": metadata.get("document_type") or "Any",
                    "usage_examples": metadata.get("usage_examples", []),
                    "dateCreated": metadata.get("dateCreated"),
                    "dateModified": metadata.get("dateModified"),
                }
            })

        manifest_path = os.path.join(agent_scripts_path, "manifest.json")
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(lightweight_manifest, f, indent=2)

        return {"message": "Manifest generated successfully", "count": len(lightweight_manifest)}
    except Exception as e:
        logger.error(f"Error generating manifest: {e}")
        raise HTTPException(status_code=500, detail=str(e))
