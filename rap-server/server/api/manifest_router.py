from fastapi import APIRouter, Body, HTTPException, Depends
from pydantic import BaseModel
import json
import os
import glob
import grpc
from datetime import datetime

import grpc_client
from auth import get_current_user, CurrentUser
from utils import resolve_script_path

router = APIRouter()

class ManifestRequest(BaseModel):
    tool_library_path: str

@router.post("/script-manifest", tags=["Manifest Management"])
async def create_script_manifest(
    request: ManifestRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Generates and saves a manifest.json file for all scripts found in the provided path.
    """
    folderPath = request.tool_library_path
    if not folderPath or not os.path.isabs(folderPath) or not os.path.isdir(folderPath):
        raise HTTPException(status_code=400, detail="A valid, absolute folder path is required.")

    scripts = []
    try:
        # Process single .cs files
        for file_path in glob.glob(os.path.join(folderPath, "*.cs")):
            try:
                resolved_file_path = resolve_script_path(file_path)
                with open(resolved_file_path, 'r', encoding='utf-8-sig') as f:
                    content = f.read()
                script_files = [{"file_name": os.path.basename(resolved_file_path), "content": content}]
                metadata = grpc_client.get_script_metadata(script_files).get("metadata", {})
                
                file_stat = os.stat(resolved_file_path)
                scripts.append({
                    "id": resolved_file_path.replace('\\', '/'),
                    "name": os.path.basename(resolved_file_path),
                    "type": "single-file",
                    "absolutePath": resolved_file_path.replace('\\', '/'),
                    "sourcePath": resolved_file_path.replace('\\', '/'),
                    "metadata": {**metadata, "dateCreated": datetime.fromtimestamp(file_stat.st_ctime).isoformat(), "dateModified": datetime.fromtimestamp(file_stat.st_mtime).isoformat()}
                })
            except Exception:
                continue

        # Process folders containing .cs files
        for item in os.listdir(folderPath):
            item_path = os.path.join(folderPath, item)
            if os.path.isdir(item_path) and glob.glob(os.path.join(item_path, "*.cs")):
                try:
                    resolved_item_path = resolve_script_path(item_path)
                    script_files = []
                    for fp in glob.glob(os.path.join(item_path, "*.cs")):
                        with open(fp, 'r', encoding='utf-8-sig') as f:
                            content = f.read()
                        script_files.append({"file_name": os.path.basename(fp), "content": content})
                    
                    if not script_files: continue
                    
                    metadata = grpc_client.get_script_metadata(script_files).get("metadata", {})
                    folder_stat = os.stat(resolved_item_path)
                    scripts.append({
                        "id": resolved_item_path.replace('\\', '/'),
                        "name": os.path.basename(resolved_item_path),
                        "type": "multi-file",
                        "absolutePath": resolved_item_path.replace('\\', '/'),
                        "sourcePath": resolved_item_path.replace('\\', '/'),
                        "metadata": {**metadata, "dateCreated": datetime.fromtimestamp(folder_stat.st_ctime).isoformat(), "dateModified": datetime.fromtimestamp(folder_stat.st_mtime).isoformat()}
                    })
                except Exception:
                    continue
        
        # Save the full manifest to a file
        manifest_path = os.path.join(folderPath, "manifest.json")
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(scripts, f, indent=2)
            
        return {"message": f"Successfully generated and saved manifest for {len(scripts)} scripts at {manifest_path}."}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate script manifest: {str(e)}")
