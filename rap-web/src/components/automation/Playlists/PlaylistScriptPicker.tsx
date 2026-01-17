import React, { useState, useMemo } from 'react';
// Force TS re-index
import { Modal } from '@/components/common/Modal';
import { useScripts } from '@/hooks/useScripts';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch } from '@fortawesome/free-solid-svg-icons';

interface ScriptPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (scriptPath: string) => void;
}

export const PlaylistScriptPicker: React.FC<ScriptPickerModalProps> = ({ isOpen, onClose, onSelect }) => {
    const { scripts } = useScripts();
    const [searchTerm, setSearchTerm] = useState('');

    const filteredScripts = useMemo(() => {
        return scripts.filter(script =>
            script.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            script.metadata?.displayName?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [scripts, searchTerm]);

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Select Script" size="2xl">
            <div className="p-4 h-[60vh] flex flex-col">
                <div className="relative mb-4">
                    <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search scripts..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        autoFocus
                    />
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                    {filteredScripts.length === 0 ? (
                        <div className="text-center text-gray-500 mt-10">No scripts found matching your search.</div>
                    ) : (
                        filteredScripts.map(script => (
                            <div
                                key={script.id}
                                className="group flex justify-between items-center p-3 rounded-md border border-gray-200 dark:border-gray-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-all"
                                onClick={() => onSelect(script.absolutePath)}
                            >
                                <div>
                                    <h4 className="font-semibold text-gray-800 dark:text-gray-200 group-hover:text-blue-700 dark:group-hover:text-blue-400">
                                        {script.metadata?.displayName || script.name}
                                    </h4>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[500px]">
                                        {script.metadata?.description || "No description."}
                                    </p>
                                </div>
                                <div className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                    {script.metadata?.documentType || 'General'}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </Modal>
    );
};
