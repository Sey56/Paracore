import os
import json
import glob
import grpc
from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database_config import get_db
from ..grpc_client import execute_script
from ..utils import get_or_create_script, resolve_script_path
from ..auth import get_current_user, CurrentUser


router = APIRouter()

@router.post("/run-script", tags=["Script Execution"])
async def run_script(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
):
    data = await request.json()
    path = data.get("path")
    parameters = data.get("parameters")
    script_type = data.get("type")

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

        script_run = models.ScriptRun(
            script_id=script.id,
            user_id=str(current_user.id),
            status=run_status,
            output=run_output,
            parameters=parameters
        )
        db.add(script_run)
        db.commit()

        return JSONResponse(content=response)
        
    except Exception as e:
        # Create a failure run log regardless of the error type
        script_run = models.ScriptRun(
            script_id=script.id,
            user_id=str(current_user.id),
            status="failure",
            output=str(e),
            parameters=parameters
        )
        db.add(script_run)
        db.commit()
        
        if isinstance(e, (FileNotFoundError, grpc.RpcError, HTTPException)):
            raise # Re-raise known exceptions
        else:
            raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")
