import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faSave, faFolderOpen } from '@fortawesome/free-solid-svg-icons';
import { useTheme } from '@/context/ThemeContext';
import api from '@/api/axios';
import axios from 'axios';
import { Modal } from '../common/Modal';
import { open } from '@tauri-apps/api/dialog';

interface SaveToLibraryModalProps {
    isOpen: boolean;
    onClose: () => void;
    generatedCode: string;
    generatedFiles: Record<string, string> | null;
    taskDescription: string;
    onSaveSuccess: () => void;
}

export const SaveToLibraryModal: React.FC<SaveToLibraryModalProps> = ({
    isOpen,
    onClose,
    generatedCode,
    generatedFiles,
    taskDescription,
    onSaveSuccess,
}) => {
    const { theme } = useTheme();

    const [scriptName, setScriptName] = useState('');
    const [targetFolder, setTargetFolder] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Initialize fields when modal opens
    useEffect(() => {
        if (isOpen) {
            // Suggest a name based on task
            if (generatedFiles && Object.keys(generatedFiles).some(f => f.toLowerCase() === 'main.cs')) {
                setScriptName('Main.cs');
            } else {
                const sanitized = taskDescription
                    .replace(/[^a-zA-Z0-9\s]/g, '')
                    .split(' ')
                    .slice(0, 4) // Keep it short
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join('');
                setScriptName(sanitized + ".cs" || 'NewScript.cs');
            }

            // Default path from settings
            const savedPath = localStorage.getItem('agentScriptsPath') || '';
            setTargetFolder(savedPath);
        }
    }, [isOpen, taskDescription]);

    const handleBrowseValues = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: 'Select Destination Folder',
                defaultPath: targetFolder || undefined
            });

            if (selected && typeof selected === 'string') {
                setTargetFolder(selected);
            }
        } catch (error) {
            console.error('Failed to open folder dialog:', error);
        }
    };

    const handleSave = async () => {
        if (!scriptName.trim()) {
            alert('Please enter a script name');
            return;
        }
        if (!targetFolder.trim()) {
            alert('Please select a target folder');
            return;
        }

        // Ensure extension
        let finalName = scriptName;
        if (!finalName.endsWith('.cs')) {
            finalName += '.cs';
        }

        setIsSaving(true);

        try {
            await api.post('/generation/save_to_library', {
                script_code: generatedCode,
                script_name: finalName,
                target_directory: targetFolder,
                files: generatedFiles
            });

            onSaveSuccess();
            onClose();
        } catch (error: unknown) {
            console.error('Save error:', error);
            if (axios.isAxiosError(error)) {
                alert(error.response?.data?.detail || 'Failed to save script');
            } else {
                alert('Failed to save script');
            }
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Save Script" size="lg">
            <div className="space-y-6">

                {/* Script Name */}
                <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Script Name</label>
                    <input
                        type="text"
                        value={scriptName}
                        onChange={(e) => setScriptName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
                        placeholder="MyScript.cs"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        {generatedFiles
                            ? `Saving ${Object.keys(generatedFiles).length} files to folder. "${scriptName}" will be the entry point.`
                            : "File will be saved as a C# source file."
                        }
                    </p>
                </div>

                {/* Target Folder */}
                <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Target Folder</label>
                    <div className="flex space-x-2">
                        <input
                            type="text"
                            value={targetFolder}
                            readOnly
                            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-800 text-sm text-gray-600 dark:text-gray-400 cursor-not-allowed"
                            placeholder="No folder selected"
                        />
                        <button
                            onClick={handleBrowseValues}
                            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-200 transition-colors"
                            title="Browse Folder"
                        >
                            <FontAwesomeIcon icon={faFolderOpen} />
                        </button>
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-6 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 flex items-center transition-colors shadow-sm"
                    >
                        <FontAwesomeIcon icon={faSave} className="mr-2" />
                        {isSaving ? 'Saving...' : 'Save Script'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};
