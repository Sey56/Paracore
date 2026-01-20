import React, { useEffect, useState } from 'react';
import { usePlaylist } from '@/hooks/usePlaylist';
import { useUI } from '@/hooks/useUI';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSync, faPlay, faPlus, faTrash, faEllipsisV, faStar } from '@fortawesome/free-solid-svg-icons';
import { NewPlaylistModal } from './NewPlaylistModal';
import { DeletePlaylistModal } from './DeletePlaylistModal';
import { PlaylistEditor } from './PlaylistEditor';
import { PlaylistCard } from './PlaylistCard';
import { Playlist } from '@/types/playlistModel';

export const PlaylistsTab: React.FC = () => {
    const { playlists, isLoading, loadPlaylists, selectPlaylist, selectedPlaylist, runPlaylist, createPlaylist, deletePlaylist, updatePlaylist } = usePlaylist();
    const { activeScriptSource } = useUI();
    const [isNewPlaylistModalOpen, setIsNewPlaylistModalOpen] = useState(false);

    // Deletion State
    const [playlistToDelete, setPlaylistToDelete] = useState<Playlist | null>(null);
    const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

    useEffect(() => {
        // Auto-load playlists when the source changes
        if (activeScriptSource) {
            if (activeScriptSource.type === 'local' || activeScriptSource.type === 'workspace') {
                loadPlaylists(activeScriptSource.path);
            }
        }
    }, [activeScriptSource, loadPlaylists]);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (activeMenuId) {
                // If the click is inside a dropdown or button, we might want to ignore?
                // But generally clicking anywhere else should close it.
                // We rely on stopPropagation in usage to keep it open.
                setActiveMenuId(null);
            }
        };

        if (activeMenuId) {
            document.addEventListener('click', handleClickOutside);
        }
        return () => {
            document.removeEventListener('click', handleClickOutside);
        };
    }, [activeMenuId]);

    const handleRefresh = () => {
        if (activeScriptSource && 'path' in activeScriptSource) {
            loadPlaylists(activeScriptSource.path);
        }
    };

    const handleCreatePlaylist = async (name: string, description: string) => {
        if (activeScriptSource && 'path' in activeScriptSource) {
            await createPlaylist(name, description, activeScriptSource.path);
        }
    };

    const confirmDelete = async () => {
        if (playlistToDelete) {
            await deletePlaylist(playlistToDelete);
            setPlaylistToDelete(null);
        }
    };

    const toggleFavorite = async (playlist: Playlist) => {
        // Optimistic update? updatePlaylist handles it
        // We need to re-pass the whole object with the flipped boolean
        await updatePlaylist({
            ...playlist,
            isFavorite: !playlist.isFavorite
        });
    };

    if (selectedPlaylist) {
        return (
            <PlaylistEditor
                playlist={selectedPlaylist}
                onBack={() => selectPlaylist(null)}
            />
        );
    }

    return (
        <div className="p-4 flex h-full flex-col">
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center space-x-3">
                    <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                        Playlists
                    </h1>
                </div>
                <div className="flex items-center space-x-2">
                    <button
                        onClick={handleRefresh}
                        className="p-1 px-2 text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 rounded-md hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors"
                        title="Refresh Playlists"
                    >
                        <FontAwesomeIcon icon={faSync} spin={isLoading} />
                    </button>
                    <div className="relative">
                        <button
                            className="bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 py-1 px-3 rounded-md font-bold flex items-center border border-blue-200 dark:border-blue-800 transition-all active:scale-95 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            onClick={() => setIsNewPlaylistModalOpen(true)}
                            disabled={!activeScriptSource || !('path' in activeScriptSource)}
                        >
                            <FontAwesomeIcon icon={faPlus} className="mr-2" />
                            New Playlist
                        </button>
                    </div>
                </div>
            </div>

            <NewPlaylistModal
                isOpen={isNewPlaylistModalOpen}
                onClose={() => setIsNewPlaylistModalOpen(false)}
                onSubmit={handleCreatePlaylist}
            />

            <DeletePlaylistModal
                isOpen={!!playlistToDelete}
                onClose={() => setPlaylistToDelete(null)}
                onConfirm={confirmDelete}
                playlistName={playlistToDelete?.name || ''}
            />

            {/* Playlists Grid */}
            <div className="flex-1 overflow-y-auto p-2">
                {playlists.length === 0 ? (
                    <div className="text-center text-gray-500 mt-10">
                        No playlists found. Create one to get started!
                    </div>
                ) : (
                    <div className="space-y-8">
                        {/* Favorites Section */}
                        {playlists.some(p => p.isFavorite) && (
                            <div>
                                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 px-1">
                                    Favorites
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {playlists.filter(p => p.isFavorite).map((playlist, index) => (
                                        <PlaylistCard
                                            key={`fav-${playlist.filePath || index}`}
                                            playlist={playlist}
                                            selected={false}
                                            onSelect={selectPlaylist}
                                            onRun={runPlaylist}
                                            onDelete={setPlaylistToDelete}
                                            onToggleFavorite={toggleFavorite}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* All Playlists */}
                        <div>
                            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 px-1">
                                {playlists.some(p => p.isFavorite) ? 'Other Playlists' : 'All Playlists'}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {playlists.filter(p => !p.isFavorite).map((playlist, index) => (
                                    <PlaylistCard
                                        key={`all-${playlist.filePath || index}`}
                                        playlist={playlist}
                                        selected={false}
                                        onSelect={selectPlaylist}
                                        onRun={runPlaylist}
                                        onDelete={setPlaylistToDelete}
                                        onToggleFavorite={toggleFavorite}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
