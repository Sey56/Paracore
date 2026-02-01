import logging
import os
import json
import base64
from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import List, Optional
import grpc_client

router = APIRouter(prefix="/api/scripts", tags=["scripts"])

class BuildToolRequest(BaseModel):
    scriptPath: str

@router.post("/build-tool")
async def build_tool_endpoint(request: BuildToolRequest):
    """
    Builds a protected .ptool from a source .cs script or folder.
    """
    script_path = request.scriptPath
    if not os.path.exists(script_path):
        raise HTTPException(status_code=404, detail="Script path not found")

    is_dir = os.path.isdir(script_path)
    script_files = []

    if is_dir:
        # Multi-file script
        for f in os.listdir(script_path):
            if f.endswith(".cs"):
                fpath = os.path.join(script_path, f)
                with open(fpath, "r", encoding="utf-8") as file:
                    script_files.append({"file_name": f, "content": file.read()})
    else:
        # Single-file script
        if not script_path.endswith(".cs"):
             raise HTTPException(status_code=400, detail="Only .cs files can be built into tools")
        with open(script_path, "r", encoding="utf-8") as f:
            script_files.append({"file_name": os.path.basename(script_path), "content": f.read()})

    if not script_files:
        raise HTTPException(status_code=400, detail="No source code found to build")

    try:
        # 1. Get Metadata and Parameters (to bake them in)
        metadata_res = grpc_client.get_script_metadata(script_files)
        params_res = grpc_client.get_script_parameters(script_files)
        combined_res = grpc_client.get_combined_script(script_files)

        metadata = metadata_res.get("metadata")
        parameters = params_res.get("parameters")
        combined_content = combined_res.get("combined_script")

        if not combined_content:
             raise HTTPException(status_code=400, detail="Failed to combine script files")

        # 2. Trigger Build
        # We must pass the list of ScriptFile objects as JSON, not the combined content
        # because the C# backend's BuildScript RPC expects the same JSON input as ExecuteScript
        script_files_json = json.dumps(script_files)
        build_res = grpc_client.build_script(script_files_json)
        if not build_res.get("is_success"):
             raise HTTPException(status_code=500, detail=f"Compilation failed: {build_res.get('error_message')}")

        assembly_bytes = build_res.get("compiled_assembly")
        assembly_base64 = base64.b64encode(assembly_bytes).decode('utf-8')

        # 3. Create .ptool package
        # Force is_protected and is_compiled to True for the baked metadata
        metadata["is_protected"] = True
        metadata["is_compiled"] = True

        ptool_data = {
            "metadata": metadata,
            "parameters": parameters,
            "assembly": assembly_base64
        }

        # Save as .ptool in the same directory (or parent if it's a folder)
        if is_dir:
            output_path = script_path.rstrip("/\\") + ".ptool"
        else:
            output_path = script_path.replace(".cs", ".ptool")

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(ptool_data, f, indent=2)

        return {
            "is_success": True,
            "output_path": output_path,
            "message": f"Successfully built protected tool: {os.path.basename(output_path)}"
        }

    except Exception as e:
        logging.error(f"Error building tool: {e}")
        raise HTTPException(status_code=500, detail=str(e))
