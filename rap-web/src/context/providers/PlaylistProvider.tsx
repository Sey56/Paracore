import React, { useState, useCallback, useMemo } from 'react';
import { PlaylistContext, PlaylistContextProps } from './PlaylistContext';
import { Playlist } from '@/types/playlistModel';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';

export const PlaylistProvider = ({ children }: { children: React.ReactNode }) => {
    const { showNotification } = useNotifications();

    const [playlists, setPlaylists] = useState<Playlist[]>([]);
    const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const loadPlaylists = useCallback(async (folderPath: string) => {
        if (!folderPath) return;

        setIsLoading(true);
        try {
            // The backend expects a list of paths to scan
            const response = await api.post('/playlists/list', { paths: [folderPath] });
            setPlaylists(response.data);
        } catch (error) {
            console.error("Failed to load playlists:", error);
            showNotification("Failed to load playlists.", "error");
            setPlaylists([]);
        } finally {
            setIsLoading(false);
        }
    }, [showNotification]);

    const createPlaylist = useCallback(async (name: string, folderPath: string): Promise<Playlist | undefined> => {
        setIsLoading(true);
        try {
            const newPlaylist: Playlist = {
                name,
                description: "",
                items: []
            };

            const response = await api.post('/playlists/save', { playlist: newPlaylist, folderPath });
            const savedPlaylist = response.data;

            setPlaylists(prev => [...prev, savedPlaylist]);
            showNotification(`Playlist '${name}' created successfully`, "success");
            return savedPlaylist;
        } catch (error) {
            console.error("Failed to create playlist:", error);
            showNotification("Failed to create playlist.", "error");
            return undefined;
        } finally {
            setIsLoading(false);
        }
    }, [showNotification]);

    const updatePlaylist = useCallback(async (playlist: Playlist): Promise<boolean> => {
        setIsLoading(true);
        try {
            if (!playlist.filePath) {
                showNotification("Playlist has no file path, cannot update.", "error");
                return false;
            }
            // We use the same /save endpoint, but we pass the folder containing the file
            // Actually, my backend logical split was: folderPath + playlist object. 
            // If I have filePath, I can derive folderPath. 
            // Let's check backend implementation.
            // Backend takes { playlist: ..., folderPath: ... } and constructs path as folderPath/filename.
            // If checking backend code: `full_path = os.path.join(req.folderPath, filename)`

            // So if I want to update, I need to pass the FOLDER it is in.
            // I can extract directory from filePath if available.
            // However, JS doesn't have path.dirname easily without node.
            // But filePath comes from backend which is absolute.
            // Let's assume for now I can pass the folder path if I know it, OR I can modify backend to accept absolute `filePath` inside playlist object as override.

            // Let's just modify the backend to be smarter or extract folderPath from filePath.
            // Wait, I can just substring string manipulation.
            const folderPath = playlist.filePath.substring(0, playlist.filePath.lastIndexOf('\\')) || playlist.filePath.substring(0, playlist.filePath.lastIndexOf('/'));

            await api.post('/playlists/save', { playlist, folderPath });

            setPlaylists(prev => prev.map(p => p.filePath === playlist.filePath ? playlist : p));
            showNotification(`Playlist '${playlist.name}' updated successfully`, "success");
            return true;
        } catch (error) {
            console.error("Failed to update playlist:", error);
            showNotification("Failed to update playlist.", "error");
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [showNotification]);

    const runPlaylist = useCallback(async (playlist: Playlist) => {
        // Placeholder for runner logic
        showNotification(`Running playlist: ${playlist.name}`, "info");
        // TODO: Orchestrate script execution here using ScriptContext
    }, [showNotification]);

    const contextValue: PlaylistContextProps = useMemo(() => ({
        playlists,
        selectedPlaylist,
        isLoading,
        selectPlaylist: setSelectedPlaylist,
        loadPlaylists,
        createPlaylist,
        updatePlaylist,
        runPlaylist
    }), [playlists, selectedPlaylist, isLoading, loadPlaylists, createPlaylist, updatePlaylist, runPlaylist]);

    return (
        <PlaylistContext.Provider value={contextValue}>
            {children}
        </PlaylistContext.Provider>
    );
};
