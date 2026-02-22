import React, { useRef } from 'react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronRight, faExclamationCircle } from "@fortawesome/free-solid-svg-icons";
import type { Script, ScriptParameter } from "@/types/scriptModel";
import { ParameterInput } from "./ParameterInput";
import { validateParameters, isParameterEnabled } from '@/utils/parameterVisibility';

interface ParameterGroupSectionProps {
    groupName: string;
    parameters: ScriptParameter[];
    allParameters: ScriptParameter[];
    handleParameterChange: (index: number, value: string | number | boolean) => void;
    script: Script;
    computeParameterOptions: (script: Script, paramName: string) => void;
    onPickObject: (selectionType: string, index: number) => void;
    isComputingOptions: Record<string, boolean>;
    isActionable: boolean;
    isExpanded: boolean;
    onToggleExpand: (expanded: boolean) => void;
}

export const ParameterGroupSection: React.FC<ParameterGroupSectionProps> = ({
    groupName,
    parameters,
    allParameters,
    handleParameterChange,
    script,
    computeParameterOptions,
    onPickObject,
    isComputingOptions,
    isActionable,
    isExpanded,
    onToggleExpand
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const validationErrors = validateParameters(parameters);
    const hasErrors = validationErrors.length > 0;

    return (
        <div ref={containerRef} className={`rounded-2xl mb-4 w-full transition-all duration-300 border
            ${isExpanded
                ? 'bg-white/40 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 shadow-xl'
                : 'bg-slate-50/50 dark:bg-slate-900/30 border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'}`}>
            {/* Header */}
            <div
                className={`px-5 py-3 cursor-pointer flex items-center justify-between select-none transition-all group/groupheader ${isExpanded ? 'border-b border-slate-100 dark:border-slate-800' : ''}`}
                onClick={() => onToggleExpand(!isExpanded)}
            >
                <div className="flex items-center space-x-3">
                    <div className={`w-1 h-4 rounded-full transition-all duration-500 ${isExpanded ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-slate-300 dark:bg-slate-700'}`} />
                    <div className="flex flex-col">
                        <span className={`text-xs font-bold uppercase tracking-[0.15em] transition-colors ${isExpanded ? 'text-slate-400 dark:text-slate-400' : 'text-slate-500 dark:text-slate-500'}`}>
                            {groupName}
                        </span>
                    </div>
                    {hasErrors && (
                        <FontAwesomeIcon
                            icon={faExclamationCircle}
                            className="text-rose-500 text-xs animate-pulse"
                            title={`${validationErrors.length} validation issues`}
                        />
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <span className={`text-xs font-black tabular-nums px-2 py-0.5 rounded-md border tracking-widest transition-all
                        ${isExpanded
                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-100 dark:border-blue-800'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'}`}>
                        {parameters.length} COMPONENTS
                    </span>
                    <FontAwesomeIcon
                        icon={faChevronRight}
                        className={`text-xs text-slate-400 transition-transform duration-300 ${isExpanded ? 'rotate-90 text-blue-500' : ''}`}
                    />
                </div>
            </div>

            {/* Content */}
            {isExpanded && (
                <div className="p-5 space-y-5 bg-transparent w-full animate-in slide-in-from-top-2 duration-300">
                    {parameters.map((param) => {
                        const originalIndex = allParameters.findIndex(p => p.name === param.name);
                        const isEnabled = isParameterEnabled(param, allParameters);
                        return (
                            <ParameterInput
                                key={originalIndex}
                                param={param}
                                index={originalIndex}
                                onChange={handleParameterChange}
                                onCompute={(paramName) => computeParameterOptions(script, paramName)}
                                onPickObject={onPickObject}
                                isComputing={isComputingOptions[param.name]}
                                disabled={!isActionable || !isEnabled}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};
