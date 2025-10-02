from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent

def _read_key_file(file_name: str) -> str:
    """Helper to read key files."""
    path = BASE_DIR / file_name
    if not path.exists():
        raise FileNotFoundError(f"Key file not found: {path}. Please run 'python generate_keys.py'.")
    return path.read_text()

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

    # JWT Keys loaded from files
    JWT_PRIVATE_KEY: str = _read_key_file("jwt_private.pem")
    JWT_PUBLIC_KEY: str = _read_key_file("jwt_public.pem")

settings = Settings()
