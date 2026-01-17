import React, { useState, useEffect, useMemo } from 'react';
// Force TS re-index
import { Playlist, PlaylistItem } from '@/types/playlistModel';
import { ScriptParameter } from '@/types/scriptModel';
import { ExecutionResult } from '@/types/common';
import { usePlaylist } from '@/hooks/usePlaylist';
import { useScriptExecution } from '@/hooks/useScriptExecution';
import { useScripts } from '@/hooks/useScripts';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faSave, faPlay } from '@fortawesome/free-solid-svg-icons';
import { useNotifications } from '@/hooks/useNotifications';
import { PlaylistScriptPicker } from './PlaylistScriptPicker';
import { PlaylistTimeline } from './PlaylistTimeline';
import { EditPlaylistModal } from './EditPlaylistModal';
import { UnifiedStepInspector } from './UnifiedStepInspector';

interface PlaylistEditorProps {
    playlist: Playlist;
    onBack: () => void;
}

export const PlaylistEditor: React.FC<PlaylistEditorProps> = ({ playlist, onBack }) => {
    const { updatePlaylist } = usePlaylist();
    const { scripts } = useScripts();

    // Local state for editing - we don't want to modify the context state directly until save
    const [editedPlaylist, setEditedPlaylist] = useState<Playlist>(() => JSON.parse(JSON.stringify(playlist)));
    const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
    const [isScriptPickerOpen, setIsScriptPickerOpen] = useState(false);
    const [isEditDetailsModalOpen, setIsEditDetailsModalOpen] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    const [executionStatus, setExecutionStatus] = useState<Record<number, 'pending' | 'running' | 'success' | 'error'>>({});
    const [executionResults, setExecutionResults] = useState<Record<number, ExecutionResult>>({});

    const { setSelectedScript, runScript } = useScriptExecution();

    // ISOLATION FIX: Clear global inspector on mount AND unmount to prevent state leakage
    useEffect(() => {
        setSelectedScript(null);
        return () => {
            // Reset global state on unmount
            // setSelectedScript(null); // Already covered
        };
    }, [setSelectedScript]);

    // Sync state if prop changes
    useEffect(() => {
        setEditedPlaylist(JSON.parse(JSON.stringify(playlist)));
        setIsDirty(false);
        setSelectedItemIndex(null);
        setExecutionStatus({});
        setExecutionResults({});
    }, [playlist]);

    const handleSave = async () => {
        const success = await updatePlaylist(editedPlaylist);
        if (success) {
            setIsDirty(false);
        }
    };

    const handleRunPlaylist = async () => {
        if (isDirty) {
            // Auto-save before running? Or warn? 
            // For V1, let's auto-save to ensure consistency
            await handleSave();
        }

        setExecutionStatus({}); // Reset status

        for (let i = 0; i < editedPlaylist.items.length; i++) {
            const item = editedPlaylist.items[i];

            // 1. Update Status
            setExecutionStatus(prev => ({ ...prev, [i]: 'running' }));
            setSelectedItemIndex(i);

            // 2. Find Script Object
            const normalizedPath = item.scriptPath.replace(/\\/g, '/').toLowerCase();
            const script = scripts.find(s => {
                const normalizedScriptPath = s.absolutePath.replace(/\\/g, '/').toLowerCase();
                return normalizedScriptPath === normalizedPath ||
                    s.absolutePath === item.scriptPath ||
                    normalizedScriptPath.endsWith(normalizedPath) ||
                    normalizedPath.endsWith(normalizedScriptPath);
            });

            if (!script) {
                setExecutionStatus(prev => ({ ...prev, [i]: 'error' }));
                console.error(`Script not found: ${item.scriptPath}`);
                return; // Stop execution
            }

            // 3. Prepare Parameters (Naive Merge for V1)
            // We construct ScriptParameter objects from the saved key-value pairs.
            // Ideally we should merge with script defaults, but for execution, 
            // we primarily need to pass the values to the backend.
            // The backend might expect a specific structure.
            // Let's coerce the saved parameters into a flat list resembling ScriptParameter[]

            // If the script has parameters loaded in memory, use them as a base.
            const baseParams = script.parameters || [];
            const finalParams = baseParams.map(p => {
                const savedValue = item.parameters[p.name];
                return {
                    ...p,
                    value: ((savedValue !== undefined && savedValue !== null)
                        ? savedValue
                        : (p.value ?? p.defaultValue ?? "")) as ScriptParameter['value']
                };
            });

            // 4. Run Script
            try {
                // We must await the result!
                const result = await runScript(script, finalParams);

                if (result) {
                    setExecutionResults(prev => ({ ...prev, [i]: result }));
                }

                if (result?.isSuccess) {
                    setExecutionStatus(prev => ({ ...prev, [i]: 'success' }));
                } else {
                    setExecutionStatus(prev => ({ ...prev, [i]: 'error' }));
                    return; // Stop on error
                }
            } catch (err) {
                console.error("Critical Execution Error", err);
                setExecutionStatus(prev => ({ ...prev, [i]: 'error' }));
                return;
            }
        }
    };

    const handleDeleteItem = (index: number) => {
        const newItems = [...editedPlaylist.items];
        newItems.splice(index, 1);
        setEditedPlaylist({ ...editedPlaylist, items: newItems });
        if (selectedItemIndex === index) setSelectedItemIndex(null);
        if (selectedItemIndex !== null && selectedItemIndex > index) setSelectedItemIndex(selectedItemIndex - 1);
        setIsDirty(true);
    };

    const handleMoveItem = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === editedPlaylist.items.length - 1) return;

        const newItems = [...editedPlaylist.items];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;

        // Swap
        [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];

        setEditedPlaylist({ ...editedPlaylist, items: newItems });
        // Follow the selection
        if (selectedItemIndex === index) setSelectedItemIndex(targetIndex);
        setIsDirty(true);
    };

    const handleAddScript = (scriptPath: string) => {
        const newItem: PlaylistItem = {
            scriptPath: scriptPath,
            parameters: {} // Empty initial parameters
        };
        setEditedPlaylist({
            ...editedPlaylist,
            items: [...editedPlaylist.items, newItem]
        });
        setSelectedItemIndex(editedPlaylist.items.length); // Select the new item
        setIsDirty(true);
        setIsScriptPickerOpen(false);
    };

    // Find the current script object based on selection
    const currentScript = useMemo(() => {
        if (selectedItemIndex === null) return null;
        const item = editedPlaylist.items[selectedItemIndex];
        const normalizedPath = item.scriptPath.replace(/\\/g, '/').toLowerCase();

        return scripts.find(s => {
            const normalizedScriptPath = s.absolutePath.replace(/\\/g, '/').toLowerCase();
            return normalizedScriptPath === normalizedPath ||
                s.absolutePath === item.scriptPath ||
                normalizedScriptPath.endsWith(normalizedPath) ||
                normalizedPath.endsWith(normalizedScriptPath);
        });
    }, [selectedItemIndex, editedPlaylist.items, scripts]);

    // Compute the global execution report for the Output tab
    // This allows the Inspector to show the history of the entire playlist run, irrespective of selection.
    const executionReport = useMemo(() => {
        return Object.entries(executionResults)
            .sort(([indexA], [indexB]) => Number(indexA) - Number(indexB))
            .map(([indexStr, result]) => {
                const index = Number(indexStr);
                const item = editedPlaylist.items[index];
                if (!item) return null;

                // Try to find display name
                const scriptName = item.scriptPath.split(/[\\\/]/).pop()?.replace('.cs', '') || `Step ${index + 1}`;

                return {
                    stepIndex: index,
                    scriptName,
                    result
                };
            })
            .filter((x): x is { stepIndex: number; scriptName: string; result: ExecutionResult } => x !== null);
    }, [executionResults, editedPlaylist.items]);

    const handleUpdateDetails = async (name: string, description: string) => {
        const updatedPlaylist = {
            ...editedPlaylist,
            name,
            description
        };
        setEditedPlaylist(updatedPlaylist);

        // Immediate save to disk to match user expectation
        const success = await updatePlaylist(updatedPlaylist);
        if (success) {
            setIsDirty(false);
        }
    };

    return (
        <div className="h-full flex text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 font-sans">
            <EditPlaylistModal
                isOpen={isEditDetailsModalOpen}
                onClose={() => setIsEditDetailsModalOpen(false)}
                onSubmit={handleUpdateDetails}
                initialName={editedPlaylist.name}
                initialDescription={editedPlaylist.description}
            />
            {/* LEFT: Timeline & Actions (40%) */}
            <div className="w-[40%] flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-10 shadow-lg">
                <PlaylistScriptPicker
                    isOpen={isScriptPickerOpen}
                    onClose={() => setIsScriptPickerOpen(false)}
                    onSelect={handleAddScript}
                />

                {/* Timeline Component */}
                <PlaylistTimeline
                    items={editedPlaylist.items}
                    playlistName={editedPlaylist.name}
                    selectedIndex={selectedItemIndex}
                    onSelect={setSelectedItemIndex}
                    onDelete={handleDeleteItem}
                    onReorder={handleMoveItem}
                    onAdd={() => setIsScriptPickerOpen(true)}
                    onBack={onBack}
                    onEditDetails={() => setIsEditDetailsModalOpen(true)}
                    onRun={handleRunPlaylist}
                    onSave={handleSave}
                    isDirty={isDirty}
                    executionStatus={executionStatus}
                />
            </div>

            {/* RIGHT: Unified Inspector (60%) */}
            <div className="w-[60%] bg-slate-50 dark:bg-slate-950 flex flex-col">
                {selectedItemIndex !== null && editedPlaylist.items[selectedItemIndex] ? (
                    (() => {
                        const currentScriptPath = editedPlaylist.items[selectedItemIndex].scriptPath;
                        // Find the full script object from context
                        const currentScript = scripts.find(s => {
                            const normalizedScriptPath = s.absolutePath.replace(/\\/g, '/').toLowerCase();
                            const normalizedItemPath = currentScriptPath.replace(/\\/g, '/').toLowerCase();
                            return normalizedScriptPath === normalizedItemPath ||
                                s.absolutePath === currentScriptPath ||
                                normalizedScriptPath.endsWith(normalizedItemPath) ||
                                normalizedItemPath.endsWith(normalizedScriptPath);
                        });

                        return currentScript ? (
                            <UnifiedStepInspector
                                key={`${selectedItemIndex}-${currentScript.absolutePath}`}
                                script={currentScript}
                                scriptPath={editedPlaylist.items[selectedItemIndex].scriptPath}
                                savedParameters={editedPlaylist.items[selectedItemIndex].parameters || {}}
                                onUpdateParameters={(newParams) => {
                                    const newItems = [...editedPlaylist.items];
                                    newItems[selectedItemIndex] = {
                                        ...newItems[selectedItemIndex],
                                        parameters: newParams
                                    };
                                    setEditedPlaylist({ ...editedPlaylist, items: newItems });
                                    setIsDirty(true);
                                }}
                                executionReport={executionReport}
                                stepIndex={selectedItemIndex}
                            />
                        ) : null;
                    })()
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-300 dark:text-gray-700">
                        <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                            <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
                        </div>
                        <p className="text-sm font-medium">Select a step to configure</p>
                    </div>
                )}
            </div>
        </div>
    );
};
