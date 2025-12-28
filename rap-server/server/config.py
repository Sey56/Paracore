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
             # Look for the key in multiple probable locations relative to this config file
             # 1. "../../..." -> Standard Dev Layout (from rap-server/server -> Paracore root)
             # 2. "../..."   -> Installed/Bundled Layout (from server-modules/server -> server-modules root)
             current_dir = os.path.dirname(__file__)
             candidate_bases = [
                 os.path.join(current_dir, "..", ".."), # Dev
                 os.path.join(current_dir, ".."),       # Installed
                 current_dir                            # Fallback
             ]
             
             for base in candidate_bases:
                 potential_path = os.path.join(os.path.abspath(base), "rap-auth-server", "server", "jwt_public.pem")
                 if os.path.exists(potential_path):
                     key_path = potential_path
                     break
                     
        if not key_path or not os.path.exists(key_path):
            print(f"!!! WARNING: JWT Public Key not found. Checked relatives paths from {os.path.dirname(__file__)}")
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