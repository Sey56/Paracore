import React, { useState } from 'react';
import { Script } from '@/types/scriptModel';
import { PlaylistItemConfig } from './PlaylistItemConfig';
import { PlaylistItemMetadata } from './PlaylistItemMetadata';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSliders, faInfoCircle, faTerminal } from '@fortawesome/free-solid-svg-icons';

import { ExecutionResult } from '@/types/common';
import { StructuredOutputViewer } from '../ScriptInspector/StructuredOutputViewer';
import { StepExecutionViewer } from './StepExecutionViewer';

interface UnifiedStepInspectorProps {
    script: Script;
    scriptPath: string;
    savedParameters: Record<string, string | number | boolean>;
    onUpdateParameters: (newParams: Record<string, string | number | boolean>) => void;
    stepIndex: number;
    executionReport?: { stepIndex: number; scriptName: string; result: ExecutionResult }[];
}

type TabType = 'config' | 'info' | 'output';

export const UnifiedStepInspector: React.FC<UnifiedStepInspectorProps> = ({
    script,
    scriptPath,
    savedParameters,
    onUpdateParameters,
    stepIndex,
    executionReport
}) => {
    const [activeTab, setActiveTab] = useState<TabType>('config');

    return (
        <div className="flex flex-col h-full bg-white dark:bg-gray-900">
            {/* Header Area (Compacted) */}
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900 z-10">
                <div className="flex items-center space-x-4">
                    <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider flex-shrink-0">
                        Step {stepIndex + 1}
                    </span>
                    <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 truncate max-w-[400px]">
                        {script.metadata.displayName || scriptPath.split(/[\\/]/).pop()?.replace('.cs', '')}
                    </h2>
                </div>

                {/* Tabs (Compact & Inline) */}
                <div className="flex space-x-6">
                    <button
                        onClick={() => setActiveTab('config')}
                        className={`text-xs font-bold flex items-center transition-colors pb-0.5 border-b-2 ${activeTab === 'config'
                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                            }`}
                    >
                        <FontAwesomeIcon icon={faSliders} className="mr-2" />
                        Config
                    </button>
                    <button
                        onClick={() => setActiveTab('info')}
                        className={`text-xs font-bold flex items-center transition-colors pb-0.5 border-b-2 ${activeTab === 'info'
                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                            }`}
                    >
                        <FontAwesomeIcon icon={faInfoCircle} className="mr-2" />
                        Info
                    </button>
                    <button
                        onClick={() => setActiveTab('output')}
                        disabled={!executionReport || executionReport.length === 0}
                        className={`text-xs font-bold flex items-center transition-colors pb-0.5 border-b-2 ${activeTab === 'output'
                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                            : (!executionReport || executionReport.length === 0)
                                ? 'border-transparent text-gray-200 dark:text-gray-700 cursor-not-allowed'
                                : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                            }`}
                    >
                        <FontAwesomeIcon icon={faTerminal} className="mr-2" />
                        Output
                        {executionReport && executionReport.length > 0 && (
                            <span className="ml-2 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 text-[9px] px-1.5 rounded-full">
                                {executionReport.length}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative bg-gray-50/50 dark:bg-gray-800/20">
                <div className="h-full overflow-y-auto custom-scrollbar p-6">
                    <div className="max-w-4xl max-w-full"> {/* Allow wider content for charts */}
                        {activeTab === 'config' && (
                            <div className="animate-in fade-in slide-in-from-left-2 duration-200">
                                <PlaylistItemConfig
                                    scriptPath={scriptPath}
                                    savedParameters={savedParameters}
                                    onUpdateParameters={onUpdateParameters}
                                />
                            </div>
                        )}

                        {activeTab === 'info' && (
                            <div className="animate-in fade-in slide-in-from-right-2 duration-200">
                                <PlaylistItemMetadata script={script} />
                            </div>
                        )}

                        {activeTab === 'output' && executionReport && (
                            <div className="animate-in fade-in slide-in-from-right-2 duration-200 space-y-6">
                                {executionReport.map((item, idx) => (
                                    <StepExecutionViewer
                                        key={idx}
                                        result={item.result}
                                        stepNumber={item.stepIndex + 1}
                                        scriptName={item.scriptName}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
