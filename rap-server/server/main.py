import logging
import os
import sys

from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Silence Google SDK warning by favoring GOOGLE_API_KEY if both are present
if os.environ.get("GOOGLE_API_KEY") and os.environ.get("GEMINI_API_KEY"):
    os.environ.pop("GEMINI_API_KEY", None)

# Allow running main.py directly from within the 'server' directory
if __name__ == "__main__" and __package__ is None:
    sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Resolve the SHARED MCP CORE — the gRPC client layer (`grpc_client` + the proto stubs).
#
# ⚠ rap-server is a plain CLIENT of the same gRPC service the MCPs talk to:
#     rap-web (Tauri) → HTTP → rap-server → gRPC :50051 → Paracore.Server → Revit
#   `Paracore.Server` is the in-Revit sidecar; the MCPs are clients of it too, and neither
#   needs the other. So this sidecar needs only the gRPC layer of the core — never
#   `mcp_core/`, which is the MCP's own tools, prompts and skills.
# ⚠ Until 2026-10-13 this pointed at `paracore-gen`, which owned the core. It does not any
#   more — the core lives in the ENGINE repo (see mcp/mcp_core/domain.py).
#
# Appended (not inserted) so local modules (utils, config) take precedence.
# Dev:    Paracore/paracore/mcp       (walk up from paracore/rap-server/server/)
# Frozen: server-release/paracore/mcp (staged by build-frontend.ps1, same relative shape)
_here = os.path.dirname(os.path.abspath(__file__))
_core = None
_dir = _here
for _ in range(6):
    if os.path.isfile(os.path.join(_dir, "paracore", "mcp", "grpc_client.py")):
        _core = os.path.join(_dir, "paracore", "mcp")
        break
    _up = os.path.dirname(_dir)
    if _up == _dir:
        break
    _dir = _up
if _core is None:
    raise RuntimeError(
        "Paracore shared core not found: no `paracore/mcp/grpc_client.py` above "
        f"{_here}. The core lives in the ENGINE repo, so the repos must be SIBLING "
        "checkouts under one parent directory."
    )
sys.path.append(_core)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Original imports start here
from contextlib import asynccontextmanager

from database_config import Base, engine
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api import (
    auth_router,
    playlist_router,
    presets_router,
    runs_router,
    script_execution_router,
    script_management_router,
    status_router,
    user_settings_router,
    tool_builder_router,
    query_router,
    sync_router,
)


# Configure Uvicorn logging to suppress access logs
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

from grpc_client import close_channel, init_channel
import grpc
from utils import format_grpc_error
from fastapi import Request
from fastapi.responses import JSONResponse


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

    close_channel()

app = FastAPI(lifespan=lifespan)

@app.exception_handler(grpc.RpcError)
async def grpc_exception_handler(request: Request, exc: grpc.RpcError):
    return JSONResponse(
        status_code=500,
        content={"detail": format_grpc_error(exc)},
    )

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
app.include_router(auth_router.router)
app.include_router(user_settings_router.router)
app.include_router(tool_builder_router.router)
app.include_router(query_router.router)
app.include_router(sync_router.router)

app.include_router(playlist_router.router, prefix="/playlists", tags=["Playlists"])

@app.get("/")
def read_root():
    return {"message": "Welcome to the Paracore Local Server"}
