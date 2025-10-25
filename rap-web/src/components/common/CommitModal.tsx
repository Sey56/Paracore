import React, { useState } from 'react';
import { Modal } from './Modal';
import { commitChanges } from '@/api/workspaces';
import { useNotifications } from '@/hooks/useNotifications';
import { AxiosError } from 'axios';

interface CommitModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspacePath: string;
  changedFiles: string[];
  onCommitSuccess: () => void;
}

export const CommitModal: React.FC<CommitModalProps> = ({
  isOpen,
  onClose,
  workspacePath,
  changedFiles,
  onCommitSuccess,
}) => {
  const [commitMessage, setCommitMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { showNotification } = useNotifications();

  const handleCommit = async () => {
    if (!commitMessage.trim()) {
      showNotification("Commit message cannot be empty.", "warning");
      return;
    }

    setIsLoading(true);
    try {
      await commitChanges({ workspace_path: workspacePath, message: commitMessage });
      showNotification("Changes committed successfully!", "success");
      onCommitSuccess();
      onClose();
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        showNotification(
          error.response?.data?.detail || "Failed to commit changes.",
          "error"
        );
      } else {
        showNotification("An unexpected error occurred.", "error");
      }
      console.error("Commit error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Commit Changes" size="lg">
      <div className="space-y-4 p-2">
        <div>
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Changed Files:</h3>
          {changedFiles.length > 0 ? (
            <ul className="list-disc list-inside text-sm text-gray-600 dark:text-gray-400 max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 p-3 rounded-md">
              {changedFiles.map((file, index) => (
                <li key={index}>{file.replace(/^\?\s*/, '')}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No uncommitted changes detected.</p>
          )}
        </div>
        <div>
          <label htmlFor="commitMessage" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Commit Message
          </label>
          <textarea
            id="commitMessage"
            rows={4}
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Enter a concise commit message..."
            className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
            disabled={isLoading}
          ></textarea>
        </div>
      </div>
      <div className="flex justify-end pt-6">
        <button
          onClick={onClose}
          className="mr-3 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 dark:bg-gray-600 dark:text-white dark:hover:bg-gray-500"
          disabled={isLoading}
        >
          Cancel
        </button>
        <button
          onClick={handleCommit}
          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
          disabled={isLoading || changedFiles.length === 0}
        >
          {isLoading ? 'Committing...' : 'Commit'}
        </button>
      </div>
    </Modal>
  );
};
