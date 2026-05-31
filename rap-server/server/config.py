import os
import httpx
from dotenv import load_dotenv

load_dotenv() # Load environment variables from .env file

# --- Function to read the public key ---
def load_public_key():
    # 1. Try Local File System First
    try:
        key_path = os.getenv("JWT_PUBLIC_KEY_PATH")
        if not key_path:
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

        if key_path and os.path.exists(key_path):
            with open(key_path, 'r') as f:
                return f.read()
    except Exception as e:
        print(f"--- Local key load skipped/failed: {e}")

    # 2. Try Remote Fetch from Auth Server
    auth_url = os.getenv("AUTH_SERVER_URL", "http://localhost:8001")
    try:
        print(f"--- Attempting to fetch public key from {auth_url}/auth/public-key...")
        # We use a synchronous fetch here because this is called during module init
        with httpx.Client(timeout=5.0) as client:
            response = client.get(f"{auth_url}/auth/public-key")
            if response.status_code == 200:
                print("--- Successfully fetched public key from remote auth server.")
                return response.json().get("public_key")
    except Exception as e:
        print(f"!!! CRITICAL: Could not fetch public key from remote: {e}")

    print("!!! WARNING: JWT Public Key NOT LOADED. Authentication will fail.")
    return None

class Settings:
    db_path = os.getenv("RAP_DATABASE_PATH", f"{os.path.dirname(__file__)}/rap_local.db")
    # Replace backslashes with forward slashes for SQLAlchemy URL compatibility
    db_path = db_path.replace("\\", "/")
    DATABASE_URL: str = os.getenv("DATABASE_URL", f"sqlite:///{db_path}")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-only-fallback-key")
    ALGORITHM: str = "RS256"
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "RS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 43200)) # 30 days
    AUTH_SERVER_URL: str = os.getenv("AUTH_SERVER_URL", "http://localhost:8001")

    # Load the public key directly from the file
    JWT_PUBLIC_KEY: str = load_public_key()

settings = Settings()
