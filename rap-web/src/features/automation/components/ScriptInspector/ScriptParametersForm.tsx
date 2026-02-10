import React, { useMemo, useRef, useCallback } from 'react';
import type { Script, ScriptParameter } from '@/types/scriptModel';
import { ParameterInput } from "./ParameterInput";
import { ParameterGroupSection } from "./ParameterGroupSection";
import { filterVisibleParameters, isParameterEnabled } from '@/utils/parameterVisibility';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faExpandAlt, faCompressAlt } from "@fortawesome/free-solid-svg-icons";

interface ScriptParametersFormProps {
    script: Script | null; // Nullable for Generation View where we might not have a full script entity
    parameters: ScriptParameter[]; // The current state of values
    onChange: (index: number, value: string | boolean | number) => void;
    onComputeOptions: (paramName: string) => void;
    onPickObject: (selectionType: string, index: number) => void;
    isComputingOptions: Record<string, boolean>;
    isActionable: boolean;
}

// Global cache to persist expand state across script navigations (resets on app refresh)
const expandedGroupsCache: Record<string, Record<string, boolean>> = {};

export const ScriptParametersForm: React.FC<ScriptParametersFormProps> = ({
    script,
    parameters,
    onChange,
    onComputeOptions,
    onPickObject,
    isComputingOptions,
    isActionable
}) => {
    const scriptId = script?.id || '__generation__';

    // Initialize cache for this script if it doesn't exist
    if (!expandedGroupsCache[scriptId]) {
        expandedGroupsCache[scriptId] = {};
    }

    // Force re-render trigger
    const [, forceUpdate] = React.useReducer(x => x + 1, 0);

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

    const isGroupExpanded = useCallback((groupName: string) => {
        return expandedGroupsCache[scriptId][groupName] ?? false;
    }, [scriptId]);

    const setGroupExpanded = useCallback((groupName: string, expanded: boolean) => {
        expandedGroupsCache[scriptId][groupName] = expanded;
        forceUpdate();
    }, [scriptId]);

    const handleExpandAll = useCallback(() => {
        groupedParams.forEach(g => {
            expandedGroupsCache[scriptId][g.name] = true;
        });
        forceUpdate();
    }, [scriptId, groupedParams]);

    const handleCollapseAll = useCallback(() => {
        groupedParams.forEach(g => {
            expandedGroupsCache[scriptId][g.name] = false;
        });
        forceUpdate();
    }, [scriptId, groupedParams]);

    // Listen for global expand/collapse events
    React.useEffect(() => {
        window.addEventListener('expand-all-groups', handleExpandAll);
        window.addEventListener('collapse-all-groups', handleCollapseAll);
        return () => {
            window.removeEventListener('expand-all-groups', handleExpandAll);
            window.removeEventListener('collapse-all-groups', handleCollapseAll);
        };
    }, [handleExpandAll, handleCollapseAll]);

    if (parameters.length === 0) {
        return (
            <div className="text-center py-8 text-gray-400 italic">
                Script has no parameters.
            </div>
        );
    }

    const hasGroups = groupedParams.length > 0;

    return (
        <div className="space-y-4">
            {/* Render Ungrouped Parameters First */}
            {ungroupedParams.map((param) => {
                // Find original index in the main array to pass back to onChange
                const originalIndex = parameters.findIndex(p => p.name === param.name);
                const isEnabled = isParameterEnabled(param, parameters);
                return (
                    <ParameterInput
                        key={`${param.name}-${originalIndex}`}
                        param={param}
                        index={originalIndex}
                        onChange={onChange}
                        onCompute={() => onComputeOptions(param.name)}
                        onPickObject={(type) => onPickObject(type, originalIndex)}
                        isComputing={isComputingOptions[param.name]}
                        disabled={!isActionable || !isEnabled}
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
                    isExpanded={isGroupExpanded(group.name)}
                    onToggleExpand={(expanded) => setGroupExpanded(group.name, expanded)}
                />
            ))}
        </div>
    );
};
