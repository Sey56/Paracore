import React, { useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faEdit, faInfoCircle, faCheck, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { OrchestrationPlan, PlanStep as ScriptStep } from '@/context/providers/UIContext';

interface OrchestrationPlanCardProps {
    plan: OrchestrationPlan;
    onExecute: () => void;
    onUpdateParameter: (stepIndex: number, paramName: string, value: string | number | boolean) => void;
    onSwitchTab: (tab: 'console' | 'table') => void;
    onCompute: (stepIndex: number, paramName: string) => void;
    isPending: boolean;
}

const OrchestrationPlanCard: React.FC<OrchestrationPlanCardProps> = ({ plan, onExecute, onUpdateParameter, onSwitchTab, onCompute, isPending }) => {
    // ROBUSTNESS: Handle case where 'steps' might be a JSON string
    const resolvedSteps = useMemo(() => {
        if (Array.isArray(plan.steps)) return plan.steps;
        if (typeof plan.steps === 'string') {
            try { return JSON.parse(plan.steps); } catch { return []; }
        }
        return [];
    }, [plan.steps]);

    return (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600 mt-2 space-y-3">
            <div className="flex items-start space-x-2">
                <FontAwesomeIcon icon={faInfoCircle} className="text-blue-500 mt-1" />
                <p className="text-sm italic">{plan.explanation}</p>
            </div>

            <div className="space-y-4">
                {resolvedSteps.map((step: ScriptStep, idx: number) => (
                    <div key={idx} className="bg-white dark:bg-gray-700 rounded-md p-3 shadow-sm border border-gray-100 dark:border-gray-600">
                        <div className="flex justify-between items-center mb-2">
                            <h4 className="font-bold text-sm">{idx + 1}. {step.script_metadata.name}</h4>
                            <div className="flex items-center space-x-2">
                                {step.status === 'success' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-800 dark:bg-green-900 dark:text-blue-200">Success</span>}
                                {step.status === 'error' && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Error</span>}
                                <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                    Curated
                                </span>
                            </div>
                        </div>

                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 truncate">
                            {step.script_metadata.metadata.description}
                        </p>

                        <div className="space-y-1">
                            {/* Satisfied Parameters */}
                            {step.satisfied_parameters.map((param: string) => (
                                <div key={param} className="flex justify-between items-center text-xs">
                                    <span className="text-gray-600 dark:text-gray-400">
                                        <FontAwesomeIcon icon={faCheck} className="text-green-500 mr-1" /> {param}:
                                    </span>
                                    <span className="font-mono text-gray-800 dark:text-gray-200 truncate max-w-[150px]">
                                        {step.deduced_parameters[param]}
                                    </span>
                                </div>
                            ))}

                            {/* Missing Parameters */}
                            {step.missing_parameters.map((param: string) => {
                                const def = (step.parameter_definitions || []).find((d: Record<string, unknown>) => d.name === param);
                                const canCompute = def && ((def.isRevitElement as boolean) || (def.options && (def.options as unknown[]).length === 0 && def.revitElementType));

                                return (
                                    <div key={param} className="flex justify-between items-center text-xs py-1">
                                        <span className="text-gray-600 dark:text-gray-400">
                                            <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-500 mr-1" /> {param}:
                                        </span>
                                        <div className="flex items-center space-x-2">
                                            <span className="italic text-amber-600 dark:text-amber-400">
                                                Waiting...
                                            </span>
                                            {canCompute && isPending && (
                                                <button
                                                    onClick={() => onCompute(idx, param)}
                                                    className="px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-200 rounded text-[10px] font-bold transition-colors"
                                                >
                                                    Compute
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {step.result_summary && (
                            <div className="mt-3 pt-2 border-t border-gray-100 dark:border-gray-600">
                                <p className="text-xs font-semibold mb-2">{step.result_summary}</p>
                                <div className="flex space-x-2">
                                    <button
                                        onClick={() => onSwitchTab('console')}
                                        className="text-[10px] px-2 py-1 bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 rounded flex items-center"
                                    >
                                        View Console
                                    </button>
                                    <button
                                        onClick={() => onSwitchTab('table')}
                                        className="text-[10px] px-2 py-1 bg-gray-100 dark:bg-gray-600 hover:bg-gray-200 dark:hover:bg-gray-500 rounded flex items-center"
                                    >
                                        View Table
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {isPending && !resolvedSteps.some((s: ScriptStep) => s.status === 'success') && (
                <div className="flex space-x-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                    <button
                        onClick={onExecute}
                        className="flex-1 flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors font-semibold"
                    >
                        <FontAwesomeIcon icon={faPlay} className="mr-2" /> Execute Plan
                    </button>
                    <button
                        onClick={() => { }} // TODO: Open full editor modal
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-md transition-colors"
                        title="Edit Plan"
                    >
                        <FontAwesomeIcon icon={faEdit} />
                    </button>
                </div>
            )}
        </div>
    );
};

export default OrchestrationPlanCard;
