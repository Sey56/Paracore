import os
from dotenv import load_dotenv

load_dotenv() # Load environment variables from .env file

# --- Function to read the public key from file ---
def load_public_key():
    try:
        # Try to get from env var first
        key_path = os.getenv("JWT_PUBLIC_KEY_PATH")
        
        # If not set, look in the sibling directory (standard dev layout)
        if not key_path:
             # Go up two levels from config.py: server -> rap-server -> Paracore
             base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
             key_path = os.path.join(base_dir, "rap-auth-server", "server", "jwt_public.pem")
             
        if not os.path.exists(key_path):
            print(f"!!! WARNING: JWT Public Key not found at: {key_path}")
            return None

        with open(key_path, 'r') as f:
            return f.read()
    except Exception as e:
        print(f"!!! CRITICAL: Could not load JWT public key from file: {e}")
        return None

from dotenv import load_dotenv

load_dotenv()

class Settings:
    db_path = os.getenv("RAP_DATABASE_PATH", f"{os.path.dirname(__file__)}/rap_local.db")
    # Replace backslashes with forward slashes for SQLAlchemy URL compatibility
    db_path = db_path.replace("\\", "/")
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{db_path}")
    SECRET_KEY: str = "your-very-secret-key-here"
    ALGORITHM: str = "RS256"
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "RS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 480)) # 8 hours
    AUTH_SERVER_URL: str = os.getenv("AUTH_SERVER_URL", "http://localhost:8001")
    
    # Load the public key directly from the file
    JWT_PUBLIC_KEY: str = load_public_key()

settings = Settings()