"""IDE session tracking endpoints — used by the frontend to detect VS Code editing."""
from fastapi import APIRouter
from ide_manager import ACTIVE_IDE_SESSIONS, remove_active_ide_session, cleanup_stale_sessions
from pydantic import BaseModel

router = APIRouter()


class TeamSourcePath(BaseModel):
    path: str


@router.get("/api/sync/active-sessions", tags=["IDE Sessions"])
async def get_active_ide_sessions():
    """Returns which project folders are currently open in VS Code with file watchers."""
    cleanup_stale_sessions()
    return ACTIVE_IDE_SESSIONS


@router.post("/api/sync/clear-session", tags=["IDE Sessions"])
async def clear_ide_session_endpoint(req: TeamSourcePath):
    """Manually removes an active IDE session entry."""
    remove_active_ide_session(req.path)
    return {"message": "Session cleared."}
