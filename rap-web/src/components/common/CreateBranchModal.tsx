import React from 'react';
import { Modal } from './Modal';

interface CreateBranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: () => void;
  newBranchName: string;
  onNewBranchNameChange: (name: string) => void;
  loading: boolean;
}

export const CreateBranchModal: React.FC<CreateBranchModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  newBranchName,
  onNewBranchNameChange,
  loading,
}) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Branch">
      <div className="p-4">
        <label htmlFor="newBranchName" className="block text-sm font-medium text-gray-700 dark:text-gray-200">Branch Name</label>
        <input
          type="text"
          id="newBranchName"
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
          value={newBranchName}
          onChange={(e) => onNewBranchNameChange(e.target.value)}
          disabled={loading}
        />
        <div className="mt-4 flex justify-end space-x-2">
          <button
            type="button"
            className="inline-flex justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={onCreate}
            disabled={loading || !newBranchName.trim()}
          >
            {loading ? 'Creating...' : 'Create Branch'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
