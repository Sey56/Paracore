import React, { useEffect, useState, useCallback } from 'react';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { getWorkspaceStatus, syncWorkspace } from '@/api/workspaces';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUpload, faDownload, faCodeBranch, faSyncAlt, faArrowDown } from '@fortawesome/free-solid-svg-icons';
import { faGitAlt } from '@fortawesome/free-brands-svg-icons';
import { CommitModal } from '@/components/common/CommitModal';
import { useNotifications } from '@/hooks/useNotifications';
import { useUI } from '@/hooks/useUI';
import { useAuth } from '@/hooks/useAuth'; // Import useAuth

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
      detail?: string | { loc: string[]; msg: string; type: string }[];
    };
  };
}

export const GitStatusPanel: React.FC = () => {
  const { activeScriptSource } = useUI();
  const { workspaces } = useWorkspaces();
  const { showNotification } = useNotifications();
  const { user, isAuthenticated } = useAuth(); // Get user and isAuthenticated from auth context
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentWorkspace = activeScriptSource?.type === 'workspace'
    ? workspaces.find(ws => ws.id === activeScriptSource.id)
    : null;

  const canCommitAndPush = isAuthenticated;

  const fetchStatus = useCallback(async () => {
    if (!currentWorkspace) {
      setStatus(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getWorkspaceStatus(currentWorkspace.path);
      setStatus(data);
    } catch (err: unknown) {
      const apiError = err as ApiResponseError;
      let errorMessage = "Failed to fetch Git status.";
      if (apiError?.response?.data?.detail) {
        errorMessage = typeof apiError.response.data.detail === 'string' ? apiError.response.data.detail : JSON.stringify(apiError.response.data.detail);
      }
      setError(errorMessage);
      console.error("Error fetching Git status:", err);
    } finally {
      setLoading(false);
    }
  }, [currentWorkspace]);

  const handleSync = async () => {
    if (!currentWorkspace) return;
    setLoading(true);
    setError(null);
    try {
      const actionName = "Syncing";
      showNotification(`${actionName} workspace...`, "info");
      await syncWorkspace({ path: currentWorkspace.path });
      showNotification(`Workspace ${actionName.toLowerCase()}ed successfully!`, "success");
      fetchStatus();
    } catch (err: unknown) {
      let errorMessage = "Failed to sync workspace.";
      const apiError = err as ApiResponseError;
      if (apiError?.response?.data?.detail) {
        errorMessage = typeof apiError.response.data.detail === 'string' ? apiError.response.data.detail : JSON.stringify(apiError.response.data.detail);
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      showNotification(errorMessage, "error");
      console.error("Sync error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setStatus(null); // Clear status if not authenticated
      return;
    }
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [currentWorkspace, fetchStatus, isAuthenticated]);

  if (activeScriptSource?.type !== 'workspace' || !currentWorkspace) {
    return null;
  }

  return (
    <div className="bg-gray-100 dark:bg-gray-900 p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-sm">
      <CommitModal
        isOpen={isCommitModalOpen}
        onClose={() => setIsCommitModalOpen(false)}
        workspacePath={currentWorkspace.path}
        changedFiles={status?.changed_files || []}
        onCommitSuccess={fetchStatus}
      />
      <div className="flex items-center space-x-3">
        <FontAwesomeIcon icon={faGitAlt} className="text-orange-500 text-lg" />
        {loading ? (
          <span className="text-gray-600 dark:text-gray-400">Loading status...</span>
        ) : error ? (
          <span className="text-red-500">Error: {error}</span>
        ) : status ? (
          <>
            <span className="font-medium text-gray-800 dark:text-gray-200">
              <FontAwesomeIcon icon={faCodeBranch} className="mr-1" />
              {status.branch_info.branch}
            </span>
            {status.branch_info.ahead !== undefined && status.branch_info.ahead > 0 && (
              <span className="text-blue-500 ml-2">
                <FontAwesomeIcon icon={faUpload} className="mr-1" />
                {status.branch_info.ahead}
              </span>
            )}
            {status.branch_info.behind !== undefined && status.branch_info.behind > 0 && (
              <span className="text-green-500 ml-2">
                <FontAwesomeIcon icon={faDownload} className="mr-1" />
                {status.branch_info.behind}
              </span>
            )}
            {status.changed_files.length > 0 && (
              <span className="text-yellow-500 ml-2">
                {status.changed_files.length} uncommitted changes
              </span>
            )}
            {status.branch_info.ahead === 0 && status.branch_info.behind === 0 && status.changed_files.length === 0 && (
              <span className="text-gray-500 dark:text-gray-400">Up to date</span>
            )}
          </>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">No Git status available.</span>
        )}
      </div>
      <div className="flex items-center space-x-2">
        <div className="relative" title={!isAuthenticated ? "You must sign in to sync" : ""}>
          <button 
            onClick={handleSync}
            className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={
              loading || 
              !isAuthenticated || 
              !status || 
              (status.branch_info.ahead === 0 && status.branch_info.behind === 0)
            }
          >
            <FontAwesomeIcon icon={faSyncAlt} className="mr-2" />
            Sync
          </button>
        </div>
        <div className="relative" title={!isAuthenticated ? "You must sign in to commit" : ""}>
          <button
            onClick={() => setIsCommitModalOpen(true)}
            className="px-3 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || !status?.changed_files || status.changed_files.length === 0 || !isAuthenticated || !canCommitAndPush}
          >
            Commit
          </button>
        </div>
      </div>
    </div>
  );
};
