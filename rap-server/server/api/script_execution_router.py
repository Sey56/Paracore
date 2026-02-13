from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from auth import CurrentUser, get_current_user
from database_config import get_db
from pydantic import BaseModel
from services import execution_service

router = APIRouter()

class PickObjectRequest(BaseModel):
    selection_type: str
    category_filter: Optional[str] = None

@router.post("/api/pick-object", tags=["Script Execution"])
async def pick_object_endpoint(request: PickObjectRequest):
    return await execution_service.pick_object_logic(request.selection_type, request.category_filter)

@router.post("/run-script", tags=["Script Execution"])
async def run_script(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    data = await request.json()
    response_data = await execution_service.run_script_logic(
        path=data.get("path"),
        parameters=data.get("parameters"),
        script_type=data.get("type"),
        source_folder=data.get("source_folder"),
        source_team_source=data.get("source_team_source"),
        thread_id=data.get("thread_id"),
        current_user_id=current_user.id,
        active_team=current_user.activeTeam,
        active_role=current_user.activeRole,
        db=db
    )
    return JSONResponse(content=response_data)

@router.post("/api/select-elements", tags=["Script Execution"])
async def select_elements_endpoint(request: Request):
    data = await request.json()
    element_ids = data.get("element_ids")
    if not isinstance(element_ids, list):
        raise HTTPException(status_code=400, detail="element_ids must be a list of integers.")
    element_ids = [int(eid) for eid in element_ids]
    response = await execution_service.select_elements_logic(element_ids)
    return JSONResponse(content=response)
