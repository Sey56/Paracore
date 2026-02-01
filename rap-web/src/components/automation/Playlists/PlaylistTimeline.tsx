import React from 'react';
import { PlaylistItem } from '@/types/playlistModel';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash, faArrowUp, faArrowDown, faArrowLeft, faPlay, faSave, faCheck, faTimes, faSpinner, faPen } from '@fortawesome/free-solid-svg-icons';

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
    onEditDetails: () => void;
    isDirty: boolean;
    executionStatus?: Record<number, 'pending' | 'running' | 'success' | 'error'>;
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
    onEditDetails,
    isDirty,
    executionStatus = {}
}) => {
    const isAnyRunning = Object.values(executionStatus).some(s => s === 'running');

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
                        <div className="flex items-center space-x-2">
                            <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">{playlistName}</h1>
                            <button
                                onClick={onEditDetails}
                                className="text-slate-400 hover:text-blue-500 text-xs p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title="Edit Name & Description"
                            >
                                <FontAwesomeIcon icon={faPen} />
                            </button>
                        </div>
                        <p className="text-[10px] text-slate-500 font-mono mt-0.5">{items.length} STEPS</p>
                    </div>
                </div>

                {/* Bottom Row: Actions */}
                <div className="flex space-x-2">
                    <button
                        onClick={onRun}
                        disabled={isAnyRunning}
                        className={`flex-1 px-3 py-1.5 rounded-md transition-all font-bold flex items-center justify-center border text-xs uppercase tracking-wide ${isAnyRunning
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200'
                            : 'text-green-700 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30 border-green-200 dark:border-green-800'
                            }`}
                    >
                        {isAnyRunning ? (
                            <span className="flex items-center"><FontAwesomeIcon icon={faSpinner} spin className="mr-2" /> Running</span>
                        ) : (
                            <span className="flex items-center"><FontAwesomeIcon icon={faPlay} className="mr-2" /> Run</span>
                        )}
                    </button>
                    <button
                        onClick={onSave}
                        disabled={!isDirty || isAnyRunning}
                        className={`flex-1 px-3 py-1.5 rounded-md font-bold flex items-center justify-center border transition-all active:scale-95 text-xs uppercase tracking-wide ${isDirty && !isAnyRunning
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
                        disabled={isAnyRunning}
                        className={`text-[10px] font-bold px-2 py-1 rounded transition-colors uppercase tracking-wide ${isAnyRunning
                            ? 'text-slate-300 cursor-not-allowed'
                            : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50'
                            }`}
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

                    {items.map((item, index) => {
                        const status = executionStatus[index] || 'pending';
                        return (
                            <div key={index} className="flex items-center group">
                                {/* Step Number Bubble (Thinner) */}
                                <div
                                    className={`w-8 h-8 rounded-full flex items-center justify-center border-4 flex-shrink-0 z-10 cursor-pointer transition-all ${status === 'running' ? 'border-blue-200 animate-pulse bg-blue-500 text-white' :
                                        status === 'success' ? 'border-green-200 bg-green-500 text-white' :
                                            status === 'error' ? 'border-red-200 bg-red-500 text-white' :
                                                selectedIndex === index
                                                    ? 'border-slate-50 dark:border-slate-900 bg-blue-600 text-white shadow-md scale-110'
                                                    : 'border-slate-50 dark:border-slate-900 bg-white dark:bg-slate-800 text-slate-400 hover:border-blue-400 hover:text-blue-500'
                                        }`}
                                    onClick={() => onSelect(index)}
                                >
                                    {status === 'running' ? <FontAwesomeIcon icon={faSpinner} spin className="text-[10px]" /> :
                                        status === 'success' ? <FontAwesomeIcon icon={faCheck} className="text-[10px]" /> :
                                            status === 'error' ? <FontAwesomeIcon icon={faTimes} className="text-[10px]" /> :
                                                <span className="text-[10px] font-bold font-mono">{index + 1}</span>
                                    }
                                </div>

                                {/* Card (Thinner) */}
                                <div
                                    className={`ml-3 flex-1 py-2 px-3 rounded-lg border transition-all cursor-pointer relative group-hover:shadow-sm ${status === 'error' ? 'border-red-300 bg-red-50 dark:bg-red-900/10' :
                                        selectedIndex === index
                                            ? 'bg-white dark:bg-slate-800 border-blue-500 shadow-sm ring-1 ring-blue-500/10'
                                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-700'
                                        }`}
                                    onClick={() => onSelect(index)}
                                >
                                    <div className="flex justify-between items-center">
                                        <div className="flex flex-col min-w-0 pr-2">
                                            <h3 className={`text-xs font-bold truncate ${status === 'error' ? 'text-red-700 dark:text-red-400' :
                                                selectedIndex === index ? 'text-slate-800 dark:text-slate-100' : 'text-slate-600 dark:text-slate-300'
                                                }`}>
                                                {item.scriptPath.split(/[\\/]/).pop()?.replace('.cs', '')}
                                            </h3>
                                        </div>

                                        {/* Action Buttons (Only show when NOT running) */}
                                        {!isAnyRunning && (
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
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
