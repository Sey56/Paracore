import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronRight,
  faStar,
  faClock,
  faLandmark,
  faIndustry,
  faFan,
  faPlus,
  faTimes,
  faFolder,
  faCodeBranch,
  faSync,
  faTrash,
  faChevronDown,
} from "@fortawesome/free-solid-svg-icons";

import { open } from '@tauri-apps/api/dialog';
import { useUI } from "@/hooks/useUI";
import { useScripts } from "@/hooks/useScripts";
import { useScriptExecution } from "@/hooks/useScriptExecution";
import { useState, useMemo } from 'react';
import { RegisterWorkspaceModal } from '@/components/common/RegisterWorkspaceModal';
import { SetupWorkspaceModal } from '@/components/common/SetupWorkspaceModal';
import { AddCategoryModal } from '@/components/common/AddCategoryModal';
import { AddFolderModal } from '@/components/common/AddFolderModal';
import { ConfirmActionModal } from '@/components/automation/ScriptInspector/ConfirmActionModal';
import { useNotifications } from '@/hooks/useNotifications';
import { cloneWorkspace, deleteLocalWorkspace } from '@/api/workspaces';
import { useUserWorkspaces } from '@/hooks/useUserWorkspaces';

import { useAuth } from '@/hooks/useAuth';
import { Script, Workspace } from '@/types/index';
import { Role } from '@/context/authTypes';

import { defaultCategories } from '@/data/categories';

const getFolderNameFromPath = (path: string) => {
  if (!path) return '';
  const parts = path.split(/[\\/]/);
  return parts.pop() || '';
};

interface ApiError {
  response?: {
    data?: {
      detail?: string;
    };
  };
}

