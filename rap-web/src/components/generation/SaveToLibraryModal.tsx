import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faSave } from '@fortawesome/free-solid-svg-icons';
import { useTheme } from '@/context/ThemeContext';
import api from '@/api/axios';
import axios from 'axios';

interface SaveToLibraryModalProps {
    isOpen: boolean;
    onClose: () => void;
    generatedCode: string;
    taskDescription: string;
    onSaveSuccess: () => void;
}

import { Modal } from '../common/Modal';

// ... other imports ...

export const SaveToLibraryModal: React.FC<SaveToLibraryModalProps> = ({
    isOpen,
    onClose,
    generatedCode,
    taskDescription,
    onSaveSuccess,
}) => {
    const { theme } = useTheme();

    const [scriptName, setScriptName] = useState('');
    const [category, setCategory] = useState('01_Element_Creation');
    const [subCategory, setSubCategory] = useState('');
    const [documentType, setDocumentType] = useState('Project');
    const [categories, setCategories] = useState('Architectural');
    const [author, setAuthor] = useState('');
    const [description, setDescription] = useState('');
    const [usageExamples, setUsageExamples] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // ... (logic remains same) ...
    // Copy the logic from lines 34-129 exactly
    // Available categories (from Agent-Library structure)
    const availableCategories = [
        '01_Element_Creation',
        '02_Geometry_Modeling',
        '03_Parameter_Management',
        '04_View_Management',
        '05_Documentation',
        '06_Analysis_Reporting',
        '07_Modification_Editing',
        '08_Selection_Filtering',
        '09_Family_Management',
        '10_Utilities',
    ];

    // Sub-categories based on selected category
    const subCategories: Record<string, string[]> = {
        '01_Element_Creation': ['Walls', 'Doors_Windows', 'Buildings', 'Floors', 'Roofs', 'Columns'],
        '02_Geometry_Modeling': ['Curves', 'Surfaces', 'Solids'],
        '03_Parameter_Management': ['Read', 'Write', 'Create'],
        '07_Modification_Editing': ['Walls', 'Elements', 'Parameters'],
        '08_Selection_Filtering': ['ByCategory', 'ByParameter', 'ByLocation'],
    };

    // Pre-fill fields when modal opens
    useEffect(() => {
        if (isOpen) {
            // Sanitize task description for script name
            const sanitized = taskDescription
                .replace(/[^a-zA-Z0-9\s]/g, '')
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join('');
            setScriptName(sanitized || 'GeneratedScript');

            // Pre-fill description
            setDescription(taskDescription);

            // Pre-fill usage examples
            setUsageExamples(taskDescription);

            // Get author from localStorage or default
            const savedAuthor = localStorage.getItem('scriptAuthor') || 'Unknown';
            setAuthor(savedAuthor);
        }
    }, [isOpen, taskDescription]);

    const handleSave = async () => {
        if (!scriptName.trim()) {
            alert('Please enter a script name');
            return;
        }

        setIsSaving(true);

        try {
            // Get library path from settings
            const libraryPath = localStorage.getItem('agentScriptsPath') || '';
            if (!libraryPath) {
                alert('Agent Scripts Path not configured in settings');
                return;
            }

            // Parse usage examples (one per line)
            const examplesArray = usageExamples
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            await api.post('/generation/save_to_library', {
                script_code: generatedCode,
                script_name: scriptName,
                library_path: libraryPath,
                category,
                sub_category: subCategory,
                metadata: {
                    documentType,
                    categories,
                    author,
                    description,
                    usageExamples: examplesArray,
                    dependencies: 'RevitAPI 2025, CoreScript.Engine, RServer.Addin',
                },
            });

            // Save author to localStorage for next time
            localStorage.setItem('scriptAuthor', author);

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
        <Modal isOpen={isOpen} onClose={onClose} title="Save Script to Library" size="2xl">
            {/* Body */}
            <div className="space-y-4 max-h-[70vh] overflow-y-auto">
                {/* Script Name */}
                <div>
                    <label className="block text-sm font-medium mb-1 dark:text-gray-300">Script Name:</label>
                    <input
                        type="text"
                        value={scriptName}
                        onChange={(e) => setScriptName(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm dark:text-white"
                        placeholder="MyScript.cs"
                    />
                </div>

                {/* Location */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1 dark:text-gray-300">Category:</label>
                        <select
                            value={category}
                            onChange={(e) => {
                                setCategory(e.target.value);
                                setSubCategory('');
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm dark:text-white"
                        >
                            {availableCategories.map(cat => (
                                <option key={cat} value={cat}>{cat}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1 dark:text-gray-300">Sub-Category (Optional):</label>
                        <select
                            value={subCategory}
                            onChange={(e) => setSubCategory(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm dark:text-white"
                        >
                            <option value="">None</option>
                            {(subCategories[category] || []).map(sub => (
                                <option key={sub} value={sub}>{sub}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Metadata Section */}
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <h3 className="text-sm font-bold mb-3 dark:text-white">Metadata</h3>

                    {/* Document Type */}
                    <div className="mb-3">
                        <label className="block text-sm font-medium mb-1 dark:text-gray-300">Document Type:</label>
                        <select
                            value={documentType}
                            onChange={(e) => setDocumentType(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm dark:text-white"
                        >
                            <option value="Project">Project</option>
                            <option value="Family">Family</option>
                        </select>
                    </div>

                    {/* Categories */}
                    <div className="mb-3">
                        <label className="block text-sm font-medium mb-1 dark:text-gray-300">Categories (comma-separated):</label>
                        <input
                            type="text"
                            value={categories}
                            onChange={(e) => setCategories(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm dark:text-white"
                            placeholder="Architectural, Structural"
                        />
                    </div>

                    {/* Author */}
                    <div className="mb-3">
                        <label className="block text-sm font-medium mb-1 dark:text-gray-300">Author:</label>
                        <input
                            type="text"
                            value={author}
                            onChange={(e) => setAuthor(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm dark:text-white"
                            placeholder="Your Name"
                        />
                    </div>

                    {/* Description */}
                    <div className="mb-3">
                        <label className="block text-sm font-medium mb-1 dark:text-gray-300">Description:</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm resize-none dark:text-white"
                            rows={3}
                            placeholder="Describe what this script does..."
                        />
                    </div>

                    {/* Usage Examples */}
                    <div>
                        <label className="block text-sm font-medium mb-1 dark:text-gray-300">Usage Examples (one per line):</label>
                        <textarea
                            value={usageExamples}
                            onChange={(e) => setUsageExamples(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-sm resize-none dark:text-white"
                            rows={3}
                            placeholder="Create a 10x20 house&#10;Generate rectangular building"
                        />
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 flex items-center"
                    >
                        <FontAwesomeIcon icon={faSave} className="mr-2" />
                        {isSaving ? 'Saving...' : 'Save Script'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};
