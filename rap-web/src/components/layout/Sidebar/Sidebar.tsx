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
  faUsers, 
  faBroom,
  faTh,
  faGlobe
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

export const getFolderNameFromPath = (path: string) => {
  if (!path) return '';
  const parts = path.split(/[\\/]/);
  return parts.pop() || '';
};

interface ApiError {
  response?: {
    status?: number;
    data?: {
      detail?: string;
    };
  };
}

export const Sidebar = () => {
  const { user, activeTeam, activeRole } = useAuth();
  const { showNotification } = useNotifications();

  const isDisabled = !user;

  const { selectedCategory, setSelectedCategory, customCategories, addCustomCategory, removeCustomCategory, activeScriptSource, setActiveScriptSource } = useUI();
  const { customScriptFolders, addCustomScriptFolder, removeCustomScriptFolder, scripts, recentScripts, clearFavoriteScripts, clearRecentScripts, teamWorkspaces, addTeamWorkspace, pullAllTeamWorkspaces, clearScriptsForWorkspace, pullWorkspace, fetchTeamWorkspaces, loadScriptsForFolder } = useScripts();
  const { setSelectedScript } = useScriptExecution();
  
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [workspaceToSetup, setWorkspaceToSetup] = useState<Workspace | null>(null);
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [isAddFolderModalOpen, setIsAddFolderModalOpen] = useState(false);
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
  const [workspaceToRemove, setWorkspaceToRemove] = useState<Workspace | null>(null);
  const [selectedUnclonedWorkspaceId, setSelectedUnclonedWorkspaceId] = useState<number | null>(null); // Changed to number
  const [isClearConfirmModalOpen, setIsClearConfirmModalOpen] = useState(false);
  const [clearActionType, setClearActionType] = useState<'favorites' | 'recents' | null>(null);

  const { userWorkspacePaths, setWorkspacePath, removeWorkspacePath } = useUserWorkspaces();

  const isPersonalTeamActive = useMemo(() => {
    return activeTeam && user && activeTeam.owner_id === Number(user.id);
  }, [activeTeam, user]);

  const currentTeamWorkspaces = useMemo(() => {
    return activeTeam ? (teamWorkspaces[activeTeam.team_id] || []) : [];
  }, [activeTeam, teamWorkspaces]);

  const { localWorkspaces, unclonedWorkspaces } = useMemo(() => {
    const local: (Workspace & { isOrphaned?: boolean; path?: string })[] = []; // Added path to local Workspace type
    const uncloned: Workspace[] = [];
    const clonedIds = new Set(Object.keys(userWorkspacePaths).map(Number)); // Convert keys to numbers

    // Get a set of all registered repo URLs for the active team
    const registeredRepoUrls = new Set(currentTeamWorkspaces.map(ws => ws.repo_url.toLowerCase()));

    // Create the list of local workspaces from userWorkspacePaths
    for (const idStr in userWorkspacePaths) {
      const id = Number(idStr); // Convert id to number
      const localPathInfo = userWorkspacePaths[idStr];
      if (localPathInfo) {
        const repoName = getFolderNameFromPath(localPathInfo.path);
        
        // Determine if the local workspace is orphaned
        const isOrphaned = localPathInfo.repo_url ? !registeredRepoUrls.has(localPathInfo.repo_url.toLowerCase()) : true; // Assume orphaned if repo_url is missing

        local.push({
          id: id,
          name: repoName,
          repo_url: localPathInfo.repo_url,
          path: localPathInfo.path, // Add path here
          // localId: localPathInfo.localId, // Commented out for now, will address in useUserWorkspaces.ts
          isOrphaned: isOrphaned, // Add orphaned status
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
    const workspaceToClone = unclonedWorkspaces.find(ws => selectedUnclonedWorkspaceId !== null && ws.id === selectedUnclonedWorkspaceId);
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
      
      setWorkspacePath(String(workspaceToSetup.id), newWorkspaceResponse.cloned_path, workspaceToSetup.repo_url); // Convert id to string
      setActiveScriptSource({ type: 'workspace', id: String(workspaceToSetup.id), path: newWorkspaceResponse.cloned_path }); // Convert id to string
      showNotification(`Workspace '${workspaceToSetup.name}' set up successfully!`, "success");

      // Explicitly load scripts for the newly cloned workspace
      loadScriptsForFolder(newWorkspaceResponse.cloned_path);

      // Check for a specific message from the backend that might indicate a non-critical success
      if (newWorkspaceResponse.message && newWorkspaceResponse.message.includes("workspace exists in path")) {
        showNotification(newWorkspaceResponse.message, "info");
      }

    } catch (err) {
      const apiError = err as ApiError;
      const errorMessage = apiError.response?.data?.detail || "Failed to set up workspace.";
      
      if (apiError.response && apiError.response.status === 409 && errorMessage.includes("workspace exists in path")) {
        showNotification(errorMessage, "info");
      } else {
        showNotification(errorMessage, "error");
      }
      console.error(err);
      // Removed: throw err; // No longer re-throw to keep modal open on error
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
    console.log("Step 2: handleOpenRemoveModal triggered for workspace:", workspace);
    setWorkspaceToRemove(workspace);
    setIsRemoveModalOpen(true);
  };

  const handleRemoveLocalConfirm = async () => {
    if (!workspaceToRemove) return;
    console.log("Step 3: handleRemoveLocalConfirm triggered for:", workspaceToRemove);

    try {
      console.log("Step 4: Calling removeWorkspacePath with ID:", workspaceToRemove.id);
      await removeWorkspacePath(String(workspaceToRemove.id)); // Convert id to string
      console.log("Step 4.5: removeWorkspacePath completed for ID:", workspaceToRemove.id);
      
      if (activeScriptSource?.type === 'workspace' && Number(activeScriptSource.id) === workspaceToRemove.id) { // Convert activeScriptSource.id to number
        setActiveScriptSource(null);
        const localPath = userWorkspacePaths[workspaceToRemove.id]?.path; // Get path from userWorkspacePaths
        if (localPath) {
          clearScriptsForWorkspace(localPath);
        }
      }

      console.log("Step 5: Success! Showing notification.");
      showNotification(`Successfully removed local workspace '${workspaceToRemove.name}'`, "success");
      setIsRemoveModalOpen(false);
      setWorkspaceToRemove(null);
    } catch (err) {
      console.log("Step 5: Failure! Showing error notification.", err);
      const apiError = err as ApiError;
      const errorMessage = apiError.response?.data?.detail || "Failed to remove local workspace.";
      showNotification(errorMessage, "error");
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

  const handleOpenClearConfirmModal = (type: 'favorites' | 'recents') => {
    setClearActionType(type);
    setIsClearConfirmModalOpen(true);
  };

  const handleClearConfirm = () => {
    if (clearActionType === 'favorites') {
      clearFavoriteScripts();
      showNotification("Favorites cleared.", "success");
    } else if (clearActionType === 'recents') {
      clearRecentScripts();
      showNotification("Recents cleared.", "success");
    }
    setIsClearConfirmModalOpen(false);
    setClearActionType(null);
  };







  return (
    <div className={`bg-white dark:bg-gray-800 shadow-lg overflow-y-auto h-full ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
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
          onSubmit={handleRegisterSubmit} // Changed to onSubmit
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

        <ConfirmActionModal
          isOpen={isClearConfirmModalOpen}
          onClose={() => setIsClearConfirmModalOpen(false)}
          onConfirm={handleClearConfirm}
          title={`Clear All ${clearActionType === 'favorites' ? 'Favorites' : 'Recents'}`}
          message={`Are you sure you want to clear all your ${clearActionType === 'favorites' ? 'favorite scripts' : 'recently used scripts'}? This action cannot be undone.`}
          confirmButtonText="Clear"
          confirmButtonColor="red"
        />

        <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-medium text-sm uppercase text-gray-500 dark:text-gray-400 mb-2">
            <FontAwesomeIcon icon={faUsers} className="mr-2 text-blue-500" />
            Active Team
          </h3>
          {activeTeam && (
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
            )}
        </div>

        {/* Workspaces */}
            <div className="flex justify-between items-center mb-2">
              <div className="flex items-center space-x-4">
                <h3 className="font-medium text-sm uppercase text-gray-500 dark:text-gray-400">
                  <FontAwesomeIcon icon={faCodeBranch} className="mr-2 text-green-500" />
                  Local Workspaces
                </h3>
                {activeRole === Role.User && (
                    <button
                        onClick={() => {
                            if (activeScriptSource?.type === 'workspace' && activeScriptSource.path) {
                                pullWorkspace(activeScriptSource.path);
                            }
                        }}
                        disabled={activeScriptSource?.type !== 'workspace'}
                        className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white"
                        title="Update Workspace"
                    >
                        <FontAwesomeIcon icon={faSync} />
                    </button>
                )}
              </div>
              <div className="flex items-center">
                  <button
                      className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400"
                      onClick={() => {
                          console.log("Step 1: Remove button clicked. Active source:", activeScriptSource);
                          if (activeScriptSource?.type === 'workspace' && activeScriptSource.id && userWorkspacePaths[Number(activeScriptSource.id)]?.path) { // Check for path existence
                              const wsToRemove: Workspace & { path?: string } = {
                                  id: Number(activeScriptSource.id),
                                  name: getFolderNameFromPath(userWorkspacePaths[Number(activeScriptSource.id)]!.path),
                                  repo_url: userWorkspacePaths[Number(activeScriptSource.id)]?.repo_url || '',
                                  path: userWorkspacePaths[Number(activeScriptSource.id)]!.path // Add path here
                              };
                              handleOpenRemoveModal(wsToRemove);
                          } else {
                              console.error("Remove button clicked, but active source is not a valid workspace.", activeScriptSource);
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
                value={activeScriptSource?.type === 'workspace' ? String(activeScriptSource.id) : ''} // Convert to string for value
                onChange={(e) => {
                  const selectedId = Number(e.target.value); // Convert to number
                  const workspace = localWorkspaces.find(ws => ws.id === selectedId);
                  const localPath = userWorkspacePaths[selectedId]?.path;                  
                  if (workspace && localPath) {
                    setActiveScriptSource({ type: 'workspace', id: String(selectedId), path: localPath, }); // Convert to string
                  }
                }}
                className="w-full appearance-none bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
              >
                <option value="" disabled>Select a workspace...</option>
                {localWorkspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name} {workspace.isOrphaned ? '(orphaned)' : ''}
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
              <h3 className="font-medium text-sm uppercase text-gray-500 dark:text-gray-400">
                <FontAwesomeIcon icon={faFolder} className="mr-2 text-yellow-500" />
                Local Folders
              </h3>
              <button 
                className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700" 
                onClick={handleAddCustomFolder}
                title="Add Local Folder">
                <FontAwesomeIcon icon={faPlus} />
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
            <h3 className="font-medium text-sm uppercase text-gray-500 dark:text-gray-400">
              <FontAwesomeIcon icon={faTh} className="mr-2 text-purple-500" />
              Custom Categories
            </h3>
            <button 
              className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700" 
              onClick={() => setIsAddCategoryModalOpen(true)}
              title="Add Category">
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
            <h3 className="font-medium text-sm uppercase text-gray-500 dark:text-gray-400">
              <FontAwesomeIcon icon={faStar} className="mr-2 text-yellow-400" />
              Favorites
            </h3>
            <button 
              className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700" 
              onClick={() => handleOpenClearConfirmModal('favorites')}
              title="Clear Favorites"
            >
              <FontAwesomeIcon icon={faBroom} />
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
            <h3 className="font-medium text-sm uppercase text-gray-500 dark:text-gray-400">
              <FontAwesomeIcon icon={faClock} className="mr-2 text-indigo-500" />
              Recent
            </h3>
            <button 
              className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700" 
              onClick={() => handleOpenClearConfirmModal('recents')}
              title="Clear Recents"
            >
              <FontAwesomeIcon icon={faBroom} />
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
              <div className="flex items-center space-x-4">
                <h3 className="font-medium text-sm uppercase text-gray-500 dark:text-gray-400">
                  <FontAwesomeIcon icon={faGlobe} className="mr-2 text-red-500" />
                  Registered Workspaces
                </h3>
                <button
                  onClick={() => fetchTeamWorkspaces()} // Add this button
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white"
                  title="Refresh Registered Workspaces"
                >
                  <FontAwesomeIcon icon={faSync} />
                </button>
              </div>
              {selectedUnclonedWorkspaceId !== null && !userWorkspacePaths[selectedUnclonedWorkspaceId] && (
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
                onChange={(e) => setSelectedUnclonedWorkspaceId(e.target.value === '' ? null : Number(e.target.value))} // Convert to number
                className="w-full appearance-none bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-800 dark:text-gray-200"
              >
                <option value="" disabled>Select to clone...</option>
                {currentTeamWorkspaces.map((workspace) => (
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