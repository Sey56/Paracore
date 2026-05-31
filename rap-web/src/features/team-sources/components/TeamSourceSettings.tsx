import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RegisterSourceModal } from './RegisterSourceModal';
import { getSourceStatus } from '../services/teamSources';
import { useScripts } from '@/features/automation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash, faSync, faDownload, faUpload, faPencilAlt } from '@fortawesome/free-solid-svg-icons';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/features/auth';
import { useUI } from '@/hooks/useUI';
import { TeamScriptSource } from '@/types/index';
import { useUserTeamSources } from '../hooks/useUserTeamSources';
import { Role } from '@/features/auth';
import { message, confirm as tauriConfirm } from '@tauri-apps/api/dialog';

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

interface TeamSourceSettingsProps {
  isAuthenticated: boolean;
  isReadOnly?: boolean;
}

const TeamSourceSettings: React.FC<TeamSourceSettingsProps> = ({ isAuthenticated, isReadOnly = false }) => {
  const { activeTeam, activeRole } = useAuth();
  const { remoteScriptSources, addRemoteScriptSource, removeRemoteScriptSource, updateRemoteScriptSource, clearScriptsForSource } = useScripts();
  const { activeScriptSource, setActiveScriptSource } = useUI();
  const { showNotification } = useNotifications();
  const { userSourcePaths, removeSourcePath } = useUserTeamSources();

  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [sourceToEdit, setSourceToEdit] = useState<TeamScriptSource | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const canManageSources = useMemo(() => activeRole === Role.Admin, [activeRole]);

  const teamSourcesWithLocalPaths = useMemo(() => {
    return (activeTeam && remoteScriptSources[activeTeam.team_id] || []).map((ws: TeamScriptSource) => ({
      ...ws,
      localPath: userSourcePaths[ws.id] || undefined,
    }));
  }, [activeTeam, remoteScriptSources, userSourcePaths]);

  const handleRegisterSubmit = useCallback(async (name: string, repoUrl: string) => {
    if (isReadOnly) return;
    if (!activeTeam) {
      showNotification('No active team selected.', 'error');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const newSource: Omit<TeamScriptSource, 'path'> = {
        id: 0,
        name: name,
        repo_url: repoUrl,
      };
      await addRemoteScriptSource(activeTeam.team_id, newSource as TeamScriptSource);
      setIsRegisterModalOpen(false);
    } catch (err) {
      const errorMessage = (err as ApiResponseError).response?.data?.detail || 'Failed to register TeamSource.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [activeTeam, addRemoteScriptSource, showNotification, isReadOnly]);

  const handleUpdateSubmit = useCallback(async (name: string, repoUrl: string) => {
    if (isReadOnly) return;
    if (!activeTeam || !sourceToEdit) {
      showNotification('No active team or source selected for update.', 'error');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      await updateRemoteScriptSource(activeTeam.team_id, sourceToEdit.id, name, repoUrl);
      showNotification(`TeamSource '${name}' updated successfully.`, 'success');
      setIsEditModalOpen(false);
      setSourceToEdit(null);
    } catch (err) {
      const errorMessage = (err as ApiResponseError).response?.data?.detail || 'Failed to update TeamSource.';
      setError(errorMessage);
      showNotification(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [activeTeam, sourceToEdit, updateRemoteScriptSource, showNotification, isReadOnly]);

  const handleRemove = useCallback(async (sourceToRemove: TeamScriptSource) => {
    if (isReadOnly) return;
    if (!activeTeam) {
      showNotification('No active team selected.', 'error');
      return;
    }
    const userConfirmed = await tauriConfirm(`Are you sure you want to un-register TeamSource '${sourceToRemove.name}'? This will not delete the local folder.`);
    if (userConfirmed !== true) {
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await removeRemoteScriptSource(activeTeam.team_id, sourceToRemove.id);
      showNotification(`TeamSource '${sourceToRemove.name}' un-registered successfully.`, 'success');
    } catch (err) {
      const errorMessage = (err as ApiResponseError).response?.data?.detail || 'Failed to un-register TeamSource.';
      setError(errorMessage);
      showNotification(errorMessage, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [activeTeam, removeRemoteScriptSource, showNotification, isReadOnly]);

  const handleEditClick = useCallback((source: TeamScriptSource) => {
    if (isReadOnly) return;
    setSourceToEdit(source);
    setIsEditModalOpen(true);
  }, [isReadOnly]);

  return (
    <div className="overflow-y-auto custom-scrollbar">
      <RegisterSourceModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onSubmit={handleRegisterSubmit}
      />
      {sourceToEdit && (
        <RegisterSourceModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSubmit={handleUpdateSubmit}
          initialName={sourceToEdit.name}
          initialRepoUrl={sourceToEdit.repo_url}
          isEditMode={true}
        />
      )}
      <fieldset disabled={!isAuthenticated || !activeTeam} className="disabled:opacity-50">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-2">TeamSources</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Manage your Git-connected TeamSources for the team: <span className="font-semibold">{activeTeam?.team_name || 'N/A'}</span>.
        </p>

        {isReadOnly && (
          <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-2 rounded mb-4 text-sm dark:bg-yellow-900/30 dark:border-yellow-700 dark:text-yellow-200">
            Team features are read-only in the Free Personal Edition.
          </div>
        )}

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
            <strong className="font-bold">Error: </strong>
            <span className="block sm:inline">{error}</span>
          </div>
        )}
        <div className="space-y-6">
          {canManageSources && (
            <button
              onClick={() => setIsRegisterModalOpen(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || !isAuthenticated || !activeTeam || isReadOnly}
              title={isReadOnly ? "Available in Enterprise Edition" : "Register TeamSource"}
            >
              {isLoading ? 'Registering...' : 'Register TeamSource'}
            </button>
          )}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
            <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">Registry</h3>
            {!activeTeam ? (
              <div className="p-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center">
                <p className="text-gray-500 dark:text-gray-400">Please select an active team to manage TeamSources.</p>
              </div>
            ) : teamSourcesWithLocalPaths.length === 0 ? (
              <div className="p-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center">
                <p className="text-gray-500 dark:text-gray-400">No TeamSources are registered for this team yet. Admins can register one.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {teamSourcesWithLocalPaths.map((ws: TeamScriptSource & { localPath?: { path: string } }) => (
                  <li
                    key={ws.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${activeScriptSource?.type === 'team' && Number(activeScriptSource.id) === ws.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">{ws.name}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{ws.localPath?.path || 'Not set up on this machine'}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setActiveScriptSource({ type: 'team', id: String(ws.id), path: ws.localPath!.path })}
                        disabled={!ws.localPath}
                        className={`px-3 py-1 text-sm rounded-md ${activeScriptSource?.type === 'team' && Number(activeScriptSource.id) === ws.id ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'} disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        {activeScriptSource?.type === 'team' && Number(activeScriptSource.id) === ws.id ? 'Active' : 'Set Active'}
                      </button>
                      {canManageSources && (
                        <button
                          onClick={() => handleEditClick(ws)}
                          className="p-2 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Edit source"
                          disabled={isReadOnly}
                        >
                          <FontAwesomeIcon icon={faPencilAlt} className="h-5 w-5" />
                        </button>
                      )}
                      {canManageSources && (
                        <button
                          onClick={() => handleRemove(ws)}
                          className="p-2 text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 rounded-md disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Un-register this source for the team"
                          disabled={isReadOnly}
                        >
                          <FontAwesomeIcon icon={faTrash} className="h-5 w-5" />
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

export default TeamSourceSettings;
