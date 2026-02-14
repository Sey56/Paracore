from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from grpc_client import get_category_parameters
from services import query_service

router = APIRouter(prefix="/api/query", tags=["Query Builder"])

from typing import List, Dict, Any, Optional, Union, Literal

class QueryRule(BaseModel):
    type: Literal["rule"] = "rule"
    name: str
    storage_type: str
    operator: str
    value: Any
    unit: Optional[str] = None
    is_builtin: bool = False
    builtin_id: Optional[int] = None
    revit_element_type: Optional[str] = None

class QueryGroup(BaseModel):
    type: Literal["group"] = "group"
    combinator: Literal["AND", "OR"] = "AND"
    children: List[Union["QueryRule", "QueryGroup"]]

class GenerateQueryRequest(BaseModel):
    category_name: str
    root_group: QueryGroup

QueryGroup.model_rebuild()

@router.get("/parameters/{category_name}")
async def get_params(category_name: str):
    """
    Returns available parameters for a specific Revit category.
    """
    response = get_category_parameters(category_name)
    if response.get("error_message"):
        raise HTTPException(status_code=500, detail=response["error_message"])
    return response

@router.post("/generate")
async def generate_code(request: GenerateQueryRequest):
    """
    Converts visual rules into Paracore-compliant C# code.
    """
    try:
        rules_dict = [r.dict() for r in request.rules]
        return query_service.generate_query_code(request.category_name, rules_dict)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
