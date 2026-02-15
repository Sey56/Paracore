from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from grpc_client import get_model_categories
from services import query_service, script_service

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
    builtin_name: Optional[str] = None
    revit_element_type: Optional[str] = None
    spec_type_id: Optional[str] = None

class QueryGroup(BaseModel):
    type: Literal["group"] = "group"
    combinator: Literal["AND", "OR"] = "AND"
    children: List[Union["QueryRule", "QueryGroup"]]

class GenerateQueryRequest(BaseModel):
    category_name: str
    root_group: QueryGroup
    selected_columns: Optional[List[QueryRule]] = None
    scope: str = "project"

QueryGroup.model_rebuild()

@router.get("/all-categories")
async def get_all_categories():
    """
    Returns every model category from the current Revit project.
    """
    return get_model_categories()

@router.get("/parameters/{category_name}")
async def get_params(category_name: str):
    """
    Returns available parameters for a specific Revit category.
    """
    response = script_service.get_category_parameters_logic(category_name)
    if response.get("error_message"):
        raise HTTPException(status_code=500, detail=response["error_message"])
    return response

@router.post("/generate")
async def generate_code(request: GenerateQueryRequest):
    """
    Converts visual rules into Paracore-compliant C# code.
    """
    try:
        root_dict = request.root_group.dict()
        cols_dict = [c.dict() for c in request.selected_columns] if request.selected_columns else None
        return query_service.generate_query_code(request.category_name, root_dict, cols_dict, request.scope)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
