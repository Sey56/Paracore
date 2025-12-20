import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RegisterWorkspaceModal } from '../common/RegisterWorkspaceModal';
import { getWorkspaceStatus } from '@/api/workspaces';
import { useScripts } from '@/hooks/useScripts';
import { TrashIcon, ArrowPathIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, PencilIcon } from '@heroicons/react/24/outline';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/hooks/useAuth';
import { useUI } from '@/hooks/useUI';
import { Workspace } from '@/types/index';
import { useUserWorkspaces } from '@/hooks/useUserWorkspaces';
import { Role } from '@/context/authTypes';
import { message } from '@tauri-apps/api/dialog'; // Import message from tauri dialog

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
  isReadOnly?: boolean;
}

const WorkspaceSettings: React.FC<WorkspaceSettingsProps> = ({ isAuthenticated, isReadOnly = false }) => {
  const { activeTeam, activeRole } = useAuth();
  const { teamWorkspaces, addTeamWorkspace, removeTeamWorkspace, updateTeamWorkspace, clearScriptsForWorkspace } = useScripts();
  const { activeScriptSource, setActiveScriptSource } = useUI();
  const { showNotification } = useNotifications();
  const { userWorkspacePaths, removeWorkspacePath } = useUserWorkspaces();

  // ... (existing state) ...
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [workspaceToEdit, setWorkspaceToEdit] = useState<Workspace | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const canManageWorkspaces = useMemo(() => activeRole === Role.Admin, [activeRole]);

  // ... (existing memo and handlers) ...
  const teamWorkspacesWithLocalPaths = useMemo(() => {
    return (activeTeam && teamWorkspaces[activeTeam.team_id] || []).map((ws: Workspace) => ({
      ...ws,
      localPath: userWorkspacePaths[ws.id] || undefined,
    }));
  }, [activeTeam, teamWorkspaces, userWorkspacePaths]);

  const handleRegisterSubmit = useCallback(async (name: string, repoUrl: string) => {
    if (isReadOnly) return; // Prevent action in read-only mode
    if (!activeTeam) {
      // ...
      showNotification('No active team selected.', 'error');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const newWorkspace: Omit<Workspace, 'path'> = { // Create a Workspace object without the path property
        id: 0, // Temporary ID, will be replaced by backend
        name: name,
        repo_url: repoUrl,
      };
      await addTeamWorkspace(activeTeam.team_id, newWorkspace as Workspace);
      setIsRegisterModalOpen(false);
    } catch (err) {
      const errorMessage = (err as ApiResponseError).response?.data?.detail || 'Failed to register workspace.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [activeTeam, addTeamWorkspace, showNotification, isReadOnly]);

  const handleUpdateSubmit = useCallback(async (name: string, repoUrl: string) => {
    if (isReadOnly) return;
    // ...
    if (!activeTeam || !workspaceToEdit) {
      showNotification('No active team or workspace selected for update.', 'error');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await updateTeamWorkspace(activeTeam.team_id, workspaceToEdit.id, name, repoUrl);
      showNotification(`Workspace '${name}' updated successfully.`, 'success');
      setIsEditModalOpen(false);
      setWorkspaceToEdit(null);
    } catch (err) {
      const errorMessage = (err as ApiResponseError).response?.data?.detail || 'Failed to update workspace.';
      setError(errorMessage);
      showNotification(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [activeTeam, workspaceToEdit, updateTeamWorkspace, showNotification, isReadOnly]);

  const handleRemove = useCallback(async (workspaceToRemove: Workspace) => {
    if (isReadOnly) return;
    // ...
    if (!activeTeam) {
      showNotification('No active team selected.', 'error');
      return;
    }
    const userConfirmed = await confirm(`Are you sure you want to un-register workspace '${workspaceToRemove.name}'? This will not delete the local folder.`);
    if (userConfirmed !== true) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await removeTeamWorkspace(activeTeam.team_id, workspaceToRemove.id);
      showNotification(`Workspace '${workspaceToRemove.name}' un-registered successfully.`, 'success');
    } catch (err) {
      const errorMessage = (err as ApiResponseError).response?.data?.detail || 'Failed to un-register workspace.';
      setError(errorMessage);
      showNotification(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [activeTeam, removeTeamWorkspace, showNotification, isReadOnly]);

  const handleEditClick = useCallback((workspace: Workspace) => {
    if (isReadOnly) return;
    setWorkspaceToEdit(workspace);
    setIsEditModalOpen(true);
  }, [isReadOnly]);

  return (
    <div className="overflow-y-auto">
      <RegisterWorkspaceModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onSubmit={handleRegisterSubmit}
      />
      {workspaceToEdit && (
        <RegisterWorkspaceModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSubmit={handleUpdateSubmit}
          initialName={workspaceToEdit.name}
          initialRepoUrl={workspaceToEdit.repo_url}
          isEditMode={true}
        />
      )}
      <fieldset disabled={!isAuthenticated || !activeTeam} className="disabled:opacity-50">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">Workspaces</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Manage your Git-connected workspaces for the team: <span className="font-semibold">{activeTeam?.team_name || 'N/A'}</span>.
        </p>

        {isReadOnly && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-2 rounded mb-4 text-sm dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-200">
            Team Workspace features are read-only in the Free Personal Edition.
          </div>
        )}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        <div className="space-y-6">
          {canManageWorkspaces && (
            <button
              onClick={() => setIsRegisterModalOpen(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || !isAuthenticated || !activeTeam || isReadOnly}
              title={isReadOnly ? "Available in Enterprise Edition" : "Register new workspace"}
            >
              {isLoading ? 'Registering...' : 'Register Workspace'}
            </button>
          )}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Team Workspaces</h3>
            {!activeTeam ? (
              <div className="p-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center">
                <p className="text-gray-500 dark:text-gray-400">Please select an active team to manage workspaces.</p>
              </div>
            ) : teamWorkspacesWithLocalPaths.length === 0 ? (
              <div className="p-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center">
                <p className="text-gray-500 dark:text-gray-400">No workspaces are registered for this team yet. Admins can register one.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {teamWorkspacesWithLocalPaths.map((ws) => (
                  <li
                    key={ws.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${activeScriptSource?.type === 'workspace' && Number(activeScriptSource.id) === ws.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">{ws.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{ws.localPath?.path || 'Not set up on this machine'}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setActiveScriptSource({ type: 'workspace', id: String(ws.id), path: ws.localPath!.path })}
                        disabled={!ws.localPath} // Note: We allow switching even in read-only if it's already set up, but let's assume 'Manage' implies mutation. Actually, switching active source is a local action, so we keep it enabled unless local path is missing.
                        className={`px-3 py-1 text-sm rounded-md ${activeScriptSource?.type === 'workspace' && Number(activeScriptSource.id) === ws.id ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'} disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {activeScriptSource?.type === 'workspace' && Number(activeScriptSource.id) === ws.id ? 'Active' : 'Set Active'}
                      </button>
                      {canManageWorkspaces && (
                        <button
                          onClick={() => handleEditClick(ws)}
                          className="p-2 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Edit workspace"
                          disabled={isReadOnly}
                        >
                          <PencilIcon className="h-5 w-5" />
                        </button>
                      )}
                      {canManageWorkspaces && (
                        <button
                          onClick={() => handleRemove(ws)}
                          className="p-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Un-register this workspace for the team"
                          disabled={isReadOnly}
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>


        </div>
      </fieldset>
    </div>
  );
};

export default WorkspaceSettings;
