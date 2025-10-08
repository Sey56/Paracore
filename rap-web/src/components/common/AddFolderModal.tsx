import React, { useState } from 'react';
import { Modal } from './Modal';

interface AddFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddFolder: (folderPath: string) => void;
}

export const AddFolderModal: React.FC<AddFolderModalProps> = ({ isOpen, onClose, onAddFolder }) => {
  const [folderPath, setFolderPath] = useState('');

  const handleSubmit = () => {
    if (folderPath.trim()) {
      onAddFolder(folderPath);
      setFolderPath('');
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Local Script Folder">
      <div className="p-4">
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          Enter the absolute path to your local script folder.
        </p>
        <input
          type="text"
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder="e.g., C:\Users\YourUser\Documents\MyScripts"
          value={folderPath}
          onChange={(e) => setFolderPath(e.target.value)}
        />
        <div className="mt-4 flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Add Folder
          </button>
        </div>
      </div>
    </Modal>
  );
};
