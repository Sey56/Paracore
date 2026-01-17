import React, { useEffect, useState } from 'react';
import { usePlaylist } from '@/hooks/usePlaylist';
import { useUI } from '@/hooks/useUI';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSync, faPlay, faPlus } from '@fortawesome/free-solid-svg-icons';
import { NewPlaylistModal } from './NewPlaylistModal';
import { PlaylistEditor } from './PlaylistEditor';

export const PlaylistsTab: React.FC = () => {
    const { playlists, isLoading, loadPlaylists, selectPlaylist, selectedPlaylist, runPlaylist, createPlaylist } = usePlaylist();
    const { activeScriptSource } = useUI();
    const [isNewPlaylistModalOpen, setIsNewPlaylistModalOpen] = useState(false);

    useEffect(() => {
        // Auto-load playlists when the source changes
        if (activeScriptSource) {
            if (activeScriptSource.type === 'local' || activeScriptSource.type === 'workspace') {
                loadPlaylists(activeScriptSource.path);
            }
        }
    }, [activeScriptSource, loadPlaylists]);

    const handleRefresh = () => {
        if (activeScriptSource && 'path' in activeScriptSource) {
            loadPlaylists(activeScriptSource.path);
        }
    };

    const handleCreatePlaylist = async (name: string) => {
        if (activeScriptSource && 'path' in activeScriptSource) {
            await createPlaylist(name, activeScriptSource.path);
        }
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

            <div className="flex-1 overflow-y-auto">
                {playlists.length === 0 ? (
                    <div className="text-center text-gray-500 mt-10">
                        <p>No playlists found in the current workspace.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {playlists.map((playlist, index) => (
                            <div
                                key={index}
                                className={`bg-white dark:bg-gray-800 p-4 rounded-lg shadow border cursor-pointer transition-all
                  ${selectedPlaylist === playlist ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 dark:border-gray-700 hover:shadow-md'}
                `}
                                onClick={() => selectPlaylist(playlist)}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="font-semibold text-lg text-gray-800 dark:text-gray-200">{playlist.name}</h3>
                                    <button
                                        className="text-green-500 hover:text-green-600 p-1"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            runPlaylist(playlist);
                                        }}
                                        title="Run Playlist"
                                    >
                                        <FontAwesomeIcon icon={faPlay} />
                                    </button>
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                                    {playlist.description || "No description provided."}
                                </p>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {playlist.items.length} steps
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
