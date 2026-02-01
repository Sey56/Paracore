import asyncio
import logging
import os
import sys

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Silence Google SDK warning by favoring GOOGLE_API_KEY if both are present
if os.environ.get("GOOGLE_API_KEY") and os.environ.get("GEMINI_API_KEY"):
    os.environ.pop("GEMINI_API_KEY", None)

# This block allows running main.py directly from within the 'server' directory
# by adding the current directory to sys.path. This is a development workaround
# for relative imports when the module is not run as part of a package.
if __name__ == "__main__" and __package__ is None:
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Original imports start here
from contextlib import asynccontextmanager

from database_config import Base, engine
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agent import agent_router
from api import (
    assist_router,
    auth_router,
    manifest_router,
    playlist_router,
    presets_router,
    runs_router,
    script_execution_router,
    script_management_router,
    status_router,
    user_settings_router,
    workspace_router,
    tool_builder_router,
)


# Configure Uvicorn logging to suppress access logs
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

from grpc_client import close_channel, init_channel


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Handles application startup events.
    On startup, it creates all database tables and initializes the gRPC channel.
    """
    # Note: In a production environment with Alembic, you might remove this.
    Base.metadata.create_all(bind=engine)

    # Initialize singleton gRPC channel
    init_channel()

# Start Phase 3: Git Sync Background Task
    from sync.git_sync_service import start_git_sync_loop
    app.state.git_sync_task = asyncio.create_task(start_git_sync_loop())

    yield

    # Shutdown events
    if hasattr(app.state, "git_sync_task"):
        logger.info("Stopping Git Sync Background Service...")
        app.state.git_sync_task.cancel()
        try:
            await app.state.git_sync_task
        except asyncio.CancelledError:
            pass

    close_channel()

app = FastAPI(lifespan=lifespan)

# --- CORS Middleware ---
# In a production environment, you would want to restrict this to your actual frontend URL
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174", "tauri://localhost", "https://tauri.localhost"], # Local development origins and Tauri app origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Include Routers ---

app.include_router(script_execution_router.router)
app.include_router(script_management_router.router)
app.include_router(presets_router.router)
app.include_router(runs_router.router)
app.include_router(status_router.router)
app.include_router(workspace_router.router)
app.include_router(auth_router.router)
app.include_router(user_settings_router.router)
app.include_router(agent_router.router)
app.include_router(manifest_router.router)
app.include_router(assist_router.router)
app.include_router(tool_builder_router.router)

app.include_router(playlist_router.router, prefix="/playlists", tags=["Playlists"])

@app.get("/")
def read_root():
    return {"message": "Welcome to the Paracore Local Server"}
