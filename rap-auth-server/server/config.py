from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding='utf-8',
        extra='ignore'
    )

    # Frontend
    FRONTEND_URL: str = "tauri://localhost"

    # Google OAuth2
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str
    REDIRECT_URI: str = "http://127.0.0.1:8001/auth/callback"

    # Database
    DATABASE_URL: str = "postgresql://user:password@host:port/database_name" # Placeholder for PostgreSQL

    # JWT Settings
    JWT_ALGORITHM: str = "RS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # JWT Keys from environment
    JWT_PRIVATE_KEY: str
    JWT_PUBLIC_KEY: str

settings = Settings()
