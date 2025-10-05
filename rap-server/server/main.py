import sys
import os

# This block allows running main.py directly from within the 'server' directory
# by adding the current directory to sys.path. This is a development workaround
# for relative imports when the module is not run as part of a package.
if __name__ == "__main__" and __package__ is None:
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Original imports start here
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from .database_config import Base, engine
from .api import script_execution_router, script_management_router, presets_router, runs_router, status_router, workspace_router, auth_router
from . import models  # Ensure models are imported so that they are registered with SQLAlchemy

from .config import settings

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Handles application startup events.
    On startup, it creates all database tables.
    """
    # Note: In a production environment with Alembic, you might remove this.
    Base.metadata.create_all(bind=engine)
    print("Database tables created (if not already existing).")
    yield

app = FastAPI(lifespan=lifespan)

# --- CORS Middleware ---
# In a production environment, you would want to restrict this to your actual frontend URL
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"], # Local development origins
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

@app.get("/")
def read_root():
    return {"message": "Welcome to the RAP Local Server"}
