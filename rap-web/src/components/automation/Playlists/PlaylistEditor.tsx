import React, { useState, useEffect, useMemo } from 'react';
// Force TS re-index
import { Playlist, PlaylistItem } from '@/types/playlistModel';
import { usePlaylist } from '@/hooks/usePlaylist';
import { useScriptExecution } from '@/hooks/useScriptExecution';
import { useScripts } from '@/hooks/useScripts';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faSave, faPlay } from '@fortawesome/free-solid-svg-icons';
import { useNotifications } from '@/hooks/useNotifications';
import { PlaylistScriptPicker } from './PlaylistScriptPicker';
import { PlaylistTimeline } from './PlaylistTimeline';
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
    const [isDirty, setIsDirty] = useState(false);

    const { setSelectedScript } = useScriptExecution();

    // ISOLATION FIX: Clear global inspector on mount AND unmount to prevent state leakage
    useEffect(() => {
        setSelectedScript(null);
        return () => {
            setSelectedScript(null);
        };
    }, [setSelectedScript]);

    // Sync state if prop changes
    useEffect(() => {
        setEditedPlaylist(JSON.parse(JSON.stringify(playlist)));
        setIsDirty(false);
        setSelectedItemIndex(null);
    }, [playlist]);

    const handleSave = async () => {
        const success = await updatePlaylist(editedPlaylist);
        if (success) {
            setIsDirty(false);
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

    return (
        <div className="flex h-full flex-col bg-white dark:bg-gray-900 overflow-hidden">
            {/* Main Content - Split View (Timeline | Workstation) */}
            <div className="flex-1 overflow-hidden">
                <div className="h-full grid grid-cols-12">
                    {/* Left Column: Timeline (40%) - Now Includes Header */}
                    <div className="col-span-12 lg:col-span-5 h-full overflow-hidden border-r border-gray-200 dark:border-gray-800">
                        <PlaylistTimeline
                            items={editedPlaylist.items}
                            selectedIndex={selectedItemIndex}
                            onSelect={setSelectedItemIndex}
                            onReorder={handleMoveItem}
                            onDelete={handleDeleteItem}
                            onAdd={() => setIsScriptPickerOpen(true)}
                            // Header Props
                            playlistName={editedPlaylist.name}
                            onBack={onBack}
                            onRun={() => {/* TODO: Run Logic */ }}
                            onSave={handleSave}
                            isDirty={isDirty}
                        />
                    </div>

                    {/* Right Column: Unified Inspector (60%) */}
                    <div className="col-span-12 lg:col-span-7 h-full overflow-hidden bg-gray-50/50 dark:bg-gray-900">
                        {currentScript && selectedItemIndex !== null ? (
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
                                stepIndex={selectedItemIndex}
                            />
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
            </div>

            {/* Script Picker Modal */}
            {isScriptPickerOpen && (
                <PlaylistScriptPicker
                    isOpen={isScriptPickerOpen}
                    onClose={() => setIsScriptPickerOpen(false)}
                    onSelect={handleAddScript}
                />
            )}
        </div>
    );
};
