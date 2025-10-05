from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, List, Dict, Any
import json
from datetime import datetime

# --- Workspace Schemas ---
class WorkspaceBase(BaseModel):
    name: str
    path: str

class WorkspaceCreate(WorkspaceBase):
    pass

class WorkspaceResponse(WorkspaceBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

# --- Preset Schemas ---
class PresetBase(BaseModel):
    name: str
    parameters: List[Dict[str, Any]]

class PresetCreate(PresetBase):
    pass

class PresetResponse(PresetBase):
    id: int
    script_id: int

    class Config:
        from_attributes = True

class PresetRequest(BaseModel):
    scriptPath: str
    presets: List[PresetCreate]


# --- Script Run Schemas ---
class ScriptRunBase(BaseModel):
    status: str
    output: Optional[str] = None
    parameters: Optional[List[Dict[str, Any]]] = None

class ScriptRunCreate(ScriptRunBase):
    script_id: int
    user_id: str

class ScriptRunResponse(ScriptRunBase):
    id: int
    script_id: int
    user_id: str
    timestamp: datetime

    @validator('parameters', pre=True)
    def parse_parameters(cls, v):
        if isinstance(v, str):
            return json.loads(v)
        return v

    class Config:
        from_attributes = True

# --- Script Schemas ---
class ScriptBase(BaseModel):
    name: str
    path: str
    description: Optional[str] = None

class ScriptCreate(ScriptBase):
    pass

class ScriptResponse(ScriptBase):
    id: int
    owner_id: str
    presets: List[PresetResponse] = []
    runs: List['ScriptRunResponse'] = []

    class Config:
        from_attributes = True

# --- User Schemas ---
class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None

class UserCreate(UserBase):
    password: str

class UserResponse(UserBase):
    id: int
    is_active: bool

    class Config:
        from_attributes = True

class CurrentUserResponse(UserResponse):
    pass
