import React, { useState } from 'react';
import { Modal } from '@/components/common/Modal';

interface NewPlaylistModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (name: string, description: string) => void;
}

export const NewPlaylistModal: React.FC<NewPlaylistModalProps> = ({ isOpen, onClose, onSubmit }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (name.trim()) {
            onSubmit(name, description);
            setName('');
            setDescription('');
            onClose();
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create New Playlist">
            <form onSubmit={handleSubmit} className="p-6">
                <div className="mb-4">
                    <label htmlFor="playlistName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Playlist Name
                    </label>
                    <input
                        type="text"
                        id="playlistName"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g., Foundation Setup"
                        autoFocus
                    />
                </div>
                <div className="mb-6">
                    <label htmlFor="playlistDesc" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Description (Optional)
                    </label>
                    <textarea
                        id="playlistDesc"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none h-24"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Briefly describe what this playlist does..."
                    />
                </div>
                <div className="flex justify-end space-x-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!name.trim()}
                    >
                        Create
                    </button>
                </div>
            </form>
        </Modal>
    );
};
