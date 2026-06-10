import React, { useMemo, useEffect } from 'react';
import { useScripts } from '../../index';
import { useScriptExecution } from '../../index';
import { Script, ScriptParameter } from '@/types/scriptModel';
import { ParameterInput } from '../ScriptInspector/ParameterInput';
import { ParameterGroupSection } from '../ScriptInspector/ParameterGroupSection';
import { filterVisibleParameters } from '@/utils/parameterVisibility';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';

interface PlaylistItemConfigProps {
    scriptPath: string;
    savedParameters: Record<string, string | number | boolean>;
    onUpdateParameters: (newParams: Record<string, string | number | boolean>) => void;
}

export const PlaylistItemConfig: React.FC<PlaylistItemConfigProps> = ({ scriptPath, savedParameters, onUpdateParameters }) => {
    const { scripts, reloadScript } = useScripts();
    const { computeParameterOptions, pickObject, isComputingOptions } = useScriptExecution();
    const [isLoading, setIsLoading] = React.useState(false);
    const [expandedGroups, setExpandedGroups] = React.useState<Record<string, boolean>>({});

    // Locally cached computed options — independent from global script state.
    // This ensures compute in the playlist doesn't affect the gallery, and vice versa.
    const [computedOptionsMap, setComputedOptionsMap] = React.useState<Record<string, string[]>>({});

    // Track which script paths we've already attempted to fetch parameters for,
    // preventing infinite reload loops when a script genuinely has no parameters.
    const fetchedRef = React.useRef<Set<string>>(new Set());

    const script = useMemo(() => {
        // Try multiple matching strategies
        const normalizedPath = scriptPath.replace(/\\/g, '/').toLowerCase();

        const found = scripts.find(s => {
            const normalizedScriptPath = s.absolutePath.replace(/\\/g, '/').toLowerCase();
            return normalizedScriptPath === normalizedPath ||
                s.absolutePath === scriptPath ||
                normalizedScriptPath.endsWith(normalizedPath) ||
                normalizedPath.endsWith(normalizedScriptPath);
        });

        return found;
    }, [scripts, scriptPath]);

    // Automated parameter fetching — only attempt once per script path
    useEffect(() => {
        if (script && (!script.parameters || script.parameters.length === 0)) {
            const fetchKey = script.absolutePath || script.id || scriptPath;
            if (fetchedRef.current.has(fetchKey)) return; // already attempted — don't loop
            fetchedRef.current.add(fetchKey);

            const fetchParams = async () => {
                setIsLoading(true);
                try {
                    await reloadScript(script, { silent: true });
                } catch (error) {
                    console.error('[PlaylistItemConfig] Failed to fetch parameters:', error);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchParams();
        }
    }, [script, reloadScript, scriptPath]);

    const mergedParameters = useMemo(() => {
        if (!script) return [];

        // Use parameters from script directly
        const baseParams = script.parameters || [];

        return baseParams.map((p: ScriptParameter) => {
            const savedValue = savedParameters[p.name];
            // Use saved value if present, otherwise default
            const value = savedValue !== undefined ? savedValue : p.value;
            // Merge locally computed options (independent from gallery)
            const localOptions = computedOptionsMap[p.name];
            return { ...p, value, options: localOptions || p.options };
        });
    }, [script, savedParameters, computedOptionsMap]);

    const visibleParameters = useMemo(() => {
        return filterVisibleParameters(mergedParameters);
    }, [mergedParameters]);

    const handleParameterChange = (index: number, value: string | number | boolean) => {
        const param = mergedParameters[index];
        if (!param) return;

        const newParams = { ...savedParameters, [param.name]: value };
        onUpdateParameters(newParams);
    };

    const handlePickObject = async (selectionType: string, index: number) => {
        const param = mergedParameters[index];
        if (param && script) {
            const result = await pickObject(script, param.name, selectionType, false);
            if (result && result.is_success && result.value !== undefined) {
                // Update local playlist parameters
                const newParams = { ...savedParameters, [param.name]: result.value };
                onUpdateParameters(newParams);
            }
        }
    };

    const handleCompute = async (_s: Script, paramName: string) => {
        if (!script) return;
        // false = don't update global script — keeps gallery and playlist independent
        const result = await computeParameterOptions(script, paramName, false);

        if (result && result.is_success && result.options && result.options.length > 0) {
            // Cache options locally so the dropdown populates without touching global state
            setComputedOptionsMap(prev => ({ ...prev, [paramName]: result.options! }));

            // Auto-select first option if current value is invalid or empty
            const param = mergedParameters.find(p => p.name === paramName);
            if (param && !param.multiSelect) {
                const currentValueStr = String(param.value || "");
                if (!currentValueStr || !result.options.includes(currentValueStr)) {
                    const newParams = { ...savedParameters, [param.name]: result.options[0] };
                    onUpdateParameters(newParams);
                }
            }
        }
    };

    if (isLoading) {
        return (
            <div className="p-8 flex flex-col items-center justify-center space-y-3">
                <div className="w-4 h-4 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">Loading</p>
            </div>
        );
    }

    if (!script) {
        return (
            <div className="p-4 text-red-500 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-900/30">
                <p className="font-bold text-sm">Script connection lost</p>
                <p className="text-xs mt-1 text-gray-400">Path: {scriptPath}</p>
            </div>
        );
    }

    if (mergedParameters.length === 0) {
        return (
            <div className="p-10 text-center flex flex-col items-center justify-center">
                <div className="w-10 h-10 bg-gray-50 dark:bg-gray-800/50 rounded-full flex items-center justify-center mb-3 text-gray-300">
                    <FontAwesomeIcon icon={faArrowLeft} className="rotate-45 opacity-40" size="xs" />
                </div>
                <p className="text-xs text-gray-400 italic">
                    This script does not have any configurable parameters.
                </p>
            </div>
        );
    }

    // Grouping Logic
    const groupedParams: { name: string; params: ScriptParameter[] }[] = [];
    const ungroupedParams: ScriptParameter[] = [];
    const groups: Record<string, ScriptParameter[]> = {};

    visibleParameters.forEach(p => {
        if (p.group && p.group.trim().length > 0) {
            if (!groups[p.group]) groups[p.group] = [];
            groups[p.group].push(p);
        } else {
            ungroupedParams.push(p);
        }
    });

    Object.keys(groups).sort().forEach(groupName => {
        groupedParams.push({ name: groupName, params: groups[groupName] });
    });

    return (
        <div className="space-y-4">
            {/* Render Ungrouped Parameters First */}
            {ungroupedParams.map((param) => {
                const originalIndex = mergedParameters.findIndex(p => p.name === param.name);
                return (
                    <ParameterInput
                        key={originalIndex}
                        param={param}
                        index={originalIndex}
                        onChange={handleParameterChange}
                        onCompute={(pName) => handleCompute(script, pName)}
                        onPickObject={handlePickObject}
                        isComputing={isComputingOptions[param.name]}
                        disabled={false}
                    />
                );
            })}

            {/* Render Groups */}
            {groupedParams.map((group) => (
                <ParameterGroupSection
                    key={group.name}
                    groupName={group.name}
                    parameters={group.params}
                    allParameters={mergedParameters}
                    handleParameterChange={handleParameterChange}
                    script={script}
                    computeParameterOptions={handleCompute}
                    onPickObject={handlePickObject}
                    isComputingOptions={isComputingOptions}
                    isActionable={true}
                    isExpanded={expandedGroups[group.name] ?? false}
                    onToggleExpand={(expanded) => setExpandedGroups(prev => ({ ...prev, [group.name]: expanded }))}
                />
            ))}
        </div>
    );
};
