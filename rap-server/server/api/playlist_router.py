from fastapi import APIRouter, HTTPException, Body
from typing import List, Optional
from pydantic import BaseModel
from services.playlist_service import playlist_service, Playlist

router = APIRouter()

class ScanRequest(BaseModel):
    paths: List[str]

@router.post("/list", response_model=List[Playlist])
async def list_playlists(scan_req: ScanRequest):
    """
    Scans the provided paths for playlists.
    """
    return playlist_service.scan_playlists(scan_req.paths)

class SavePlaylistRequest(BaseModel):
    playlist: Playlist
    folderPath: str

@router.post("/save")
async def save_playlist(req: SavePlaylistRequest):
    """
    Saves a playlist to a file. Generates filename from playlist name.
    """
    import os
    import re
    
    # Sanitize name for filename
    safe_name = re.sub(r'[^a-zA-Z0-9_\-]', '_', req.playlist.name)
    filename = f"{safe_name}.playlist.json"
    full_path = os.path.join(req.folderPath, filename)
    
    success = playlist_service.save_playlist(full_path, req.playlist)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to save playlist to disk.")
    
    # Update the playlist object with the new file path before returning
    req.playlist.filePath = full_path
    return req.playlist
