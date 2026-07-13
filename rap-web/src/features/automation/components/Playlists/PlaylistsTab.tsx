import React, { useEffect, useState, useMemo } from 'react';
import { usePlaylist } from '../../index';
import { useUI } from '@/hooks/useUI';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSync, faPlus, faPlay, faListUl, faTrash, faSearch, faTimes } from '@fortawesome/free-solid-svg-icons';
import { NewPlaylistModal } from './NewPlaylistModal';
import { DeletePlaylistModal } from './DeletePlaylistModal';
import { PlaylistEditor } from './PlaylistEditor';
import { PlaylistCard } from './PlaylistCard';
import { Playlist } from '@/types/playlistModel';
import { Tooltip } from '@/components/common/Tooltip';

export const PlaylistsTab: React.FC = () => {
    const { playlists, isLoading, loadPlaylists, selectPlaylist, selectedPlaylist, runPlaylist, createPlaylist, deletePlaylist, updatePlaylist } = usePlaylist();
    const { activeScriptSource } = useUI();
    const [isNewPlaylistModalOpen, setIsNewPlaylistModalOpen] = useState(false);
    const [highlightedId, setHighlightedId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');

    // Deletion State
    const [playlistToDelete, setPlaylistToDelete] = useState<Playlist | null>(null);

    useEffect(() => {
        if (activeScriptSource) {
            if (activeScriptSource.type === 'local') {
                loadPlaylists(activeScriptSource.path);
            }
        }
    }, [activeScriptSource, loadPlaylists]);

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
        await updatePlaylist({
            ...playlist,
            isFavorite: !playlist.isFavorite
        });
    };

    // Find the highlighted playlist object for the toolbar
    const highlightedPlaylist = useMemo(() => {
        if (!highlightedId) return null;
        return playlists.find(p => (p.filePath || p.name) === highlightedId) || null;
    }, [highlightedId, playlists]);

    // Filter playlists by search query
    const filteredPlaylists = useMemo(() => {
        if (!searchQuery.trim()) return playlists;
        const q = searchQuery.toLowerCase();
        return playlists.filter(p =>
            p.name.toLowerCase().includes(q) ||
            (p.description && p.description.toLowerCase().includes(q))
        );
    }, [playlists, searchQuery]);

    // Clear highlight when filtered list changes and highlighted item is no longer visible
    useEffect(() => {
        if (highlightedId && !filteredPlaylists.find(p => (p.filePath || p.name) === highlightedId)) {
            setHighlightedId(null);
        }
    }, [filteredPlaylists, highlightedId]);

    if (selectedPlaylist) {
        return (
            <PlaylistEditor
                playlist={selectedPlaylist}
                onBack={() => selectPlaylist(null)}
            />
        );
    }

    const favorites = filteredPlaylists.filter(p => p.isFavorite);
    const others = filteredPlaylists.filter(p => !p.isFavorite);

    return (
        <div className="p-4 flex h-full flex-col">
            {/* Header Row */}
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center space-x-3">
                    <h1 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                        Playlists
                    </h1>
                </div>
                <div className="flex items-center space-x-2">
                    <Tooltip text="Refresh Playlists" position="bottom">
                        <button
                            onClick={handleRefresh}
                            className="p-1 px-2 text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400 rounded-md hover:bg-blue-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            <FontAwesomeIcon icon={faSync} spin={isLoading} />
                        </button>
                    </Tooltip>
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

            {/* Toolbar — search + contextual actions */}
            <div className="flex items-center gap-3 mb-4 shrink-0">
                {/* Search Box — grows to fill available space */}
                <div className="relative flex-1 min-w-0">
                    <FontAwesomeIcon
                        icon={faSearch}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 text-xs"
                    />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search playlists..."
                        className="w-full pl-9 pr-8 py-2 text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-blue-400 dark:focus:border-blue-500 focus:ring-1 focus:ring-blue-400/30 transition-all"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-0.5"
                        >
                            <FontAwesomeIcon icon={faTimes} className="text-xs" />
                        </button>
                    )}
                </div>

                {/* Contextual Actions — appear when a playlist is highlighted */}
                {highlightedPlaylist ? (
                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-200">
                        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 min-w-0">
                            <FontAwesomeIcon icon={faListUl} className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0" />
                            <Tooltip text={highlightedPlaylist.name} position="bottom" className="min-w-0">
                                <span className="text-xs font-medium text-slate-600 dark:text-slate-300 truncate block max-w-[160px]">
                                    {highlightedPlaylist.name}
                                </span>
                            </Tooltip>
                        </div>

                        <Tooltip text="Configure Steps" position="bottom">
                            <button
                                onClick={() => selectPlaylist(highlightedPlaylist)}
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-700 hover:text-blue-600 dark:hover:text-blue-400 transition-all"
                            >
                                <FontAwesomeIcon icon={faListUl} />
                                <span>Steps</span>
                            </button>
                        </Tooltip>

                        <Tooltip text="Run Playlist" position="bottom">
                            <button
                                onClick={() => runPlaylist(highlightedPlaylist)}
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-blue-500 hover:bg-blue-600 text-white shadow-sm hover:shadow-md transition-all active:scale-95"
                            >
                                <FontAwesomeIcon icon={faPlay} />
                                <span>Run</span>
                            </button>
                        </Tooltip>

                        <Tooltip text="Delete Playlist" position="bottom">
                            <button
                                onClick={() => {
                                    setPlaylistToDelete(highlightedPlaylist);
                                }}
                                className="flex items-center gap-1.5 px-2 py-2 text-xs font-medium rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                            >
                                <FontAwesomeIcon icon={faTrash} />
                            </button>
                        </Tooltip>

                    </div>
                ) : null}
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
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                {filteredPlaylists.length === 0 ? (
                    <div className="text-center text-gray-500 mt-10">
                        {searchQuery ? 'No playlists match your search.' : 'No playlists found. Create one to get started!'}
                    </div>
                ) : (
                    <div className="space-y-8">
                        {/* Favorites Section */}
                        {favorites.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 px-1">
                                    Favorites
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {favorites.map((playlist, index) => (
                                        <PlaylistCard
                                            key={`fav-${playlist.filePath || index}`}
                                            playlist={playlist}
                                            isHighlighted={highlightedId === (playlist.filePath || playlist.name)}
                                            onSelect={() => setHighlightedId(highlightedId === (playlist.filePath || playlist.name) ? null : (playlist.filePath || playlist.name))}
                                            onToggleFavorite={toggleFavorite}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* All Playlists */}
                        {others.length > 0 && (
                            <div>
                                <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 px-1">
                                    {favorites.length > 0 ? 'Other Playlists' : 'All Playlists'}
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {others.map((playlist, index) => (
                                        <PlaylistCard
                                            key={`all-${playlist.filePath || index}`}
                                            playlist={playlist}
                                            isHighlighted={highlightedId === (playlist.filePath || playlist.name)}
                                            onSelect={() => setHighlightedId(highlightedId === (playlist.filePath || playlist.name) ? null : (playlist.filePath || playlist.name))}
                                            onToggleFavorite={toggleFavorite}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
