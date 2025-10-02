import os
from dotenv import load_dotenv

load_dotenv() # Load environment variables from .env file

class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{os.path.dirname(__file__)}/rap_local.db")
    SECRET_KEY: str = "your-very-secret-key-here" # Hardcoded for debugging
    ALGORITHM: str = "RS256" # For OAuth2PasswordBearer, changed from RS256
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "RS256") # For JWT creation, changed from RS256
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 480)) # 8 hours
    AUTH_SERVER_URL: str = os.getenv("AUTH_SERVER_URL", "http://localhost:8001")

settings = Settings()
