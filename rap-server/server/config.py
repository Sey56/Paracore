import os
from dotenv import load_dotenv

load_dotenv() # Load environment variables from .env file

# --- Function to read the public key from file ---
def load_public_key():
    try:
        # Use a hardcoded absolute path for reliability
        key_path = r'C:\Users\seyou\RAP\rap-auth-server\server\jwt_public.pem'
        
        with open(key_path, 'r') as f:
            return f.read()
    except Exception as e:
        print(f"!!! CRITICAL: Could not load JWT public key from file: {e}")
        return None

class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{os.path.dirname(__file__)}/rap_local.db")
    SECRET_KEY: str = "your-very-secret-key-here"
    ALGORITHM: str = "RS256"
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "RS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 480)) # 8 hours
    AUTH_SERVER_URL: str = os.getenv("AUTH_SERVER_URL", "http://localhost:8001")
    
    # Load the public key directly from the file
    JWT_PUBLIC_KEY: str = load_public_key()

settings = Settings()