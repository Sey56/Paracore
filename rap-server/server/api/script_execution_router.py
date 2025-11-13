import os
import json
import glob
import grpc
from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

import models, schemas
from database_config import get_db
from grpc_client import execute_script
from utils import get_or_create_script, resolve_script_path
from auth import get_current_user, CurrentUser


router = APIRouter()

from typing import Optional # Import Optional

@router.post("/run-script", tags=["Script Execution"])
async def run_script(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    source_folder: Optional[str] = None, # New parameter
    source_workspace: Optional[str] = None, # New parameter
):
    data = await request.json()
    path = data.get("path")
    parameters = data.get("parameters")
    script_type = data.get("type")
    # Extract source_folder and source_workspace from data if not provided as query params
    source_folder = data.get("source_folder", source_folder)
    source_workspace = data.get("source_workspace", source_workspace)

    if not path:
        raise HTTPException(status_code=400, detail="No script path provided")

    db: Session = next(get_db())
    # Resolve and normalize scriptPath before using it with get_or_create_script
    resolved_script_path = resolve_script_path(path)
    script = get_or_create_script(db, resolved_script_path, current_user.id)

    try:
        absolute_path = resolved_script_path # Use the already resolved path
        script_files_payload = []
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

        script_content_json = json.dumps(script_files_payload)
        parameters_json = json.dumps(parameters)

        response = execute_script(script_content_json, parameters_json)
        
        run_status = "success" if not response.get("error") else "failure"
        run_output = response.get("output", "")
        if response.get("error"): 
            run_output += "\nERROR: " + response.get("error")

        script_run = models.Run(
            script_id=script.id,
            user_id=current_user.id,
            team_id=current_user.activeTeam,
            role=current_user.activeRole,
            status=run_status,
            output=run_output,
            source_folder=source_folder, # New field
            source_workspace=source_workspace # New field
        )
        db.add(script_run)
        db.commit()

        response = execute_script(script_content_json, parameters_json)
        
        # Extract agent_summary from the response object
        agent_summary = response.get("agent_summary")

        run_status = "success" if not response.get("error") else "failure"
        run_output = response.get("output", "")
        if response.get("error"): 
            run_output += "\nERROR: " + response.get("error")

        script_run = models.Run(
            script_id=script.id,
            user_id=current_user.id,
            team_id=current_user.activeTeam,
            role=current_user.activeRole,
            status=run_status,
            output=run_output,
            source_folder=source_folder, # New field
            source_workspace=source_workspace # New field
        )
        db.add(script_run)
        db.commit()

        # Construct the content for JSONResponse, ensuring all values are JSON serializable
        response_content = {
            "is_success": response.get("is_success"),
            "output": response.get("output"),
            "error_message": response.get("error_message"),
            "error_details": response.get("error_details"),
            "structured_output": response.get("structured_output"), # This should be a list of dicts
            "output_summary": response.get("output_summary"), # This should be a dict
            "agent_summary": agent_summary # This should be a string
        }
        
        # Ensure structured_output is a list of dictionaries if it's not already
        if response_content["structured_output"] is not None:
            response_content["structured_output"] = [
                item.to_dict() if hasattr(item, 'to_dict') else item
                for item in response_content["structured_output"]
            ]

        # Ensure output_summary is a dictionary if it's not already
        if response_content["output_summary"] is not None:
            if hasattr(response_content["output_summary"], 'to_dict'):
                response_content["output_summary"] = response_content["output_summary"].to_dict()
            # Further process nested fields within output_summary if they are gRPC objects
            if response_content["output_summary"].get("table") and hasattr(response_content["output_summary"]["table"], 'to_dict'):
                response_content["output_summary"]["table"] = response_content["output_summary"]["table"].to_dict()
            if response_content["output_summary"].get("console") and hasattr(response_content["output_summary"]["console"], 'to_dict'):
                response_content["output_summary"]["console"] = response_content["output_summary"]["console"].to_dict()
            if response_content["output_summary"].get("return_value_summary") and hasattr(response_content["output_summary"]["return_value_summary"], 'to_dict'):
                response_content["output_summary"]["return_value_summary"] = response_content["output_summary"]["return_value_summary"].to_dict()


        return JSONResponse(content=response_content)
        
    except Exception as e:
        # Create a failure run log regardless of the error type
        script_run = models.Run(
            script_id=script.id,
            user_id=current_user.id,
            team_id=current_user.activeTeam,
            role=current_user.activeRole,
            status="failure",
            output=str(e),
            source_folder=source_folder, # New field
            source_workspace=source_workspace # New field
        )
        db.add(script_run)
        db.commit()
        
        if isinstance(e, (FileNotFoundError, grpc.RpcError, HTTPException)):
            raise # Re-raise known exceptions
        else:
            raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
