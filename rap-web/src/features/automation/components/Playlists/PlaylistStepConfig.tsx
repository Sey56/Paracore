import React, { useState } from 'react';
import { Script } from '@/types/scriptModel';
import { PlaylistItemConfig } from './PlaylistItemConfig';
import { PlaylistItemMetadata } from './PlaylistItemMetadata';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faInfoCircle, faArrowLeft } from '@fortawesome/free-solid-svg-icons';

interface PlaylistStepConfigProps {
    script: Script;
    scriptPath: string;
    savedParameters: Record<string, string | number | boolean>;
    onUpdateParameters: (newParams: Record<string, string | number | boolean>) => void;
    onBack: () => void;
    stepIndex: number;
}

export const PlaylistStepConfig: React.FC<PlaylistStepConfigProps> = ({
    script,
    scriptPath,
    savedParameters,
    onUpdateParameters,
    onBack,
    stepIndex
}) => {
    const [isMetadataOpen, setIsMetadataOpen] = useState(false);

    return (
        <div className="flex flex-col h-full rounded-none shadow-none bg-white dark:bg-slate-900 overflow-hidden min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 h-12 bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-gray-700 shrink-0">
                <div className="flex items-center gap-3 overflow-hidden">
                    <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider flex-shrink-0">
                        Step {stepIndex + 1}
                    </span>
                    <span
                        className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate"
                        title={script.metadata?.displayName || scriptPath.split(/[\\/]/).pop()?.replace('.cs', '')}
                    >
                        {script.metadata?.displayName || scriptPath.split(/[\\/]/).pop()?.replace('.cs', '')}
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={onBack}
                        className="p-1.5 text-slate-400 hover:text-blue-500 transition-colors rounded"
                        title="Back to Steps"
                    >
                        <FontAwesomeIcon icon={faArrowLeft} className="text-xs" />
                    </button>
                    <button
                        onClick={() => setIsMetadataOpen(!isMetadataOpen)}
                        className={`p-1.5 rounded transition-all duration-200 ${isMetadataOpen
                            ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30"
                            : "text-slate-400 hover:text-blue-600 dark:text-slate-500 dark:hover:text-blue-400"
                        }`}
                        title="Script Info"
                    >
                        <FontAwesomeIcon icon={faInfoCircle} />
                    </button>
                </div>
            </div>

            {/* Metadata Panel (toggle-able) */}
            {isMetadataOpen && script.metadata && (
                <div className="border-b border-slate-200/60 dark:border-slate-700/40 bg-slate-50/80 dark:bg-slate-900/60 animate-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center px-5 pt-3 pb-1">
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Script Info</span>
                    </div>
                    <div className="px-5 pb-4 max-h-[200px] overflow-y-auto custom-scrollbar">
                        <PlaylistItemMetadata script={script} />
                    </div>
                </div>
            )}

            {/* Content Area — Parameters only */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                <div className="max-w-4xl max-w-full">
                    <PlaylistItemConfig
                        scriptPath={scriptPath}
                        savedParameters={savedParameters}
                        onUpdateParameters={onUpdateParameters}
                    />
                </div>
            </div>
        </div>
    );
};
