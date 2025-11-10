from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import json
import math

import models, schemas
from database_config import get_db
from utils import get_or_create_script, resolve_script_path
from auth import get_current_user, CurrentUser

router = APIRouter()

# Helper function for deep comparison of parameters
def are_parameters_equal_python(params1: List[schemas.ParameterSchema], params2: List[schemas.ParameterSchema]) -> bool:
    if len(params1) != len(params2):
        return False

    EPSILON = 0.000001  # Small tolerance for floating-point comparison

    # Sort parameters by name to ensure consistent comparison regardless of order
    # Access attributes using dot notation (p.name, p.type, p.value)
    sorted_params1 = sorted(params1, key=lambda p: p.name)
    sorted_params2 = sorted(params2, key=lambda p: p.name)

    for i in range(len(sorted_params1)):
        p1 = sorted_params1[i]
        p2 = sorted_params2[i]

        # Access attributes using dot notation
        if p1.name != p2.name or p1.type != p2.type:
            return False

        val1 = p1.value
        val2 = p2.value

        # Normalize None and undefined (represented as None in Python) for comparison
        if val1 is None and val2 is None:
            continue
        if val1 is None or val2 is None:
            return False

        # Special handling for number types with tolerance
        if p1.type == 'number' and isinstance(val1, (int, float)) and isinstance(val2, (int, float)):
            if math.fabs(val1 - val2) > EPSILON:
                return False
        elif val1 != val2:
            # For other types, use strict equality after normalization
            return False
    return True

@router.get("/api/presets", response_model=List[schemas.PresetResponse], tags=["presets"])
def get_presets(
    scriptPath: str = Query(...),
    db: Session = Depends(get_db),
):
    # Resolve and normalize scriptPath before using it with get_or_create_script
    resolved_script_path = resolve_script_path(scriptPath)
    script = db.query(models.Script).filter(models.Script.path == resolved_script_path).first()
    if script:
        # Manually map models.Preset to schemas.PresetResponse
        # Deserialize the 'values' field back to 'parameters'
        presets_response = []
        for preset_model in script.presets:
            parameters_list = json.loads(preset_model.values) if preset_model.values else []
            # Convert dicts from JSON to ParameterSchema objects
            parameters_schema_list = [schemas.ParameterSchema(**p) for p in parameters_list]
            
            presets_response.append(schemas.PresetResponse(
                id=preset_model.id,
                script_id=preset_model.script_id,
                name=preset_model.name,
                parameters=parameters_schema_list
            ))
        return presets_response
    return []

@router.post("/api/presets", tags=["presets"])
def save_presets(
    request_data: schemas.PresetRequest,
    db: Session = Depends(get_db),
    current_user: CurrentUser = Depends(get_current_user)
):
    # Resolve and normalize scriptPath before using it with get_or_create_script
    resolved_script_path = resolve_script_path(request_data.scriptPath)
    script = get_or_create_script(db, resolved_script_path, current_user.id)

    # Perform uniqueness check based on parameter values within the incoming request_data.presets
    # This ensures that the set of presets being saved does not contain duplicates by value.
    for i, preset_a in enumerate(request_data.presets):
        for j, preset_b in enumerate(request_data.presets):
            if i == j:  # Don't compare a preset with itself
                continue
            
            if are_parameters_equal_python(preset_a.parameters, preset_b.parameters):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Two presets in the request have identical parameter values: '{preset_a.name}' and '{preset_b.name}'"
                )

    # If all checks pass, delete existing and save new presets
    db.query(models.Preset).filter(models.Preset.script_id == script.id).delete()
    for preset_data in request_data.presets:
        # Serialize parameters to JSON string before saving
        serialized_parameters = json.dumps([p.dict() for p in preset_data.parameters]) # Convert ParameterSchema to dicts

        db_preset = models.Preset(
            name=preset_data.name,
            values=serialized_parameters, # Changed from parameters to values, and serialized
            script_id=script.id
        )
        db.add(db_preset)
    db.commit()
    return {"message": "Presets saved successfully"}