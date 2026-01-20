import sys
import os
import logging
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# This block allows running main.py directly from within the 'server' directory
# by adding the current directory to sys.path. This is a development workaround
# for relative imports when the module is not run as part of a package.
if __name__ == "__main__" and __package__ is None:
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Original imports start here
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from database_config import Base, engine

from api import script_execution_router, script_management_router, presets_router, runs_router, status_router, workspace_router, auth_router, user_settings_router, manifest_router, playlist_router

from agent import agent_router
from generation import router as generation_router

import models  # Ensure models are imported so that they are registered with SQLAlchemy

from config import settings

# Configure Uvicorn logging to suppress access logs
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

from agent.graph import close_app
from grpc_client import init_channel, close_channel

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
    
    yield
    
    # Shutdown events
    close_channel()
    await close_app()

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
app.include_router(generation_router)
app.include_router(playlist_router.router, prefix="/playlists", tags=["Playlists"])

@app.get("/")
def read_root():
    return {"message": "Welcome to the Paracore Local Server"}
