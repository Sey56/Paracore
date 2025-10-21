from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Annotated
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone

from .database import get_db
from .models import User, TeamMembership, Role
from .config import settings

# --- Security & Dependencies ---

from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_PRIVATE_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    return encoded_jwt

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.JWT_PUBLIC_KEY, algorithms=[settings.JWT_ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(User).filter(User.email == email).first()
    if user is None:
        raise credentials_exception
    return user

CurrentUser = Annotated[User, Depends(get_current_user)]

def get_admin_for_team(team_id: int, current_user: CurrentUser, db: Session = Depends(get_db)) -> TeamMembership:
    membership = db.query(TeamMembership).filter(
        TeamMembership.team_id == team_id,
        TeamMembership.user_id == current_user.id
    ).first()

    if not membership or membership.role != Role.admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this resource."
        )
    return membership