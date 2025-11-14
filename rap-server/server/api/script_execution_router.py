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
):
    data = await request.json()
    path = data.get("path")
    parameters = data.get("parameters")
    script_type = data.get("type")
    source_folder = data.get("source_folder")
    source_workspace = data.get("source_workspace")

    if not path:
        raise HTTPException(status_code=400, detail="No script path provided")

    db: Session = next(get_db())
    resolved_script_path = resolve_script_path(path)
    script = get_or_create_script(db, resolved_script_path, current_user.id)

    try:
        absolute_path = resolved_script_path
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

        # Single call to the gRPC service
        response_data = execute_script(script_content_json, parameters_json)
        
        # Log the script run to the database
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
        # Log failure to the database
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
        
        if isinstance(e, (FileNotFoundError, grpc.RpcError, HTTPException)):
            raise
        else:
            raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
