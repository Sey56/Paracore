# config.py

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent

class Settings(BaseSettings):
    # ✅ Load from .env file inside the container
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # 🌐 Frontend
    FRONTEND_URL: str = "tauri://localhost"
    
    # 🔐 Google OAuth2
    GOOGLE_CLIENT_ID_WEB: str
    GOOGLE_CLIENT_SECRET_WEB: str
    GOOGLE_CLIENT_ID_DESKTOP: str
    GOOGLE_CLIENT_SECRET_DESKTOP: str
    REDIRECT_URI: str = "http://127.0.0.1:8001/auth/callback"

    # 🗄️ Database
    DATABASE_URL: str

    # 🔑 JWT Settings
    JWT_ALGORITHM: str = "RS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8  # 8 hours session

    JWT_PRIVATE_KEY: str
    JWT_PUBLIC_KEY: str

settings = Settings()