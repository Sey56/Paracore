import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronRight, faExclamationCircle } from "@fortawesome/free-solid-svg-icons";
import type { Script, ScriptParameter } from "@/types/scriptModel";
import { ParameterInput } from "./ParameterInput";
import { validateParameters } from '@/utils/parameterVisibility';

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
    isActionable
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const validationErrors = validateParameters(parameters);
    const hasErrors = validationErrors.length > 0;

    useEffect(() => {
        if (isExpanded && containerRef.current) {
            // Delay slightly to allow content to render before scrolling
            setTimeout(() => {
                containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }, 50);
        }
    }, [isExpanded]);

    return (
        <div ref={containerRef} className="border border-gray-200 dark:border-gray-700 rounded-lg mb-3 w-full">
            {/* Header */}
            <div
                className={`bg-gray-50 dark:bg-gray-800 px-4 py-2 cursor-pointer flex items-center justify-between select-none hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${isExpanded ? 'rounded-t-lg' : 'rounded-lg'}`}
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center space-x-2 font-medium text-sm text-gray-700 dark:text-gray-300">
                    <FontAwesomeIcon icon={isExpanded ? faChevronDown : faChevronRight} className="text-gray-400 text-xs w-3" />
                    <span>{groupName}</span>
                    {hasErrors && (
                        <FontAwesomeIcon
                            icon={faExclamationCircle}
                            className="text-red-500 text-xs animate-pulse ml-1"
                            title={`${validationErrors.length} validation issues in this group`}
                        />
                    )}
                </div>
                <span className={`text-xs rounded-full px-2 py-0.5 ${hasErrors && !isExpanded ? 'bg-red-100 text-red-600 dark:bg-red-900/30' : 'text-gray-400 bg-gray-200 dark:bg-gray-600'}`}>
                    {parameters.length}
                </span>
            </div>

            {/* Content */}
            {isExpanded && (
                <div className="p-3 space-y-3 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 w-full rounded-b-lg">
                    {parameters.map((param) => {
                        const originalIndex = allParameters.findIndex(p => p.name === param.name);
                        return (
                            <ParameterInput
                                key={originalIndex}
                                param={param}
                                index={originalIndex}
                                onChange={handleParameterChange}
                                onCompute={(paramName) => computeParameterOptions(script, paramName)}
                                onPickObject={onPickObject}
                                isComputing={isComputingOptions[param.name]}
                                disabled={!isActionable}
                            />
                        );
                    })}
                </div>
            )}
        </div>
    );
};
