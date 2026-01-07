from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime

# User schemas
class UserBase(BaseModel):
    email: str

class UserCreate(UserBase):
    pass

class UserResponse(UserBase):
    id: int

    class Config:
        from_attributes = True

# Assuming these are the fields in the current_user object
class Membership(BaseModel):
    team_id: int
    team_name: str
    role: str # e.g., "admin", "developer", "user"

class CurrentUserResponse(UserResponse):
    memberships: List[Membership]
    activeTeam: Optional[int] = None # ID of the active team
    activeRole: Optional[str] = None # Role in the active team
    # Add any other fields that get_current_user might return

# User Profile Sync schemas
class UserProfileSyncRequest(BaseModel):
    user_id: int
    email: str
    memberships: List[Membership] = []
    activeTeam: Optional[int] = None
    activeRole: Optional[str] = None

# Script schemas
class ScriptBase(BaseModel):
    name: str
    path: str
    owner_id: int
    is_favorite: bool = False
    last_run_at: Optional[datetime] = None # Represent datetime as string for Pydantic

class ScriptCreate(ScriptBase):
    pass

class ScriptResponse(ScriptBase):
    id: int

    class Config:
        from_attributes = True

# Workspace schemas (for locally cloned repos)
class WorkspaceBase(BaseModel):
    name: str
    path: str

class WorkspaceCreate(WorkspaceBase):
    pass

class WorkspaceResponse(WorkspaceBase):
    id: int

    class Config:
        from_attributes = True

# Registered Workspace schemas
class RegisteredWorkspaceBase(BaseModel):
    team_id: int
    name: str
    repo_url: str

class RegisteredWorkspaceCreate(RegisteredWorkspaceBase):
    pass

class RegisteredWorkspaceResponse(RegisteredWorkspaceBase):
    id: int

    class Config:
        from_attributes = True

# User Settings schemas
class UserSettingBase(BaseModel):
    setting_key: str
    setting_value: str

class UserSettingCreate(UserSettingBase):
    pass

class UserSettingUpdate(UserSettingBase):
    pass

class CustomScriptFoldersSetting(UserSettingBase):
    setting_value: List[str]

class UserSettingResponse(UserSettingBase):
    id: int
    user_id: int

    class Config:
        from_attributes = True

# Presets schemas
# This represents a single parameter within a preset
class ParameterSchema(BaseModel):
    name: str
    type: str
    value: Any # Use Any to allow different types (string, number, boolean, etc.)
    description: Optional[str] = None
    group: Optional[str] = None
    options: Optional[List[str]] = None
    multiSelect: Optional[bool] = None
    requiresCompute: Optional[bool] = None
    suffix: Optional[str] = None
    min: Optional[float] = None
    max: Optional[float] = None
    step: Optional[float] = None
    pattern: Optional[str] = None
    required: Optional[bool] = None
    inputType: Optional[str] = None
    defaultValue: Optional[Any] = None

# This represents the structure of a single preset
class PresetSchema(BaseModel):
    name: str
    parameters: List[ParameterSchema]

# This is the request body for saving presets
class PresetRequest(BaseModel):
    scriptPath: str
    presets: List[PresetSchema]

# This is the response model for a single preset, including its ID and script_id
class PresetResponse(PresetSchema):
    id: int
    script_id: int # Assuming script_id is part of the response when fetching presets

    class Config:
        from_attributes = True

# Runs schemas
class RunBase(BaseModel):
    script_id: int
    timestamp: datetime
    status: str
    output: Optional[str] = None

class RunCreate(RunBase):
    pass

class RunResponse(RunBase):
    id: int

    class Config:
        from_attributes = True