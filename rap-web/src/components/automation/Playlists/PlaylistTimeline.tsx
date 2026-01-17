import React from 'react';
import { PlaylistItem } from '@/types/playlistModel';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash, faArrowUp, faArrowDown, faArrowLeft, faPlay, faSave } from '@fortawesome/free-solid-svg-icons';

interface PlaylistTimelineProps {
    items: PlaylistItem[];
    selectedIndex: number | null;
    onSelect: (index: number) => void;
    onReorder: (index: number, direction: 'up' | 'down') => void;
    onDelete: (index: number) => void;
    onAdd: () => void;
    // New Props for Header Area
    playlistName: string;
    onBack: () => void;
    onRun: () => void;
    onSave: () => void;
    isDirty: boolean;
}

export const PlaylistTimeline: React.FC<PlaylistTimelineProps> = ({
    items,
    selectedIndex,
    onSelect,
    onReorder,
    onDelete,
    onAdd,
    playlistName,
    onBack,
    onRun,
    onSave,
    isDirty
}) => {
    return (
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
            {/* Consolidated Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-20 shadow-sm">
                {/* Top Row: Back & Name */}
                <div className="flex items-center space-x-3 mb-4">
                    <button
                        onClick={onBack}
                        className="p-1.5 -ml-1.5 text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                        title="Back to Playlists"
                    >
                        <FontAwesomeIcon icon={faArrowLeft} />
                    </button>
                    <div>
                        <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">{playlistName}</h1>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">{items.length} STEPS</p>
                    </div>
                </div>

                {/* Bottom Row: Actions */}
                <div className="flex space-x-2">
                    <button
                        onClick={onRun}
                        className="flex-1 px-3 py-1.5 text-green-700 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30 rounded-md transition-all font-bold flex items-center justify-center border border-green-200 dark:border-green-800 text-xs uppercase tracking-wide"
                    >
                        <FontAwesomeIcon icon={faPlay} className="mr-2" /> Run
                    </button>
                    <button
                        onClick={onSave}
                        disabled={!isDirty}
                        className={`flex-1 px-3 py-1.5 rounded-md font-bold flex items-center justify-center border transition-all active:scale-95 text-xs uppercase tracking-wide ${isDirty
                            ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-700 shadow-sm'
                            : 'bg-slate-100 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600 border-slate-200 dark:border-slate-800'
                            }`}
                    >
                        <FontAwesomeIcon icon={faSave} className="mr-2" />
                        {isDirty ? 'Save' : 'Saved'}
                    </button>
                </div>
            </div>

            {/* Timeline Stream */}
            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar relative">
                <div className="flex items-center justify-between mb-4 px-1">
                    <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Execution Steps</h2>
                    <button
                        onClick={onAdd}
                        className="text-[10px] font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-2 py-1 rounded transition-colors uppercase tracking-wide"
                    >
                        + Add Script
                    </button>
                </div>

                {/* Vertical Line Connector */}
                {items.length > 0 && (
                    <div className="absolute left-[29px] top-[60px] bottom-4 w-0.5 bg-slate-200 dark:bg-slate-800 z-0" />
                )}

                <div className="space-y-2 relative z-10">
                    {items.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-center opacity-60 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-2">
                                <FontAwesomeIcon icon={faPlus} className="text-slate-300" />
                            </div>
                            <p className="text-xs font-medium text-slate-500">Empty Playlist</p>
                            <button onClick={onAdd} className="text-[10px] text-blue-500 mt-1 hover:underline">Add script</button>
                        </div>
                    )}

                    {items.map((item, index) => (
                        <div key={index} className="flex items-center group">
                            {/* Step Number Bubble (Thinner) */}
                            <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center border-4 border-slate-50 dark:border-slate-900 flex-shrink-0 z-10 cursor-pointer transition-all ${selectedIndex === index
                                        ? 'bg-blue-600 text-white shadow-md scale-110'
                                        : 'bg-white dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:text-blue-500'
                                    }`}
                                onClick={() => onSelect(index)}
                            >
                                <span className="text-[10px] font-bold font-mono">{index + 1}</span>
                            </div>

                            {/* Card (Thinner) */}
                            <div
                                className={`ml-3 flex-1 py-2 px-3 rounded-lg border transition-all cursor-pointer relative group-hover:shadow-sm ${selectedIndex === index
                                        ? 'bg-white dark:bg-slate-800 border-blue-500 shadow-sm ring-1 ring-blue-500/10'
                                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                                    }`}
                                onClick={() => onSelect(index)}
                            >
                                <div className="flex justify-between items-center">
                                    <div className="flex flex-col min-w-0 pr-2">
                                        <h3 className={`text-xs font-bold truncate ${selectedIndex === index ? 'text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'
                                            }`}>
                                            {item.scriptPath.split(/[\\\/]/).pop()?.replace('.cs', '')}
                                        </h3>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className={`flex items-center space-x-1 transition-opacity ${selectedIndex === index ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onReorder(index, 'up'); }}
                                            disabled={index === 0}
                                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-blue-500 disabled:opacity-20 transition-colors"
                                        >
                                            <FontAwesomeIcon icon={faArrowUp} className="text-[10px]" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onReorder(index, 'down'); }}
                                            disabled={index === items.length - 1}
                                            className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-400 hover:text-blue-500 disabled:opacity-20 transition-colors"
                                        >
                                            <FontAwesomeIcon icon={faArrowDown} className="text-[10px]" />
                                        </button>
                                        <div className="w-px h-3 bg-slate-200 dark:bg-slate-700 mx-1" />
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onDelete(index); }}
                                            className="p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-slate-300 hover:text-red-500 transition-colors"
                                        >
                                            <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
