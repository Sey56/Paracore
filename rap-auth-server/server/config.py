# config.py

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# By default, pydantic-settings will load from environment variables.
# It will also automatically load from a `.env` file in the same directory if it exists.
# Environment variables will ALWAYS override values from a .env file.
# This is the ideal behavior for production (Railway) vs. local development.

class Settings(BaseSettings):
    # The `extra='ignore'` tells pydantic to ignore extra environment variables
    # that don't correspond to fields in this model.
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra='ignore')

    # 🌐 Frontend
    FRONTEND_URL: str = "tauri://localhost"
    
    # 🔐 Google OAuth2
    GOOGLE_CLIENT_ID_DESKTOP: str
    GOOGLE_CLIENT_SECRET_DESKTOP: str
    REDIRECT_URI: str = "http://127.0.0.1:8001/auth/callback"
    ALLOWED_EMAILS: str = "" # Comma-separated list of allowed emails. Empty means all are allowed.

    # 🗄️ Database
    DATABASE_URL: str

    # 🔑 JWT Settings
    JWT_ALGORITHM: str = "RS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days session

    JWT_PRIVATE_KEY: str
    JWT_PUBLIC_KEY: str

settings = Settings()
