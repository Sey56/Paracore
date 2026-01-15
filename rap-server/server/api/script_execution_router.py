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
from agent.graph import get_app # Import agent app


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
            try:
                app_instance = await get_app()
                config = {"configurable": {"thread_id": thread_id}}
                latest_state = await app_instance.aget_state(config)
                working_set = latest_state.values.get('working_set') if latest_state else None
                
                if working_set:
                    all_ids = []
                    if isinstance(working_set, dict):
                        for ids in working_set.values():
                            all_ids.extend(ids)
                    elif isinstance(working_set, list):
                        all_ids = working_set
                    
                    # Deduplicate
                    all_ids = list(set(all_ids))

                    # VALIDATION STEP: Ensure we only inject IDs that actually exist in the document
                    if all_ids:
                        valid_ids = validate_working_set_grpc(all_ids)
                        # print(f"DEBUG: Validated working set for injection. {len(all_ids)} -> {len(valid_ids)} valid IDs.")
                        all_ids = valid_ids

                    # Construct the C# code for List<ElementId> initialization
                    # Example: List<Autodesk.Revit.DB.ElementId> targetWallIds = new List<Autodesk.Revit.DB.ElementId> { new ElementId(123L), new ElementId(456L) };
                    # Ensure IDs are integers to avoid "365799.0L" syntax errors
                    element_id_initializers = ", ".join([f"new Autodesk.Revit.DB.ElementId({int(eid)}L)" for eid in all_ids])
                    csharp_list_code = f"List<Autodesk.Revit.DB.ElementId> targetWallIds = new List<Autodesk.Revit.DB.ElementId> {{ {element_id_initializers} }};"

                    for script_file in script_files_payload:
                        if placeholder_line in script_file["Content"]:
                             script_file["Content"] = script_file["Content"].replace(placeholder_line, csharp_list_code)
            except Exception as e:
                # Log the error but don't block execution
                print(f"Warning: Failed to inject working set. Reason: {e}")
        # --- END INJECTION LOGIC ---

        script_content_json = json.dumps(script_files_payload)
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
