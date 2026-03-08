import React, { useState } from 'react';
import { Modal } from '@/components/common/Modal';
import { open } from '@tauri-apps/api/dialog';

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

  const handleBrowse = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
    });
    if (typeof selected === 'string') {
      setFolderPath(selected);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add Local Script Folder">
      <div className="p-4">
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
          Enter the absolute path to your local script folder.
        </p>
        <div className="flex items-center space-x-2">
          <input
            type="text"
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="e.g., C:\Users\YourUser\Documents\MyScripts"
            value={folderPath}
            onChange={(e) => setFolderPath(e.target.value)}
          />
          {'__TAURI_INTERNALS__' in window && (
            <button
              type="button"
              onClick={handleBrowse}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Browse
            </button>
          )}
        </div>
        <div className="mt-4 flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-600 rounded-md hover:bg-slate-300 dark:hover:bg-slate-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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
