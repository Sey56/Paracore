import React, { useState, useEffect, useCallback } from 'react';
import { AddWorkspaceModal } from '../common/AddWorkspaceModal'; // Updated import path
import { getWorkspaceStatus, syncWorkspace } from '@/api/workspaces';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useScripts } from '@/hooks/useScripts';
import { TrashIcon, ArrowPathIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/hooks/useAuth';
import { AxiosError } from 'axios';

interface GitStatus {
  branch_info: {
    branch: string;
    remote_branch?: string;
    ahead?: number;
    behind?: number;
  };
  changed_files: string[];
}

interface ApiResponseError {
  response?: {
    data?: {
      detail?: string;
    };
  };
}

interface WorkspaceSettingsProps {
  isAuthenticated: boolean;
}

const WorkspaceSettings: React.FC<WorkspaceSettingsProps> = ({ isAuthenticated }) => {
  const { workspaces, cloneAndAddWorkspace, removeWorkspace, setActiveWorkspaceId, activeWorkspace } = useWorkspaces();
  const { clearScripts, clearScriptsForWorkspace } = useScripts();
  const { user } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const { showNotification } = useNotifications();



  const handleAddWorkspace = async (repoUrl: string, localPath: string, pat?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await cloneAndAddWorkspace({ repo_url: repoUrl, local_path: localPath, pat: pat });
    } catch (err: unknown) {
      const apiError = err as ApiResponseError;
      const errorMessage = apiError.response?.data?.detail || "Failed to add workspace. Please check the repository URL and local path.";
      setError(errorMessage);
      showNotification(errorMessage, "error");
      console.error(err);
    } finally {
      setIsLoading(false);
      setIsModalOpen(false);
    }
  };

  const handleRemoveWorkspace = (id: string) => {
    const workspaceToRemove = workspaces.find(ws => ws.id === id);
    if (workspaceToRemove) {
      clearScriptsForWorkspace(workspaceToRemove.path);
    }
    removeWorkspace(id);
    if (activeWorkspace?.id === id) {
      clearScripts();
    }
  };

  const fetchGitStatus = useCallback(async () => {
    if (!activeWorkspace) {
      setGitStatus(null);
      return;
    }
    try {
      const status = await getWorkspaceStatus(activeWorkspace.path);
      setGitStatus(status);
    } catch (err: unknown) {
      const apiError = err as ApiResponseError;
      console.error("Failed to fetch Git status:", err);
      setGitStatus(null);
      showNotification(apiError.response?.data?.detail || "Failed to fetch Git status.", "error");
    }
  }, [activeWorkspace, showNotification]);

  useEffect(() => {
    fetchGitStatus();
    const interval = setInterval(fetchGitStatus, 60000);
    return () => clearInterval(interval);
  }, [fetchGitStatus]);

  const handleSyncWorkspace = async () => {
    if (!activeWorkspace) return;
    setIsSyncing(true);
    try {
      await syncWorkspace({ path: activeWorkspace.path });
      showNotification("Workspace synced successfully!", "success");
      await fetchGitStatus();
    } catch (err: unknown) {
      const apiError = err as ApiResponseError;
      showNotification(apiError.response?.data?.detail || "Failed to sync workspace.", "error");
      console.error("Sync error:", err);
    } finally {
      setIsSyncing(false);
    }
  };

  const hasChangesToPull = gitStatus?.branch_info.behind && gitStatus.branch_info.behind > 0;
  const hasChangesToPush = gitStatus?.branch_info.ahead && gitStatus.branch_info.ahead > 0;
  const hasUncommittedChanges = gitStatus?.changed_files && gitStatus.changed_files.length > 0;
  const isUpToDate = !hasChangesToPull && !hasChangesToPush && !hasUncommittedChanges;

  return (
    <>
      <AddWorkspaceModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAddWorkspace={handleAddWorkspace}
      />
      <fieldset disabled={!isAuthenticated} className="disabled:opacity-50">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Workspaces</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Manage your Git-connected workspaces. Each workspace represents a repository for your automation scripts.
        </p>
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        <div className="space-y-6">
          <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              disabled={isLoading || !isAuthenticated}
            >
              {isLoading ? 'Adding...' : 'Add Workspace'}
            </button>
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Existing Workspaces</h3>
            {workspaces.length === 0 ? (
              <div className="p-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center">
                <p className="text-gray-500 dark:text-gray-400">No workspaces configured yet.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {workspaces.map((ws) => (
                  <li
                    key={ws.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${activeWorkspace?.id === ws.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">{ws.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{ws.path}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setActiveWorkspaceId(ws.id)}
                        className={`px-3 py-1 text-sm rounded-md ${activeWorkspace?.id === ws.id ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'}`}
                      >
                        {activeWorkspace?.id === ws.id ? 'Active' : 'Set Active'}
                      </button>
                      <button
                        onClick={() => handleRemoveWorkspace(ws.id)}
                        className="p-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 rounded-md"
                        title="Remove Workspace"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {activeWorkspace && (
            <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Active Workspace Status</h3>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-sm">
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-1">
                  Branch: <span className="font-mono">{gitStatus?.branch_info.branch || 'N/A'}</span>
                  {gitStatus?.branch_info.remote_branch && (
                    <span> (tracking <span className="font-mono">{gitStatus.branch_info.remote_branch}</span>)</span>
                  )}
                </p>
                {gitStatus && (
                  <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
                    {hasChangesToPull && (
                      <span className="text-orange-500 flex items-center">
                        <ArrowDownTrayIcon className="h-4 w-4 mr-1" /> Behind {gitStatus.branch_info.behind}
                      </span>
                    )}
                    {hasChangesToPush && (
                      <span className="text-green-500 flex items-center">
                        <ArrowUpTrayIcon className="h-4 w-4 mr-1" /> Ahead {gitStatus.branch_info.ahead}
                      </span>
                    )}
                    {hasUncommittedChanges && (
                      <span className="text-red-500 flex items-center">
                        <ArrowPathIcon className="h-4 w-4 mr-1" /> Uncommitted Changes
                      </span>
                    )}
                    {isUpToDate && (
                      <span className="text-gray-500">Up to Date</span>
                    )}
                  </div>
                )}

                {hasUncommittedChanges && (
                  <div className="mt-3">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Uncommitted Files:</p>
                    <ul className="list-disc list-inside text-xs text-gray-600 dark:text-gray-400 max-h-20 overflow-y-auto">
                      {gitStatus?.changed_files?.map((file, index) => (
                        <li key={index}>{file}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4 flex space-x-3">
                  <button
                    onClick={handleSyncWorkspace}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center"
                    disabled={isSyncing || (!hasChangesToPull && !hasChangesToPush && !hasUncommittedChanges)}
                  >
                    {isSyncing ? 'Syncing...' : 'Sync Workspace'}
                    <ArrowPathIcon className="h-4 w-4 ml-2" />
                  </button>
                  {/* Commit button will be handled by CommitModal, which is triggered elsewhere */}
                </div>
              </div>
            </div>
          )}
        </div>
      </fieldset>
    </>
  );
};

export default WorkspaceSettings;