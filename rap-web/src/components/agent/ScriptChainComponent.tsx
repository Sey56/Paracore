import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faListOl, faArrowRight, faCheckCircle, faTimesCircle, faSpinner, faCheck } from '@fortawesome/free-solid-svg-icons';

interface ScriptChainComponentProps {
    scripts: any[];
    onSelectScript: (script: any) => void;
    onRunPlan: () => void;
    selectedScriptId?: string;
    activeScriptId?: string; // The script currently being executed or awaiting approval
    pendingToolCall?: any; // The tool call if status is 'interrupted'
    onApproveTool?: (toolCall: any) => void;
    onRejectTool?: (toolCall: any) => void;
    completedScriptIds?: Set<string>;
}

export const ScriptChainComponent: React.FC<ScriptChainComponentProps> = ({
    scripts,
    onSelectScript,
    onRunPlan,
    selectedScriptId,
    activeScriptId,
    pendingToolCall,
    onApproveTool,
    onRejectTool,
    completedScriptIds = new Set()
}) => {
    if (!scripts || scripts.length === 0) return null;

    const isRunning = !!activeScriptId && !pendingToolCall;

    return (
        <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center">
                    <FontAwesomeIcon icon={faListOl} className="mr-2" />
                    Execution Plan
                </h3>
            </div>

            <div className="space-y-2">
                {scripts.map((script, index) => {
                    const isCompleted = completedScriptIds.has(script.absolutePath);
                    const isActive = activeScriptId === script.absolutePath;
                    const isPendingApproval = isActive && pendingToolCall && pendingToolCall.args.script_name === script.name;
                    const isReadyToRun = isActive && !isPendingApproval && !isCompleted;

                    let statusColor = 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600';
                    if (isActive) statusColor = 'bg-blue-50 dark:bg-blue-900/30 border-blue-500';
                    if (isCompleted) statusColor = 'bg-green-50 dark:bg-green-900/30 border-green-500';
                    if (selectedScriptId === script.absolutePath && !isActive && !isCompleted) statusColor = 'border-blue-300 ring-1 ring-blue-300';

                    return (
                        <div
                            key={index}
                            className={`p-3 rounded-lg border transition-all ${statusColor}`}
                        >
                            <div
                                className="flex items-center cursor-pointer"
                                onClick={() => onSelectScript(script)}
                            >
                                <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-3 ${isCompleted ? 'bg-green-500 text-white' :
                                    isActive ? 'bg-blue-500 text-white' :
                                        'bg-gray-200 dark:bg-gray-600'
                                    }`}>
                                    {isCompleted ? <FontAwesomeIcon icon={faCheck} /> : index + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                        {script.name}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        {script.description || "No description available"}
                                    </p>
                                </div>
                                {isActive && isRunning && !isReadyToRun && (
                                    <FontAwesomeIcon icon={faSpinner} spin className="text-blue-500 ml-2" />
                                )}
                            </div>

                            {/* Ready to Run State */}
                            {isReadyToRun && (
                                <div className="mt-3 pl-9">
                                    <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-600 shadow-sm">
                                        <p className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300">
                                            Ready to Start
                                        </p>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); onRunPlan(); }}
                                            className="w-full px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 flex items-center justify-center"
                                        >
                                            <FontAwesomeIcon icon={faPlay} className="mr-1" /> Run Step
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Inline HITL Approval */}
                            {isPendingApproval && (
                                <div className="mt-3 pl-9">
                                    <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-600 shadow-sm">
                                        <p className="text-xs font-semibold mb-2 text-gray-700 dark:text-gray-300">
                                            Confirm Execution:
                                        </p>
                                        <div className="text-xs text-gray-600 dark:text-gray-400 mb-3 font-mono bg-gray-50 dark:bg-gray-900 p-2 rounded">
                                            {JSON.stringify(pendingToolCall.args.parameters, null, 2)}
                                        </div>
                                        <div className="flex space-x-2">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onApproveTool && onApproveTool(pendingToolCall); }}
                                                className="flex-1 px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700 flex items-center justify-center"
                                            >
                                                <FontAwesomeIcon icon={faCheckCircle} className="mr-1" /> Approve
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onRejectTool && onRejectTool(pendingToolCall); }}
                                                className="flex-1 px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 flex items-center justify-center"
                                            >
                                                <FontAwesomeIcon icon={faTimesCircle} className="mr-1" /> Reject
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
