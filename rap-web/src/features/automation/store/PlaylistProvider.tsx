import React, { useState, useCallback, useMemo } from 'react';
import { PlaylistContext, PlaylistContextProps } from './PlaylistContext';
export { PlaylistContext };
export type { PlaylistContextProps };
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

    const createPlaylist = useCallback(async (name: string, description: string, folderPath: string): Promise<Playlist | undefined> => {
        setIsLoading(true);
        try {
            const newPlaylist: Playlist = {
                name,
                description,
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
                console.error('[updatePlaylist] playlist has no filePath — cannot save', playlist);
                showNotification("Playlist has no file path, cannot update.", "error");
                return false;
            }

            // Extract the parent directory from the playlist's absolute filePath.
            const lastBackslash = playlist.filePath.lastIndexOf('\\');
            const lastSlash = playlist.filePath.lastIndexOf('/');
            const lastSep = Math.max(lastBackslash, lastSlash);
            if (lastSep < 0) {
                console.error('[updatePlaylist] could not extract folder from filePath:', playlist.filePath);
                showNotification('Could not determine save location from file path.', 'error');
                return false;
            }
            const folderPath = playlist.filePath.substring(0, lastSep);

            console.log('[updatePlaylist] saving playlist', {
                name: playlist.name,
                filePath: playlist.filePath,
                folderPath,
                itemCount: playlist.items.length,
            });

            const response = await api.post('/playlists/save', { playlist, folderPath });
            // Use the backend response (which has the canonical filePath) to update state
            const saved: Playlist = response.data;

            console.log('[updatePlaylist] save succeeded, backend returned filePath:', saved.filePath);

            setPlaylists(prev => {
                const updated = prev.map(p => {
                    // Match by filePath first, then by name as fallback
                    if (p.filePath && saved.filePath && p.filePath === saved.filePath) return saved;
                    if (p.filePath && playlist.filePath && p.filePath === playlist.filePath) return saved;
                    if (!p.filePath && !saved.filePath && p.name === saved.name) return saved;
                    return p;
                });
                // If nothing was updated, the playlist might be new — add it
                const wasUpdated = updated.some(p =>
                    (p.filePath && saved.filePath && p.filePath === saved.filePath) ||
                    (p.name === saved.name && !p.filePath && !saved.filePath)
                );
                console.log('[updatePlaylist] playlists updated, wasFound:', wasUpdated, 'count:', updated.length);
                return wasUpdated ? updated : [...updated, saved];
            });

            // Keep selectedPlaylist in sync if it's the one being saved
            setSelectedPlaylist(prev => {
                if (!prev) return prev;
                if (prev.filePath && saved.filePath && prev.filePath === saved.filePath) return saved;
                if (prev.filePath && playlist.filePath && prev.filePath === playlist.filePath) return saved;
                if (prev.name === saved.name) return saved;
                return prev;
            });

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

    const deletePlaylist = useCallback(async (playlist: Playlist): Promise<boolean> => {
        if (!playlist.filePath) return false;

        setIsLoading(true);
        try {
            await api.post('/playlists/delete', { filePath: playlist.filePath });
            setPlaylists(prev => prev.filter(p => p.filePath !== playlist.filePath));

            if (selectedPlaylist && selectedPlaylist.filePath === playlist.filePath) {
                setSelectedPlaylist(null);
            }

            showNotification(`Playlist '${playlist.name}' deleted.`, "info");
            return true;
        } catch (error) {
            console.error("Failed to delete playlist:", error);
            showNotification("Failed to delete playlist.", "error");
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [selectedPlaylist, showNotification]);

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
        deletePlaylist,
        runPlaylist
    }), [playlists, selectedPlaylist, isLoading, loadPlaylists, createPlaylist, updatePlaylist, deletePlaylist, runPlaylist]);

    return (
        <PlaylistContext.Provider value={contextValue}>
            {children}
        </PlaylistContext.Provider>
    );
};
