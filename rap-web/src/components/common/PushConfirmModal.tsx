import React from 'react';
import { Modal } from './Modal';

interface PushConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
}

export const PushConfirmModal: React.FC<PushConfirmModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirm Push" size="sm">
      <div className="p-4 text-gray-700 dark:text-gray-300">
        <p>Are you sure you want to push your changes to the remote repository?</p>
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">This action will make your local changes public.</p>
      </div>
      <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onClose}
          className="mr-3 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500"
          disabled={isLoading}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          disabled={isLoading}
        >
          {isLoading ? 'Pushing...' : 'Push'}
        </button>
      </div>
    </Modal>
  );
};
