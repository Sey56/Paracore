import os
import json
import logging
from typing import List, Dict, Optional, Any
from pydantic import BaseModel

logger = logging.getLogger(__name__)

class PlaylistItem(BaseModel):
    scriptPath: str
    parameters: Dict[str, Any] = {}

class Playlist(BaseModel):
    name: str
    description: str
    items: List[PlaylistItem]
    filePath: Optional[str] = None # Absolute path on disk
    isFavorite: bool = False
    lastExecutionResults: Optional[Dict[str, Any]] = None

class PlaylistService:
    def __init__(self):
        pass

    def scan_playlists(self, root_paths: List[str]) -> List[Playlist]:
        """
        Scans the given root paths (workspaces/local folders) for .playlist.json files.
        """
        playlists = []
        for root_path in root_paths:
            if not os.path.exists(root_path):
                continue

            for root, dirs, files in os.walk(root_path):
                # Skip .git and node_modules for performance
                if '.git' in dirs: dirs.remove('.git')
                if 'node_modules' in dirs: dirs.remove('node_modules')
                
                for file in files:
                    if file.endswith('.playlist.json'):
                        full_path = os.path.join(root, file)
                        try:
                            playlist = self._load_playlist(full_path)
                            if playlist:
                                playlists.append(playlist)
                        except Exception as e:
                            logger.error(f"Failed to load playlist {full_path}: {e}")
        
        return playlists

    def _load_playlist(self, file_path: str) -> Optional[Playlist]:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Basic validation
            if 'name' not in data or 'items' not in data:
                logger.warning(f"Invalid playlist structure in {file_path}")
                return None

            items = []
            for item_data in data.get('items', []):
                items.append(PlaylistItem(
                    scriptPath=item_data.get('scriptPath', ''),
                    parameters=item_data.get('parameters', {})
                ))

            return Playlist(
                name=data.get('name', 'Untitled Playlist'),
                description=data.get('description', ''),
                items=items,
                filePath=file_path,
                isFavorite=data.get('isFavorite', False),
                lastExecutionResults=data.get('lastExecutionResults')
            )
        except Exception as e:
            logger.error(f"Error parsing playlist {file_path}: {e}")
            return None

    def save_playlist(self, file_path: str, playlist: Playlist) -> bool:
        try:
            data = {
                "name": playlist.name,
                "description": playlist.description,
                "items": [item.dict() for item in playlist.items],
                "isFavorite": playlist.isFavorite,
                "lastExecutionResults": playlist.lastExecutionResults
            }
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2)
            return True
        except Exception as e:
            logger.error(f"Failed to save playlist to {file_path}: {e}")
            return False

    def delete_playlist(self, file_path: str) -> bool:
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                return True
            else:
                logger.warning(f"Playlist file not found for deletion: {file_path}")
                return False
        except Exception as e:
            logger.error(f"Failed to delete playlist at {file_path}: {e}")
            return False

# Global instance
playlist_service = PlaylistService()
