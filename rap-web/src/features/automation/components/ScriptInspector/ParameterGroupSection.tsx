import React, { useRef } from 'react';
import { FontAwesomeIcon } from "@/components/ui/Icon";
import { faChevronDown, faChevronRight, faExclamationCircle } from "@/components/ui/iconAliases";
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
    onPickObject: (selectionType: string, index: number) => void | Promise<unknown>;
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
        <div ref={containerRef}
            style={{ backgroundColor: isExpanded ? 'var(--bg-group-focus)' : 'var(--bg-group)' }}
            className="rounded-xl mb-4 w-full">
            {/* Header */}
            <div
                className="px-5 py-3 cursor-pointer flex items-center justify-between select-none group/groupheader"
                onClick={() => onToggleExpand(!isExpanded)}
            >
                <div className="flex items-center space-x-3">
                    <div className={`w-1 h-3.5 rounded-full ${isExpanded ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-700'}`} />
                    <div className="flex flex-col">
                        <span className="text-body-sm font-medium  tracking-wide text-slate-500 dark:text-slate-400">
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
                    <span className={`text-caption font-medium tabular-nums px-2 py-0.5 rounded-md
                        ${isExpanded
                            ? 'bg-blue-50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400'
                            : 'bg-white dark:bg-slate-800 text-slate-400'}`}>
                        {parameters.length}
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
