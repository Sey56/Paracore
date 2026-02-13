import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';

import { getSourceStatus, getSourceBranches, checkoutBranch, createBranch, pullChanges, pushChanges } from '../services/teamSources';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUpload, faDownload, faCodeBranch, faSyncAlt, faArrowDown, faRedo, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { faGitAlt } from '@fortawesome/free-brands-svg-icons';
import { CommitModal } from './CommitModal';
import { CreateBranchModal } from './CreateBranchModal';
import { PushConfirmModal } from './PushConfirmModal';
import { useNotifications } from '@/hooks/useNotifications';
import { useUI } from '@/hooks/useUI';
import { useAuth } from '@/features/auth';
import { useScripts } from '@/features/automation';
import { Role } from '@/features/auth';

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
  const { showNotification } = useNotifications();
  const { isAuthenticated, activeRole } = useAuth();
  const { remoteScriptSources } = useScripts();

  const [status, setStatus] = useState<GitStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false);
  const [isPushConfirmModalOpen, setIsPushConfirmModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [currentSelectedBranch, setCurrentSelectedBranch] = useState<string | null>(null);
  const [isCreateBranchModalOpen, setIsCreateBranchModalOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const isFetching = useRef(false);

  const currentSource = useMemo(() => {
    if (activeScriptSource?.type === 'team') {
      return {
        id: activeScriptSource.id,
        path: activeScriptSource.path,
      };
    }
    return null;
  }, [activeScriptSource]);

  const fetchStatus = useCallback(async () => {
    if (!currentSource || !isAuthenticated || isFetching.current) {
      return;
    }
    isFetching.current = true;
    setLoading(true);
    setError(null);
    try {
      const statusData = await getSourceStatus(currentSource.path, activeRole === Role.User);
      setStatus(statusData);

      const branchData = await getSourceBranches(currentSource.path);
      setBranches(branchData.branches);
      setCurrentSelectedBranch(branchData.current_branch);

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
      isFetching.current = false;
    }
  }, [currentSource, isAuthenticated, activeRole]);

  const handlePull = async () => {
    if (!currentSource) return;
    setLoading(true);
    setError(null);
    try {
      showNotification("Pulling changes...", "info");
      await pullChanges({ path: currentSource.path });
      showNotification("Pull successful!", "success");
      fetchStatus();
    } catch (err: unknown) {
      let errorMessage = "Failed to pull changes.";
      const apiError = err as ApiResponseError;
      if (apiError?.response?.data?.detail) {
        errorMessage = typeof apiError.response.data.detail === 'string' ? apiError.response.data.detail : JSON.stringify(apiError.response.data.detail);
      }
      showNotification(errorMessage, "error");
      console.error("Pull error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handlePush = async () => {
    setIsPushConfirmModalOpen(true);
  };

  const handleConfirmPush = async () => {
    if (!currentSource) return;
    setLoading(true);
    setError(null);
    try {
      showNotification("Pushing changes...", "info");
      await pushChanges({ path: currentSource.path });
      showNotification("Push successful!", "success");
      fetchStatus();
      setIsPushConfirmModalOpen(false);
    } catch (err: unknown) {
      let errorMessage = "Failed to push changes.";
      const apiError = err as ApiResponseError;
      if (apiError?.response?.data?.detail) {
        errorMessage = typeof apiError.response.data.detail === 'string' ? apiError.response.data.detail : JSON.stringify(apiError.response.data.detail);
      }
      showNotification(errorMessage, "error");
      console.error("Push error:", err);
    } finally {
      setLoading(false);
    }
  };


  const handleBranchChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newBranch = e.target.value;
    if (!currentSource || !newBranch || newBranch === currentSelectedBranch) return;

    setLoading(true);
    setError(null);
    try {
      await checkoutBranch({ source_path: currentSource.path, branch_name: newBranch });
      showNotification(`Successfully checked out branch: ${newBranch}`, "success");
      fetchStatus();
    } catch (err: unknown) {
      let errorMessage = "Failed to checkout branch.";
      const apiError = err as ApiResponseError;
      if (apiError?.response?.data?.detail) {
        errorMessage = typeof apiError.response.data.detail === 'string' ? apiError.response.data.detail : JSON.stringify(apiError.response.data.detail);
      }
      showNotification(errorMessage, "error");
      console.error("Checkout error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (activeRole === Role.User || activeScriptSource?.type !== 'team' || !currentSource) {
    return null;
  }

  const hasChangesToPull = status?.branch_info.behind && status.branch_info.behind > 0;
  const hasChangesToPush = status?.branch_info.ahead && status.branch_info.ahead > 0;
  const hasUncommittedChanges = status?.changed_files && status.changed_files.length > 0;
  const isUpToDate = !hasChangesToPull && !hasChangesToPush && !hasUncommittedChanges;

  const handleCreateBranch = async () => {
    if (!currentSource || !newBranchName) return;

    if (newBranchName === 'main') {
      showNotification("Cannot create a branch named 'main'. Please choose a different name.", "error");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await createBranch({ source_path: currentSource.path, branch_name: newBranchName });
      showNotification(`Successfully created and checked out branch: ${newBranchName}`, "success");
      setIsCreateBranchModalOpen(false);
      setNewBranchName('');
      fetchStatus();
    } catch (err: unknown) {
      let errorMessage = "Failed to create branch.";
      const apiError = err as ApiResponseError;
      if (apiError?.response?.data?.detail) {
        errorMessage = typeof apiError.response.data.detail === 'string' ? apiError.response.data.detail : JSON.stringify(apiError.response.data.detail);
      }
      showNotification(errorMessage, "error");
      console.error("Create branch error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-100 dark:bg-gray-900 p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-sm">
      <CommitModal
        isOpen={isCommitModalOpen}
        onClose={() => setIsCommitModalOpen(false)}
        sourcePath={currentSource.path}
        changedFiles={status?.changed_files || []}
        onCommitSuccess={fetchStatus}
      />
      <CreateBranchModal
        isOpen={isCreateBranchModalOpen}
        onClose={() => setIsCreateBranchModalOpen(false)}
        onCreate={handleCreateBranch}
        newBranchName={newBranchName}
        onNewBranchNameChange={setNewBranchName}
        loading={loading}
      />
      <PushConfirmModal
        isOpen={isPushConfirmModalOpen}
        onClose={() => setIsPushConfirmModalOpen(false)}
        onConfirm={handleConfirmPush}
        isLoading={loading}
      />
      <div className="flex items-center space-x-3">
        <FontAwesomeIcon icon={faGitAlt} className="text-orange-500 text-lg" />
        {loading && !isFetching.current ? (
          <span className="text-gray-600 dark:text-gray-400">Loading status...</span>
        ) : error ? (
          <span className="text-red-500">Error: {error}</span>
        ) : status ? (
          <>
            {activeRole === Role.Developer && currentSelectedBranch === 'main' ? (
              <span className="text-red-500 font-medium">
                <FontAwesomeIcon icon={faCodeBranch} className="mr-1" />
                You are on the main branch. Create a branch to commit your changes.
              </span>
            ) : (
              <span className="font-medium text-gray-800 dark:text-gray-200">
                <FontAwesomeIcon icon={faCodeBranch} className="mr-1" />
                {currentSelectedBranch}
              </span>
            )}
            {(activeRole === Role.Admin || activeRole === Role.Developer) && branches.length > 0 && (
              <div className="relative ml-2">
                <select
                  className="appearance-none bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md pl-3 pr-8 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
                  value={currentSelectedBranch || ''}
                  onChange={handleBranchChange}
                  disabled={loading}
                >
                  {branches.map(branch => (
                    <option key={branch} value={branch}>
                      {branch}
                    </option>
                  ))}
                </select>
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-300 pointer-events-none"
                />
              </div>
            )}
            {activeRole !== Role.Developer || currentSelectedBranch !== 'main' ? (
              <>
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
            ) : null}
          </>
        ) : (
          <span className="text-gray-500 dark:text-gray-400">No Git status available.</span>
        )}
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={fetchStatus}
          className="px-3 py-1 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
          disabled={loading}
          title="Refresh Status"
        >
          <FontAwesomeIcon icon={faRedo} />
        </button>
        <div className="relative" title={!isAuthenticated ? "You must sign in to pull" : ""}>
          <button 
            onClick={handlePull}
            className="px-3 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={
              loading || 
              !isAuthenticated || 
              !status || 
              !hasChangesToPull
            }
          >
            {loading ? <FontAwesomeIcon icon={faSyncAlt} spin className="mr-2" /> : <FontAwesomeIcon icon={faDownload} className="mr-2" />} Pull
          </button>
        </div>
        <div className="relative" title={!isAuthenticated ? "You must sign in to push" : ""}>
          <button 
            onClick={handlePush}
            className="px-3 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={
              loading || 
              !isAuthenticated || 
              !status || 
              !hasChangesToPush ||
              (activeRole === Role.Developer && currentSelectedBranch === 'main')
            }
            title={activeRole === Role.Developer && currentSelectedBranch === 'main' ? "Developers cannot push directly to main. Please create a branch." : "Push changes"}
          >
            {loading ? <FontAwesomeIcon icon={faSyncAlt} spin className="mr-2" /> : <FontAwesomeIcon icon={faUpload} className="mr-2" />} Push
          </button>
        </div>
        <div className="relative" title={!isAuthenticated ? "You must sign in to commit" : ""}>
          <button
            onClick={() => setIsCommitModalOpen(true)}
            className="px-3 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || !status?.changed_files || status.changed_files.length === 0 || !isAuthenticated || (activeRole === Role.Developer && currentSelectedBranch === 'main')}
            title={activeRole === Role.Developer && currentSelectedBranch === 'main' ? "Developers cannot commit directly to main. Please create a branch." : "Commit changes"}
          >
            Commit
          </button>
        </div>
        <div className="relative" title={!isAuthenticated ? "You must sign in to create a branch" : ""}>
          <button
            onClick={() => setIsCreateBranchModalOpen(true)}
            className="px-3 py-1 bg-purple-500 text-white rounded-md hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || !isAuthenticated}
          >
            Create Branch
          </button>
        </div>
      </div>
    </div>
  );
};
