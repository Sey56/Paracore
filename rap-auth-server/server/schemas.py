from datetime import datetime
from pydantic import BaseModel, EmailStr

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

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserOut

class TokenData(BaseModel):
    email: EmailStr | None = None

class GoogleToken(BaseModel):
    token: str

class GoogleAuthCodeRequest(BaseModel):
    code: str
    redirect_uri: str