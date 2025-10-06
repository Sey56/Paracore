import httpx
from contextlib import asynccontextmanager
from jose import jwt, JWTError
from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, Request, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer
from starlette.responses import RedirectResponse
from urllib.parse import urlencode
from sqlalchemy.orm import Session
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests
from typing import Optional

from .config import settings
from .database import Base, engine, get_db
from .models import User
from .schemas import UserOut, GoogleAuthCodeRequest, Token 
from .config import settings

print(f"--- DATABASE_URL BEING USED: {settings.DATABASE_URL} ---")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

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

@asynccontextmanager
async def lifespan(app: FastAPI):
    # on startup
    Base.metadata.create_all(bind=engine)
    yield
    # on shutdown
    pass

app = FastAPI(
    title="RAP Authentication Server",
    description="Handles user authentication and issues JWTs.",
    version="0.1.0",
    lifespan=lifespan
)

origins = [
    "http://localhost:5173",
    "https://tauri.localhost",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"status": "ok", "service": "rap-auth-server"}

@app.get("/debug-cors")
async def debug_cors(request: Request):
    print(f"/debug-cors endpoint hit. Request Headers: {request.headers}")
    return {"status": "ok", "message": "CORS debug endpoint", "request_headers": dict(request.headers)}

@app.post("/auth/verify-google-code", response_model=Token)
async def verify_google_code(request: GoogleAuthCodeRequest, db: Session = Depends(get_db)):
    token_url = "https://oauth2.googleapis.com/token"
    token_params = {
        "code": request.code,
        "client_id": settings.GOOGLE_CLIENT_ID_DESKTOP,
        "client_secret": settings.GOOGLE_CLIENT_SECRET_DESKTOP,
        "redirect_uri": request.redirect_uri,
        "grant_type": "authorization_code",
    }

    async with httpx.AsyncClient() as client:
        token_response = await client.post(token_url, data=token_params)
        try:
            token_response.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to exchange authorization code with Google: {e.response.text}")
        token_data = token_response.json()

    id_token = token_data.get("id_token")
    if not id_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="ID token not found in Google's response.")

    try:
        id_info = google_id_token.verify_oauth2_token(
            id_token, requests.Request(), settings.GOOGLE_CLIENT_ID_DESKTOP)

        email = id_info.get("email")
        name = id_info.get("name")
        picture_url = id_info.get("picture")

        if not email:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email not found in Google token.")

        user = db.query(User).filter(User.email == email).first()
        if not user:
            user = User(email=email, name=name, picture_url=picture_url)
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            user.last_login_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(user)

        access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        cloud_jwt = create_access_token(
            data={"sub": user.email, "user_id": str(user.id)},
            expires_delta=access_token_expires
        )

        return {"user": UserOut.model_validate(user), "access_token": cloud_jwt, "token_type": "bearer"}

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Invalid Google ID token: {e}")
