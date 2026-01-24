import os
import json
import glob
import grpc
from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

import models, schemas
from database_config import get_db
from grpc_client import execute_script, validate_working_set_grpc, select_elements, pick_object
from utils import get_or_create_script, resolve_script_path
from auth import get_current_user, CurrentUser
# Agent graph import removed for Operation Simple


router = APIRouter()

from typing import Optional # Import Optional
from pydantic import BaseModel

class PickObjectRequest(BaseModel):
    selection_type: str
    category_filter: Optional[str] = None

@router.post("/api/pick-object", tags=["Script Execution"])
async def pick_object_endpoint(request: PickObjectRequest):
    """
    Triggers a PickObject operation in Revit.
    """
    try:
        response = pick_object(request.selection_type, request.category_filter)
        return JSONResponse(content=response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/run-script", tags=["Script Execution"])
async def run_script(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
):
    data = await request.json()
    path = data.get("path")
    parameters = data.get("parameters")
    script_type = data.get("type")
    source_folder = data.get("source_folder")
    source_workspace = data.get("source_workspace")
    thread_id = data.get("thread_id") # Get thread_id from request
    generated_code = data.get("generated_code") # Get generated code if provided
    generated_files = data.get("generated_files") # Get generated files if provided (modular)

    if not path:
        raise HTTPException(status_code=400, detail="No script path provided")

    db: Session = next(get_db())
    script = None
    resolved_script_path = None

    try:
        # Skip path resolution and DB script creation for generated code
        if not generated_code:
            resolved_script_path = resolve_script_path(path)
            script = get_or_create_script(db, resolved_script_path, current_user.id)
        else:
            # For generated code, use a placeholder
            resolved_script_path = None
            script = None

        script_files_payload = []
        
        # Handle generated code (from Generation Mode)
        if generated_files and isinstance(generated_files, dict):
            for filename, code in generated_files.items():
                script_files_payload.append({"FileName": filename, "Content": code})
        elif generated_code:
            script_files_payload.append({"FileName": "generated_script.cs", "Content": generated_code})
        # Handle file-based scripts (Manual/Agent modes)
        else:
            absolute_path = resolved_script_path
            if script_type == "single-file":
                with open(absolute_path, 'r', encoding='utf-8-sig') as f:
                    source_code = f.read()
                script_files_payload.append({"FileName": os.path.basename(path), "Content": source_code})
            elif script_type == "multi-file":
                for file_path in glob.glob(os.path.join(absolute_path, "*.cs")):
                    with open(file_path, 'r', encoding='utf-8-sig') as f:
                        source_code = f.read()
                    script_files_payload.append({"FileName": os.path.basename(file_path), "Content": source_code})

        if not script_files_payload:
            raise HTTPException(status_code=404, detail="No script files found.")

        # --- WORKING SET INJECTION LOGIC ---
        # Check if any file actually needs injection before doing expensive state lookups and validation
        placeholder_line = "List<ElementId>? targetWallIds = null; // __INJECT_WORKING_SET__"
        needs_injection = any(placeholder_line in sf["Content"] for sf in script_files_payload)

        if thread_id and needs_injection:
            # Working set injection disabled for Operation Simple
            # This will be replaced with a UI-driven property injection in the future
            pass
        # --- END INJECTION LOGIC ---

        # Inject __script_name__ for Dashboard reporting
        # Default to basename of source path if script object isn't found (e.g. generated code or external path)
        script_name_for_dashboard = os.path.basename(path) if path else "Generated Script"
        
        if script:
            script_name_for_dashboard = script.name
        elif generated_code:
             script_name_for_dashboard = "Generated Code"
             
        if parameters is None:
            # CodeRunner expects a List<ScriptParameter> by default
            parameters = []
        elif isinstance(parameters, str):
            try:
                parameters = json.loads(parameters)
            except json.JSONDecodeError:
                print(f"Warning: Failed to parse parameters JSON: {parameters}")
                parameters = []
            
        # Inject __script_name__ (handle both List and Dict formats)
        if isinstance(parameters, list):
            # It's a list (CoreScript standard), so append a new parameter object
            parameters.append({
                "Name": "__script_name__",
                "Value": script_name_for_dashboard,
                "Type": "string",
                "Description": "Hidden parameter for dashboard reporting"
            })
        elif isinstance(parameters, dict):
            # It's a flat dict (rare/legacy), set the key directly
            parameters["__script_name__"] = script_name_for_dashboard

        script_content_json = json.dumps(script_files_payload)
        # Dump back to JSON string for the gRPC call
        parameters_json = json.dumps(parameters)

        # Single call to the gRPC service
        response_data = execute_script(script_content_json, parameters_json)
        
        # Log the script run to the database (skip for generated code)
        if script is not None:
            run_status = "success" if response_data.get("is_success") else "failure"
            
            # Combine output and error for the log
            run_output = response_data.get("output", "")
            error_message = response_data.get("error_message")
            if error_message:
                run_output += f"\nERROR: {error_message}"
            error_details = response_data.get("error_details")
            if error_details:
                run_output += "\n" + "\n".join(error_details)

            script_run = models.Run(
                script_id=script.id,
                user_id=current_user.id,
                team_id=current_user.activeTeam,
                role=current_user.activeRole,
                status=run_status,
                output=run_output,
                source_folder=source_folder,
                source_workspace=source_workspace
            )
            db.add(script_run)
            db.commit()

        # The data from execute_script is already a JSON-serializable dictionary
        return JSONResponse(content=response_data)
        
    except Exception as e:
        # Log failure to the database (skip for generated code)
        if script is not None:
            script_run = models.Run(
                script_id=script.id,
                user_id=current_user.id,
                team_id=current_user.activeTeam,
                role=current_user.activeRole,
                status="failure",
                output=str(e),
                source_folder=source_folder,
                source_workspace=source_workspace
            )
            db.add(script_run)
            db.commit()
        
        if isinstance(e, FileNotFoundError):
             raise HTTPException(status_code=404, detail=f"Script file not found at source path: {path}")
        elif isinstance(e, (grpc.RpcError, HTTPException)):
            raise
        else:
            raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

@router.post("/api/select-elements", tags=["Script Execution"])
async def select_elements_endpoint(request: Request):
    """
    Sets the selection in the active Revit document.
    """
    try:
        data = await request.json()
        element_ids = data.get("element_ids")
        if not isinstance(element_ids, list):
            raise HTTPException(status_code=400, detail="element_ids must be a list of integers.")
        
        # Ensure all IDs are integers
        element_ids = [int(eid) for eid in element_ids]
        
        response = select_elements(element_ids)
        return JSONResponse(content=response)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
