import logging
import os
import json
import base64
import glob
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import grpc_client
from utils import resolve_script_path

router = APIRouter(prefix="/api/scripts", tags=["scripts"])

class BuildToolRequest(BaseModel):
    scriptPath: str

@router.post("/build-tool")
async def build_tool_endpoint(request: BuildToolRequest):
    """
    V3 Build Tool: Combines code from Scripts/ folder and bakes it into a .ptool.
    Saves the .ptool as a sibling to the project folder so it appears in the gallery.
    """
    try:
        project_path = resolve_script_path(request.scriptPath)
        is_dir = os.path.isdir(project_path)
        
        script_files = []
        if is_dir:
            # Look strictly in Scripts/
            scripts_dir = os.path.join(project_path, "Scripts")
            if not os.path.isdir(scripts_dir):
                raise HTTPException(status_code=400, detail="Scripts folder missing in project")
                
            for fp in glob.glob(os.path.join(scripts_dir, "*.cs")):
                if os.path.basename(fp).lower() == "globals.cs": continue
                with open(fp, "r", encoding="utf-8-sig") as file:
                    script_files.append({"file_name": os.path.basename(fp), "content": file.read()})
        else:
            # Legacy/Single file support
            with open(project_path, "r", encoding="utf-8-sig") as f:
                script_files.append({"file_name": os.path.basename(project_path), "content": f.read()})

        if not script_files:
            raise HTTPException(status_code=400, detail="No source code found to build")

        # 1. Get Metadata and Parameters (to bake them in)
        metadata_res = grpc_client.get_script_metadata(script_files)
        params_res = grpc_client.get_script_parameters(script_files)
        combined_res = grpc_client.get_combined_script(script_files)

        metadata = metadata_res.get("metadata")
        parameters = params_res.get("parameters")
        combined_content = combined_res.get("combined_script")

        # V4 Safety Fallback: If gRPC metadata missed the watchdog flag, check combined content directly
        is_watchdog_content = combined_content and ("Watchdog(" in combined_content or "Watchdog (" in combined_content)
        if is_watchdog_content and metadata:
            metadata["is_watchdog"] = True

        if not combined_content:
             raise HTTPException(status_code=400, detail="Failed to combine script files for build")

        # 2. Trigger Build
        # Passing the COMBINED content so the rewriter and compiler work on the full context
        build_res = grpc_client.build_script(combined_content)
        
        if not build_res.get("is_success"):
             raise HTTPException(status_code=500, detail=f"Compilation failed: {build_res.get('error_message')}")

        assembly_bytes = build_res.get("compiled_assembly")
        assembly_base64 = base64.b64encode(assembly_bytes).decode('utf-8')

        # 3. Create package
        metadata["is_protected"] = True
        metadata["is_compiled"] = True
        
        is_watchdog = metadata.get("is_watchdog", False)
        ext = ".wtool" if is_watchdog else ".ptool"

        ptool_data = {
            "metadata": metadata,
            "parameters": parameters,
            "assembly": assembly_base64
        }

        # 4. Save path logic: Sibling to the project folder
        if is_dir:
            output_path = project_path.rstrip("/\\") + ext
        else:
            output_path = project_path.replace(".cs", ext)

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(ptool_data, f, indent=2)

        return {
            "is_success": True,
            "output_path": output_path,
            "message": f"Successfully built {'guard' if is_watchdog else 'protected tool'}: {os.path.basename(output_path)}"
        }

    except Exception as e:
        logging.error(f"Error building tool: {e}")
        if isinstance(e, HTTPException): raise e
        raise HTTPException(status_code=500, detail=str(e))