export const Sidebar = () => {
  const { user, activeTeam, activeRole, setActiveTeam } = useAuth();
  const { showNotification } = useNotifications();

  const { selectedCategory, setSelectedCategory, customCategories, addCustomCategory, removeCustomCategory, activeScriptSource, setActiveScriptSource } = useUI();
  const { customScriptFolders, addCustomScriptFolder, removeCustomScriptFolder, scripts, recentScripts, clearFavoriteScripts, clearRecentScripts, teamWorkspaces, addTeamWorkspace, pullAllTeamWorkspaces, clearScriptsForWorkspace } = useScripts();
  const { setSelectedScript } = useScriptExecution();
  
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [workspaceToSetup, setWorkspaceToSetup] = useState<Workspace | null>(null);
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [isAddFolderModalOpen, setIsAddFolderModalOpen] = useState(false);
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
  const [workspaceToRemove, setWorkspaceToRemove] = useState<Workspace | null>(null);
  const [selectedUnclonedWorkspaceId, setSelectedUnclonedWorkspaceId] = useState<string | null>(null);

  const { userWorkspacePaths, setWorkspacePath, removeWorkspacePath } = useUserWorkspaces();

  const isPersonalTeamActive = useMemo(() => {
    return activeTeam && user && activeTeam.owner_id === Number(user.id);
  }, [activeTeam, user]);

  const currentTeamWorkspaces = useMemo(() => {
    return activeTeam ? (teamWorkspaces[activeTeam.team_id] || []) : [];
  }, [activeTeam, teamWorkspaces]);

  const { localWorkspaces, unclonedWorkspaces } = useMemo(() => {
    const local: Workspace[] = [];
    const uncloned: Workspace[] = [];
    const clonedIds = new Set(Object.keys(userWorkspacePaths));

    // Create the list of local workspaces from userWorkspacePaths
    for (const id in userWorkspacePaths) {
      const localPathInfo = userWorkspacePaths[id];
      if (localPathInfo) {
        const repoName = getFolderNameFromPath(localPathInfo.path);
        // Find the original workspace to get the repo_url
        const originalWs = currentTeamWorkspaces.find(ws => ws.id === id);
        local.push({
          id: id,
          name: repoName,
          repo_url: originalWs?.repo_url || '', // Use original repo_url
          path: localPathInfo.path,
        });
      }
    }

    // Filter registered workspaces to find the ones that are not cloned
    currentTeamWorkspaces.forEach(ws => {
      if (!clonedIds.has(ws.id)) {
        uncloned.push(ws);
      }
    });

    return { localWorkspaces: local, unclonedWorkspaces: uncloned };
  }, [currentTeamWorkspaces, userWorkspacePaths]);

  const canManageWorkspaces = activeRole === Role.Admin;



  const handleCloneClick = () => {
    const workspaceToClone = unclonedWorkspaces.find(ws => selectedUnclonedWorkspaceId !== null && String(ws.id) === selectedUnclonedWorkspaceId);
    if (!workspaceToClone) {
      showNotification("Please select a workspace to clone.", "info");
      return;
    }
    setWorkspaceToSetup(workspaceToClone);
    setIsSetupModalOpen(true);
  };

  const handleSetupSubmit = async (localPath: string) => {
    if (!workspaceToSetup) return;
    console.log("workspaceToSetup.repo_url before cloning:", workspaceToSetup.repo_url);
  
    try {
      const newWorkspaceResponse = await cloneWorkspace({
        repo_url: workspaceToSetup.repo_url.replace(/\/+$/, ''), // Remove trailing slashes
        local_path: localPath
      });
      
      setWorkspacePath(workspaceToSetup.id, newWorkspaceResponse.cloned_path, Number(newWorkspaceResponse.workspace_id));
      setActiveScriptSource({ type: 'workspace', id: workspaceToSetup.id, path: newWorkspaceResponse.cloned_path });
      showNotification(`Workspace '${workspaceToSetup.name}' set up successfully!`, "success");
    } catch (err) {
      const apiError = err as ApiError;
      const errorMessage = apiError.response?.data?.detail || "Failed to set up workspace.";
      showNotification(errorMessage, "error");
      console.error(err);
      throw err; // Re-throw to keep modal open on error
    }
  };

  const handleRegisterSubmit = async (name: string, repoUrl: string) => {
    if (!activeTeam) return;

    const newWorkspace = {
      name,
      repo_url: repoUrl,
    };

    await addTeamWorkspace(activeTeam.team_id, newWorkspace as Workspace);
  };

  const handleOpenRemoveModal = (workspace: Workspace) => {
    console.log("handleOpenRemoveModal - workspace ID:", workspace.id);
    setWorkspaceToRemove(workspace);
    setIsRemoveModalOpen(true);
  };

  const handleRemoveLocalConfirm = async () => {
    if (!workspaceToRemove) return;
    console.log("handleRemoveLocalConfirm - workspaceToRemove ID:", workspaceToRemove.id);

    const localWorkspaceInfo = userWorkspacePaths[workspaceToRemove.id];
    console.log("handleRemoveLocalConfirm - localWorkspaceInfo:", localWorkspaceInfo);
    if (!localWorkspaceInfo || !localWorkspaceInfo.localId) {
      showNotification("Could not find local workspace information to remove.", "error");
      return;
    }

    try {
      await deleteLocalWorkspace(localWorkspaceInfo.localId);
      removeWorkspacePath(workspaceToRemove.id);
      if (activeScriptSource?.type === 'workspace' && activeScriptSource.id === workspaceToRemove.id) {
        setActiveScriptSource(null);
        clearScriptsForWorkspace(localWorkspaceInfo.path);
      }
      showNotification(`Successfully removed local workspace '${workspaceToRemove.name}'`, "success");
      setIsRemoveModalOpen(false);
      setWorkspaceToRemove(null);
    } catch (err) {
      showNotification(`Failed to remove local workspace.`, "error");
      console.error(err);
    }
  };

  const handleAddCustomFolder = async () => {
    if (window.__TAURI__) {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === 'string') {
        addCustomScriptFolder(selected);
        setActiveScriptSource({ type: 'local', path: selected });
      }
    } else {
      setIsAddFolderModalOpen(true);
    }
  };

  const handleAddFolderSubmit = (folderPath: string) => {
    addCustomScriptFolder(folderPath);
    setActiveScriptSource({ type: 'local', path: folderPath });
    setIsAddFolderModalOpen(false);
  };

  const handleFolderClick = (folder: string) => {
    setActiveScriptSource({ type: 'local', path: folder });
  };

  const handleAddCategory = (categoryName: string) => {
    addCustomCategory(categoryName);
    setIsAddCategoryModalOpen(false);
  };



  return (
    <div className={`bg-white dark:bg-gray-800 shadow-lg overflow-y-auto h-full`}>
      <div className="p-4">

        {workspaceToSetup && (
          <SetupWorkspaceModal
            isOpen={isSetupModalOpen}
            onClose={() => setIsSetupModalOpen(false)}
            workspaceName={workspaceToSetup.name}
            onSetup={handleSetupSubmit}
          />
        )}

        <RegisterWorkspaceModal
          isOpen={isRegisterModalOpen}
          onClose={() => setIsRegisterModalOpen(false)}
          onRegister={handleRegisterSubmit}
        />

        {workspaceToRemove && (
          <ConfirmActionModal
            isOpen={isRemoveModalOpen}
            onClose={() => setIsRemoveModalOpen(false)}
            onConfirm={handleRemoveLocalConfirm}
            title={`Remove Local Workspace '${workspaceToRemove.name}'`}
            message={`Are you sure you want to remove your local copy of this workspace? This will delete the folder '${userWorkspacePaths[workspaceToRemove.id]?.path}' from your computer. This action cannot be undone.`}
            confirmButtonText="Remove"
            confirmButtonColor="red"
          />
        )}

        <AddCategoryModal
          isOpen={isAddCategoryModalOpen}
          onClose={() => setIsAddCategoryModalOpen(false)}
          onAddCategory={handleAddCategory}
        />
        <AddFolderModal
          isOpen={isAddFolderModalOpen}
          onClose={() => setIsAddFolderModalOpen(false)}
          onAddFolder={handleAddFolderSubmit}
        />

        <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-medium text-sm uppercase text-gray-500 dark:text-gray-400 mb-2">Active Team</h3>
          {user && user.memberships.length > 1 && activeTeam ? (
            <div className="relative">
              <select
                value={activeTeam.team_id}
                onChange={(e) => {
                  const selectedTeamId = parseInt(e.target.value);
                  const newActiveTeam = user.memberships.find(m => m.team_id === selectedTeamId);
                  if (newActiveTeam) {
                    setActiveTeam(newActiveTeam);
                  }
                }}
                className="w-full appearance-none bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
              >
                {user.memberships.map(membership => (
                  <option key={membership.team_id} value={membership.team_id}>
                    {membership.team_name} ({membership.role})
                  </option>
                ))}
              </select>
              <FontAwesomeIcon
                icon={faChevronDown}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-300 pointer-events-none"
              />
            </div>
          ) : (
            activeTeam && (
              <div className="flex items-center space-x-2">
                <span className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                  {activeTeam.team_name}
                </span>
                {activeRole && (
                  <span className="px-2 py-0.5 text-xs font-semibold text-white bg-blue-500 rounded-full">
                    {activeRole}
                  </span>
                )}
              </div>
            )
          )}
        </div>

        {/* Workspaces */}
            <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium text-sm uppercase text-gray-500 dark:text-gray-400">Local Workspaces</h3>
            <div className="flex items-center space-x-2">
              {activeRole === Role.User && (
                <button onClick={pullAllTeamWorkspaces} className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white" title="Update Workspaces">
                  <FontAwesomeIcon icon={faSync} />
                </button>
              )}
              <button
                className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400"
                onClick={() => {
                    if (activeScriptSource?.type === 'workspace') {
                        const wsToRemove = localWorkspaces.find(ws => ws.id === activeScriptSource.id);
                        if (wsToRemove) handleOpenRemoveModal(wsToRemove);
                    }
                }}
                disabled={activeScriptSource?.type !== 'workspace'}
                title={`Remove local workspace`}
              >
                <FontAwesomeIcon icon={faTrash} className="text-xs" />
              </button>
            </div>
          </div>
            <div className="relative">
              <select
                value={activeScriptSource?.type === 'workspace' ? activeScriptSource.id : ''}
                onChange={(e) => {
                  const selectedId = e.target.value;
                  const workspace = localWorkspaces.find(ws => ws.id === selectedId);
                  const localPath = userWorkspacePaths[selectedId]?.path;                  
                  if (workspace && localPath) {
                    setActiveScriptSource({ type: 'workspace', id: selectedId, path: localPath, });
                  }
                }}
                className="w-full appearance-none bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
              >
                <option value="" disabled>Select a workspace...</option>
                {localWorkspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
              <FontAwesomeIcon
                icon={faChevronDown}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-300 pointer-events-none"
              />
            </div>

        {/* Local Folders */}
        {isPersonalTeamActive && (
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-medium text-sm uppercase text-gray-500 dark:text-gray-400">Local Folders</h3>
              <button className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white" onClick={handleAddCustomFolder}>
                Add
              </button>
              {activeScriptSource?.type === 'local' && (
                <button
                  className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400"
                  onClick={() => { if (activeScriptSource.path) { removeCustomScriptFolder(activeScriptSource.path); clearScriptsForWorkspace(activeScriptSource.path); } }}
                  title={`Remove folder ${getFolderNameFromPath(activeScriptSource.path || '')}`}
                >
                  <FontAwesomeIcon icon={faTrash} className="text-xs" />
                </button>
              )}
            </div>
            {customScriptFolders.length > 0 && (
              <div className="relative">
                <select
                  value={activeScriptSource?.type === 'local' ? activeScriptSource.path : ''}
                  onChange={(e) => handleFolderClick(e.target.value)}
                  className="w-full appearance-none bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
                >
                  <option value="" disabled>Select a folder...</option>
                  {customScriptFolders.map((folder) => (
                    <option key={folder} value={folder}>
                      {getFolderNameFromPath(folder)}
                    </option>
                  ))}
                </select>
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-300 pointer-events-none"
                />
              </div>
            )}
          </div>
        )}

        {/* Categories, Favorites, Recent Sections... */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium text-sm uppercase text-gray-500 dark:text-gray-400">Categories</h3>
            <button className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white" onClick={() => setIsAddCategoryModalOpen(true)}>
              <FontAwesomeIcon icon={faPlus} />
            </button>
          </div>
          <ul className="space-y-1">
            {customCategories.map((category: string) => (
              <li
                key={category}
                className={`flex items-center justify-between py-1 px-2 rounded cursor-pointer
                  ${selectedCategory === category
                    ? "bg-blue-100 dark:bg-blue-700 text-blue-800 dark:text-blue-100"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"}
                `}
                onClick={() => setSelectedCategory(selectedCategory === category ? null : category)}
              >
                <div className="flex items-center">
                  <span className="font-semibold">{String(category)}</span>
                </div>
                <button
                  className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCustomCategory(category);
                  }}
                  title={`Remove category ${category}`}
                >
                  <FontAwesomeIcon icon={faTimes} className="text-xs" />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium text-sm uppercase text-gray-500 dark:text-gray-400">Favorites</h3>
            <button className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white" onClick={clearFavoriteScripts}>
              Clear
            </button>
          </div>
          <ul className="space-y-1 max-h-32 overflow-y-auto">
            {scripts.filter((s: Script) => s.isFavorite).map((script: Script) => (
              <li
                key={script.id}
                className="flex items-center py-1 px-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-gray-700 dark:text-gray-200"
                onClick={() => setSelectedScript(script)}
              >
                <FontAwesomeIcon icon={faStar} className="text-yellow-400 mr-2" />
                <span className="truncate">{script.metadata.displayName || script.name}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium text-sm uppercase text-gray-500 dark:text-gray-400">Recent</h3>
            <button className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white" onClick={clearRecentScripts}>
              Clear
            </button>
          </div>
          <ul className="space-y-1 max-h-32 overflow-y-auto">
            {recentScripts.map((script: Script) => (
              <li
                key={script.id}
                className="flex items-center py-1 px-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-gray-700 dark:text-gray-200"
                onClick={() => setSelectedScript(script)}
              >
                <FontAwesomeIcon icon={faClock} className="text-gray-400 dark:text-gray-500 mr-2" />
                <span className="truncate">{script.metadata.displayName || script.name}</span>
              </li>
            ))}
          </ul>
        </div>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-medium text-sm uppercase text-gray-500 dark:text-gray-400">Registered Workspaces</h3>
              {selectedUnclonedWorkspaceId && !userWorkspacePaths[selectedUnclonedWorkspaceId] && (
                <button
                  className="text-xs bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-2 rounded"
                  onClick={handleCloneClick}
                >
                  Clone
                </button>
              )}
            </div>
            <div className="relative">
              <select
                value={selectedUnclonedWorkspaceId ?? ''}
                onChange={(e) => setSelectedUnclonedWorkspaceId(e.target.value === '' ? null : e.target.value)}
                className="w-full appearance-none bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
              >
                <option value="" disabled>Select to clone...</option>
                {unclonedWorkspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
              <FontAwesomeIcon
                icon={faChevronDown}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-gray-300 pointer-events-none"
              />
            </div>
          </div>

      </div> {/* Closes p-4 div */}
    </div>
  );
};