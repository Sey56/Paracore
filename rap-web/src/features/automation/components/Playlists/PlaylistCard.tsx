import React from 'react';
import { Playlist } from '@/types/playlistModel';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar, faListUl } from '@fortawesome/free-solid-svg-icons';
import { Tooltip } from '@/components/common/Tooltip';

interface PlaylistCardProps {
    playlist: Playlist;
    onSelect: () => void;
    onToggleFavorite: (p: Playlist) => void;
    isHighlighted: boolean;
}

export const PlaylistCard: React.FC<PlaylistCardProps> = ({
    playlist,
    onSelect,
    onToggleFavorite,
    isHighlighted
}) => {
    return (
        <div
            className={`w-full rounded-xl transition-all duration-[400ms] cursor-pointer flex flex-col relative group
                ${isHighlighted
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-[#3b82f6] border shadow-[inset_0_0_0_1px_#3b82f6,0_4px_6px_-1px_rgba(0,0,0,0.1)] dark:shadow-[inset_0_0_0_1px_#3b82f6,0_10px_15px_-3px_rgba(0,0,0,0.3)]'
                    : 'bg-[var(--bg-card)] border border-[var(--border-main)] shadow-sm hover:border-[rgba(59,130,246,0.3)] hover:-translate-y-1 hover:shadow-[0_15px_30px_-10px_rgba(0,0,0,0.1)] dark:border-[rgba(255,255,255,0.05)] dark:hover:border-[rgba(59,130,246,0.4)] dark:hover:shadow-[0_20px_40px_-10px_rgba(0,0,0,0.3)]'
                }
            `}
            onClick={onSelect}
        >
            {/* Card Body */}
            <div className="p-4 flex-grow flex flex-col">
                {/* Header Row — icon + title + star */}
                <div className="flex items-start gap-2 mb-2 w-full">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                            <FontAwesomeIcon
                                icon={faListUl}
                                className="shrink-0 text-slate-400 dark:text-slate-500"
                                style={{ fontSize: '0.9rem' }}
                            />
                            <div className="flex-1 min-w-0 overflow-hidden">
                                <Tooltip text={playlist.name} position="bottom">
                                    <h3 className={`font-medium truncate ${isHighlighted ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'} group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors duration-200 text-lg`}>
                                        {playlist.name}
                                    </h3>
                                </Tooltip>
                            </div>
                        </div>
                    </div>

                    {/* Star */}
                    <Tooltip text={playlist.isFavorite ? "Unfavorite" : "Favorite"} position="bottom">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleFavorite(playlist);
                            }}
                            className={`shrink-0 ${playlist.isFavorite
                                ? 'text-yellow-400 hover:text-yellow-500'
                                : `text-gray-400 dark:text-gray-500 hover:text-yellow-400 dark:hover:text-yellow-300 ${isHighlighted ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-200`
                            }`}
                        >
                            <FontAwesomeIcon icon={faStar} />
                        </button>
                    </Tooltip>
                </div>

                {/* Description */}
                <p className="text-gray-600 dark:text-gray-300 text-sm mb-4 flex-grow line-clamp-2">
                    {playlist.description || "No description provided."}
                </p>

                {/* Footer — step count */}
                <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 mt-auto">
                    <span>{playlist.items.length} {playlist.items.length === 1 ? 'step' : 'steps'}</span>
                </div>
            </div>
        </div>
    );
};
