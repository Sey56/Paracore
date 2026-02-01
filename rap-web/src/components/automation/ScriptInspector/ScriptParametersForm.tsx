import React, { useMemo } from 'react';
import type { Script, ScriptParameter } from '@/types/scriptModel';
import { ParameterInput } from "./ParameterInput";
import { ParameterGroupSection } from "./ParameterGroupSection";
import { filterVisibleParameters } from '@/utils/parameterVisibility';

interface ScriptParametersFormProps {
    script: Script | null; // Nullable for Generation View where we might not have a full script entity
    parameters: ScriptParameter[]; // The current state of values
    onChange: (index: number, value: string | boolean | number) => void;
    onComputeOptions: (paramName: string) => void;
    onPickObject: (selectionType: string, index: number) => void;
    isComputingOptions: Record<string, boolean>;
    isActionable: boolean;
}

export const ScriptParametersForm: React.FC<ScriptParametersFormProps> = ({
    script,
    parameters,
    onChange,
    onComputeOptions,
    onPickObject,
    isComputingOptions,
    isActionable
}) => {

    // Filter visibility
    const visibleParameters = useMemo(() => {
        return filterVisibleParameters(parameters);
    }, [parameters]);

    // Grouping Logic
    const { groupedParams, ungroupedParams } = useMemo(() => {
        const grouped: { name: string; params: ScriptParameter[] }[] = [];
        const ungrouped: ScriptParameter[] = [];
        const groups: Record<string, ScriptParameter[]> = {};

        visibleParameters.forEach(p => {
            if (p.group && p.group.trim().length > 0) {
                if (!groups[p.group]) groups[p.group] = [];
                groups[p.group].push(p);
            } else {
                ungrouped.push(p);
            }
        });

        Object.keys(groups).sort().forEach(groupName => {
            grouped.push({ name: groupName, params: groups[groupName] });
        });

        return { groupedParams: grouped, ungroupedParams: ungrouped };
    }, [visibleParameters]);

    if (parameters.length === 0) {
        return (
            <div className="text-center py-8 text-gray-400 italic">
                Script has no parameters.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Render Ungrouped Parameters First */}
            {ungroupedParams.map((param) => {
                // Find original index in the main array to pass back to onChange
                const originalIndex = parameters.findIndex(p => p.name === param.name);
                return (
                    <ParameterInput
                        key={`${param.name}-${originalIndex}`}
                        param={param}
                        index={originalIndex}
                        onChange={onChange}
                        onCompute={() => onComputeOptions(param.name)}
                        onPickObject={(type) => onPickObject(type, originalIndex)}
                        isComputing={isComputingOptions[param.name]}
                        disabled={!isActionable}
                    />
                );
            })}

            {/* Render Groups */}
            {groupedParams.map((group) => (
                <ParameterGroupSection
                    key={group.name}
                    groupName={group.name}
                    parameters={group.params}
                    allParameters={parameters}
                    handleParameterChange={onChange}
                    script={script || {} as Script} // Fallback if script is null, mostly for ID checks inside group if any
                    computeParameterOptions={(s, pName) => onComputeOptions(pName)} // Adapter
                    onPickObject={(type, idx) => onPickObject(type, idx)} // Adapter
                    isComputingOptions={isComputingOptions}
                    isActionable={isActionable}
                />
            ))}
        </div>
    );
};
