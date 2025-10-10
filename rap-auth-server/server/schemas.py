from datetime import datetime
from pydantic import BaseModel, EmailStr
from .models import Role

# Team Schemas
class TeamBase(BaseModel):
    name: str

class TeamCreate(TeamBase):
    pass

class TeamOut(TeamBase):
    id: int
    owner_id: int

    class Config:
        from_attributes = True

# TeamMembership Schemas
class TeamMembershipBase(BaseModel):
    role: Role

class TeamMembershipCreate(TeamMembershipBase):
    user_id: int
    team_id: int

class TeamMembershipOut(BaseModel):
    team_id: int
    team_name: str
    role: Role
    owner_id: int

    class Config:
        from_attributes = True

class TeamMemberOut(BaseModel):
    id: int
    name: str | None = None
    email: EmailStr
    role: Role

    class Config:
        from_attributes = True

class UpdateMemberRoleRequest(BaseModel):
    role: Role

class InviteUserRequest(BaseModel):
    email: EmailStr
    role: Role

# User Schemas
class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    pass

class UserOut(UserBase):
    id: int
    name: str | None = None
    picture_url: str | None = None
    created_at: datetime
    last_login_at: datetime | None = None
    is_active: bool
    memberships: list[TeamMembershipOut] = []

    class Config:
        from_attributes = True

# Token Schemas
class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut

class TokenData(BaseModel):
    email: EmailStr | None = None

# Google Auth Schemas
class GoogleToken(BaseModel):
    token: str

class GoogleAuthCodeRequest(BaseModel):
    code: str
    redirect_uri: str
