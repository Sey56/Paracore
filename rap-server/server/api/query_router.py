from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import traceback
from grpc_client import get_model_categories
from services import query_service, script_service
from services.query_to_watchdog import generate_watchdog_script

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
    children: List[Union[QueryRule, "QueryGroup"]]

QueryGroup.model_rebuild()

class GenerateQueryRequest(BaseModel):
    category_name: str
    root_group: QueryGroup
    selected_columns: Optional[List[QueryRule]] = None
    scope: str = "project"
    is_watchdog: bool = False
    name: Optional[str] = "Sentinel"
    description: Optional[str] = "Generated Sentinel"

class SaveAsWatchdogRequest(BaseModel):
    name: str
    description: str
    target_folder: str
    category_name: str
    root_group: QueryGroup
    selected_columns: Optional[List[QueryRule]] = None
    scope: str = "project"

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
    try:
        root_dict = request.root_group.dict()
        cols_dict = [c.dict() for c in request.selected_columns] if request.selected_columns else []
        
        if request.is_watchdog:
            from services.query_to_watchdog import generate_watchdog_script_content
            content = await generate_watchdog_script_content(
                request.name or "Sentinel",
                request.description or "Generated Sentinel",
                request.category_name,
                root_dict,
                cols_dict,
                request.scope
            )
            # Re-run standard generation to get the parameters list for the UI
            standard = query_service.generate_query_code(request.category_name, root_dict, cols_dict, request.scope)
            
            return {
                "logic": content,
                "params": standard["params"]
            }

        return query_service.generate_query_code(request.category_name, root_dict, cols_dict, request.scope)
    except Exception as e:
        print(f"Error in generate_code: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/save-as-watchdog")
async def save_as_watchdog(request: SaveAsWatchdogRequest):
    """
    Generates and saves a Watchdog script from visual rules.
    """
    try:
        root_dict = request.root_group.dict()
        cols_dict = [c.dict() for c in request.selected_columns] if request.selected_columns else []
        return await generate_watchdog_script(
            request.name,
            request.description,
            request.target_folder,
            request.category_name,
            root_dict,
            cols_dict,
            request.scope
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
