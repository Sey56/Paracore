import React, { useState, useEffect, useMemo, useRef } from 'react';
// Force TS re-index
import { Playlist, PlaylistItem } from '@/types/playlistModel';
import { ScriptParameter } from '@/types/scriptModel';
import { ExecutionResult } from '@/types/common';
import { usePlaylist } from '../../index';
import { useScriptExecution } from '../../index';
import { useScripts } from '../../index';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { PlaylistScriptPicker } from './PlaylistScriptPicker';
import { PlaylistTimeline } from './PlaylistTimeline';
import { EditPlaylistModal } from './EditPlaylistModal';
import { PlaylistStepConfig } from './PlaylistStepConfig';

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
    const [configuringStepIndex, setConfiguringStepIndex] = useState<number | null>(null);
    const [isScriptPickerOpen, setIsScriptPickerOpen] = useState(false);
    const [isEditDetailsModalOpen, setIsEditDetailsModalOpen] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    const [executionStatus, setExecutionStatus] = useState<Record<number, 'pending' | 'running' | 'success' | 'error'>>({});
    const [executionResults, setExecutionResults] = useState<Record<number, ExecutionResult>>({});

    const { setSelectedScript, runScript } = useScriptExecution();

    // ISOLATION FIX: Clear global inspector on mount to prevent state leakage
    useEffect(() => {
        setSelectedScript(null);
    }, [setSelectedScript]);

    // Auto-select first item on mount or when playlist identity changes
    const prevPlaylistIdRef = useRef<string | null>(null);
    useEffect(() => {
        const currentId = playlist.filePath || playlist.name;
        if (editedPlaylist.items.length > 0 && (selectedItemIndex === null || prevPlaylistIdRef.current !== currentId)) {
            setSelectedItemIndex(0);
        }
        prevPlaylistIdRef.current = currentId;
    }, [editedPlaylist.items.length, selectedItemIndex, playlist.filePath, playlist.name]);

    // Sync state if prop changes
    useEffect(() => {
        const cloned = JSON.parse(JSON.stringify(playlist));
        setEditedPlaylist(cloned);
        setIsDirty(false);
        setSelectedItemIndex(null);
        setConfiguringStepIndex(null);

        // Restore previous execution results and statuses if they exist
        if (playlist.lastExecutionResults) {
            setExecutionResults(playlist.lastExecutionResults);
            const initialStatus: Record<number, 'success' | 'error'> = {};
            Object.entries(playlist.lastExecutionResults).forEach(([indexStr, result]) => {
                const index = Number(indexStr);
                initialStatus[index] = result.isSuccess ? 'success' : 'error';
            });
            setExecutionStatus(initialStatus);
        } else {
            setExecutionStatus({});
            setExecutionResults({});
        }
    }, [playlist]);

    const handleSave = async () => {
        console.log('[PlaylistEditor] handleSave called', {
            name: editedPlaylist.name,
            filePath: editedPlaylist.filePath,
            itemCount: editedPlaylist.items.length,
            items: editedPlaylist.items.map(i => i.scriptPath),
        });
        const success = await updatePlaylist(editedPlaylist);
        console.log('[PlaylistEditor] handleSave result:', success);
        if (success) {
            setIsDirty(false);
        }
    };

    // Helper to run and save (local accumulation)
    const handleRunPlaylistAndSave = async () => {
        if (isDirty) {
            await handleSave();
        }

        setExecutionStatus({}); // Reset status
        const newResults: Record<number, ExecutionResult> = {};

        for (let i = 0; i < editedPlaylist.items.length; i++) {
            const item = editedPlaylist.items[i];
            setExecutionStatus(prev => ({ ...prev, [i]: 'running' }));
            setSelectedItemIndex(i);

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
                return;
            }

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

            try {
                const result = await runScript(script, finalParams, true);
                if (result) {
                    setExecutionResults(prev => ({ ...prev, [i]: result }));
                    newResults[i] = result;

                    if (result.isSuccess) {
                        setExecutionStatus(prev => ({ ...prev, [i]: 'success' }));
                    } else {
                        setExecutionStatus(prev => ({ ...prev, [i]: 'error' }));
                        break; // Stop on error
                    }
                } else {
                    setExecutionStatus(prev => ({ ...prev, [i]: 'error' }));
                    break;
                }
            } catch (err: unknown) {
                setExecutionStatus(prev => ({ ...prev, [i]: 'error' }));
                break;
            }
        }

        // Final Save
        const finalPlaylist = {
            ...editedPlaylist,
            lastExecutionResults: newResults
        };
        setEditedPlaylist(finalPlaylist);
        await updatePlaylist(finalPlaylist);
    };

    const handleDeleteItem = (index: number) => {
        const newItems = [...editedPlaylist.items];
        newItems.splice(index, 1);
        setEditedPlaylist({ ...editedPlaylist, items: newItems });
        if (selectedItemIndex === index) setSelectedItemIndex(null);
        if (configuringStepIndex === index) setConfiguringStepIndex(null);
        if (selectedItemIndex !== null && selectedItemIndex > index) setSelectedItemIndex(selectedItemIndex - 1);
        if (configuringStepIndex !== null && configuringStepIndex > index) setConfiguringStepIndex(configuringStepIndex - 1);
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
        if (configuringStepIndex === index) setConfiguringStepIndex(targetIndex);
        setIsDirty(true);
    };

    const handleAddScript = (scriptPath: string) => {
        const newItem: PlaylistItem = {
            scriptPath: scriptPath,
            parameters: {} // Empty initial parameters
        };
        const newIndex = editedPlaylist.items.length;
        setEditedPlaylist({
            ...editedPlaylist,
            items: [...editedPlaylist.items, newItem]
        });
        setSelectedItemIndex(newIndex);
        setConfiguringStepIndex(newIndex); // Auto-navigate to config for the new step
        setIsDirty(true);
        setIsScriptPickerOpen(false);
    };

    // Step selection — highlight in timeline and navigate to config
    const handleStepSelect = (index: number) => {
        setSelectedItemIndex(index);
        setConfiguringStepIndex(index);
    };

    // Back from config view to timeline
    const handleBackFromConfig = () => {
        setConfiguringStepIndex(null);
    };

    // Update parameters for a specific step
    const handleStepParameterUpdate = (newParams: Record<string, string | number | boolean>) => {
        if (configuringStepIndex === null) return;
        const newItems = [...editedPlaylist.items];
        newItems[configuringStepIndex] = {
            ...newItems[configuringStepIndex],
            parameters: newParams
        };
        setEditedPlaylist({ ...editedPlaylist, items: newItems });
        setIsDirty(true);
    };

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

    // Find the script for the currently configuring step
    const configuringItem = configuringStepIndex !== null ? editedPlaylist.items[configuringStepIndex] : null;
    const configuringScript = useMemo(() => {
        if (configuringItem === null) return null;
        const normalizedPath = configuringItem.scriptPath.replace(/\\/g, '/').toLowerCase();

        return scripts.find(s => {
            const normalizedScriptPath = s.absolutePath.replace(/\\/g, '/').toLowerCase();
            return normalizedScriptPath === normalizedPath ||
                s.absolutePath === configuringItem.scriptPath ||
                normalizedScriptPath.endsWith(normalizedPath) ||
                normalizedPath.endsWith(normalizedScriptPath);
        }) || null;
    }, [configuringItem, scripts]);

    return (
        <div className="h-full flex flex-col text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-[var(--bg-ground)] font-sans">
            <EditPlaylistModal
                isOpen={isEditDetailsModalOpen}
                onClose={() => setIsEditDetailsModalOpen(false)}
                onSubmit={handleUpdateDetails}
                initialName={editedPlaylist.name}
                initialDescription={editedPlaylist.description}
            />
            <PlaylistScriptPicker
                isOpen={isScriptPickerOpen}
                onClose={() => setIsScriptPickerOpen(false)}
                onSelect={handleAddScript}
            />

            {configuringStepIndex !== null && configuringItem && configuringScript ? (
                /* Inline Step Config View */
                <PlaylistStepConfig
                    key={`config-${configuringStepIndex}`}
                    script={configuringScript}
                    scriptPath={configuringItem.scriptPath}
                    savedParameters={configuringItem.parameters || {}}
                    onUpdateParameters={handleStepParameterUpdate}
                    onBack={handleBackFromConfig}
                    stepIndex={configuringStepIndex}
                />
            ) : configuringStepIndex !== null && !configuringScript ? (
                /* Script not found fallback */
                <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
                    <p className="text-sm font-medium">Script not found</p>
                    <p className="text-xs text-gray-300 dark:text-gray-600">{configuringItem?.scriptPath}</p>
                    <button
                        onClick={handleBackFromConfig}
                        className="mt-2 px-4 py-2 text-xs font-bold text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                    >
                        <FontAwesomeIcon icon={faArrowLeft} className="mr-2" />
                        Back to Steps
                    </button>
                </div>
            ) : (
                /* Playlist Timeline (full width, no right panel) */
                <PlaylistTimeline
                    items={editedPlaylist.items}
                    playlistName={editedPlaylist.name}
                    selectedIndex={selectedItemIndex}
                    onSelect={handleStepSelect}
                    onDelete={handleDeleteItem}
                    onReorder={handleMoveItem}
                    onAdd={() => setIsScriptPickerOpen(true)}
                    onBack={onBack}
                    onEditDetails={() => setIsEditDetailsModalOpen(true)}
                    onRun={handleRunPlaylistAndSave}
                    onSave={handleSave}
                    isDirty={isDirty}
                    executionStatus={executionStatus}
                />
            )}
        </div>
    );
};
