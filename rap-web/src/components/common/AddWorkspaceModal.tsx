import React, { useState } from 'react';
import { Modal } from './Modal';
import { open } from '@tauri-apps/api/dialog';

interface AddWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddWorkspace: (repoUrl: string, localPath: string, pat?: string) => void;
}

export const AddWorkspaceModal: React.FC<AddWorkspaceModalProps> = ({ isOpen, onClose, onAddWorkspace }) => {
  const [repoUrl, setRepoUrl] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [pat, setPat] = useState('');

  const handleSubmit = () => {
    // Basic validation
    if (repoUrl && localPath) {
      onAddWorkspace(repoUrl, localPath, pat);
      onClose(); // Close modal on successful submission
    }
  };

  const handleSelectLocalPath = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
    });
    if (typeof selected === 'string') {
      setLocalPath(selected);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add New Workspace" size="lg">
      <div className="space-y-6 p-2">
        <div>
          <label htmlFor="repoUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Git Repository URL
          </label>
          <input
            type="text"
            id="repoUrl"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/user/repo.git"
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label htmlFor="localPath" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Local Folder Path
          </label>
          {window.__TAURI__ ? (
            <div className="flex items-center space-x-2">
              <input
                type="text"
                id="localPath"
                value={localPath}
                readOnly
                placeholder="Select a folder..."
                className="flex-grow px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                onClick={handleSelectLocalPath}
              />
              <button
                type="button"
                onClick={handleSelectLocalPath}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Browse
              </button>
            </div>
          ) : (
            <input
              type="text"
              id="localPath"
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              placeholder="C:\Users\YourUser\Documents\RAP-Workspaces\my-scripts"
              className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            />
          )}
           <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            The absolute path on your machine where the repository will be cloned.
          </p>
        </div>
        <div>
          <label htmlFor="pat" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Personal Access Token (Optional)
          </label>
          <input
            type="password" // Use type="password" for sensitive input
            id="pat"
            value={pat}
            onChange={(e) => setPat(e.target.value)}
            placeholder="ghp_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Provide a Personal Access Token if your repository requires authentication (e.g., private GitHub repo).
            This will be stored securely in your operating system's credential manager.
          </p>
        </div>
      </div>
      <div className="flex justify-end pt-6">
          <button
            onClick={onClose}
            className="mr-3 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            disabled={!repoUrl || !localPath}
          >
            Add Workspace
          </button>
        </div>
    </Modal>
  );
};
