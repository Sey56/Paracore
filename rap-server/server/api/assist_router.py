import logging
from typing import List, Optional, Dict

from fastapi import APIRouter, Depends
from auth import CurrentUser, get_current_user
from services import assist_service
from services.assist_service import ExplainErrorResponse, FixAttempt
from pydantic import BaseModel

router = APIRouter(prefix="/generation", tags=["AI Assistance"])
logger = logging.getLogger(__name__)

class ExplainErrorRequest(BaseModel):
    script_code: str
    script_path: str
    error_message: str
    context: Dict[str, str]
    llm_provider: str
    llm_model: str
    llm_api_key_value: str
    history: Optional[List[FixAttempt]] = []

@router.post("/explain_error", response_model=ExplainErrorResponse)
async def explain_error(request: ExplainErrorRequest, current_user: CurrentUser = Depends(get_current_user)):
    return await assist_service.explain_error_logic(
        script_code=request.script_code,
        script_path=request.script_path,
        error_message=request.error_message,
        context=request.context,
        llm_provider=request.llm_provider,
        llm_model=request.llm_model,
        llm_api_key_value=request.llm_api_key_value,
        history=request.history or []
    )
