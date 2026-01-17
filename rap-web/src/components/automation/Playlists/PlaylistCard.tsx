import React, { useState, useEffect } from 'react';
import { Playlist } from '@/types/playlistModel';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faTrash, faEllipsisV, faStar } from '@fortawesome/free-solid-svg-icons';

interface PlaylistCardProps {
    playlist: Playlist;
    onSelect: (p: Playlist) => void;
    onRun: (p: Playlist) => void;
    onDelete: (p: Playlist) => void;
    onToggleFavorite: (p: Playlist) => void;
    selected: boolean;
}

export const PlaylistCard: React.FC<PlaylistCardProps> = ({
    playlist,
    onSelect,
    onRun,
    onDelete,
    onToggleFavorite,
    selected
}) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = () => setIsMenuOpen(false);
        if (isMenuOpen) document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [isMenuOpen]);

    return (
        <div
            className={`bg-white dark:bg-gray-800 p-4 rounded-lg shadow border cursor-pointer transition-all relative group
                ${selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 dark:border-gray-700 hover:shadow-md'}
            `}
            onClick={() => onSelect(playlist)}
        >
            <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-lg text-gray-800 dark:text-gray-200 pr-16 truncate w-full" title={playlist.name}>
                    {playlist.name}
                </h3>
                <div className="flex space-x-1 absolute right-2 top-4">
                    {/* Favorite Button */}
                    <button
                        className={`p-1 w-6 h-6 flex items-center justify-center rounded-full transition-colors ${playlist.isFavorite ? 'text-yellow-400 hover:text-yellow-500' : 'text-gray-300 hover:text-yellow-400 opacity-0 group-hover:opacity-100'}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavorite(playlist);
                        }}
                        title={playlist.isFavorite ? "Unfavorite" : "Favorite"}
                    >
                        <FontAwesomeIcon icon={faStar} />
                    </button>

                    <button
                        className="text-gray-400 hover:text-blue-500 p-1 w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsMenuOpen(!isMenuOpen);
                        }}
                        title="Options"
                    >
                        <FontAwesomeIcon icon={faEllipsisV} />
                    </button>

                    {isMenuOpen && (
                        <div className="absolute right-0 top-full mt-1 w-32 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-50 py-1">
                            <button
                                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete(playlist);
                                    setIsMenuOpen(false);
                                }}
                            >
                                <FontAwesomeIcon icon={faTrash} className="mr-2 text-xs" />
                                Delete
                            </button>
                        </div>
                    )}

                    <button
                        className="text-green-500 hover:text-green-600 p-1 w-6 h-6 flex items-center justify-center rounded-full hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                            e.stopPropagation();
                            onRun(playlist);
                        }}
                        title="Run Playlist"
                    >
                        <FontAwesomeIcon icon={faPlay} />
                    </button>
                </div>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2 h-10">
                {playlist.description || "No description provided."}
            </p>
            <div className="text-xs text-gray-500 dark:text-gray-400">
                {playlist.items.length} steps
            </div>
        </div>
    );
};
