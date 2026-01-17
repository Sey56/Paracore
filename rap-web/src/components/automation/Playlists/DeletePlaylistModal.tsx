import React from 'react';
import { Modal } from '@/components/common/Modal';

interface DeletePlaylistModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    playlistName: string;
}

export const DeletePlaylistModal: React.FC<DeletePlaylistModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    playlistName
}) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Delete Playlist">
            <div className="p-6">
                <p className="text-gray-700 dark:text-gray-300 mb-6">
                    Are you sure you want to delete the playlist <span className="font-bold text-gray-900 dark:text-gray-100">"{playlistName}"</span>?
                    This action cannot be undone.
                </p>

                <div className="flex justify-end space-x-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </Modal>
    );
};
