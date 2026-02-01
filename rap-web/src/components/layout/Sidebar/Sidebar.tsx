import { SidebarSection } from './SidebarSection';
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
  faGlobe,
  faFileCode
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
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { Script, Workspace } from '@/types/index';
import { Role } from '@/context/authTypes';

import { defaultCategories } from '@/data/categories';
import { getFolderNameFromPath } from '@/utils/pathHelpers';

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
  const { ParacoreConnected } = useRevitStatus();
  const { showNotification } = useNotifications();

  const isDisabled = !user || !ParacoreConnected;

  const { selectedCategory, setSelectedCategory, customCategories, addCustomCategory, removeCustomCategory, activeScriptSource, setActiveScriptSource, setActiveInspectorTab } = useUI();
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
    if (!activeTeam) return [];

    const allWorkspaces = teamWorkspaces[activeTeam.team_id] || [];

    return allWorkspaces.filter(workspace => {
      const name = workspace.name.toLowerCase();
      const isDevWorkspace = name.endsWith('-dev');
      const isUserWorkspace = name.endsWith('-user');

      if (isDevWorkspace) {
        return activeRole === Role.Admin || activeRole === Role.Developer;
      } else if (isUserWorkspace) {
        return activeRole === Role.Admin || activeRole === Role.User;
      } else {
        // Show to all if no specific postfix
        return true;
      }
    });
  }, [activeTeam, teamWorkspaces, activeRole]);

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
        setSelectedScript(null); // Clear the inspector
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
    <div className={`bg-white dark:bg-gray-800 shadow-lg flex flex-col h-full ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="p-3 flex-1 overflow-y-auto custom-scrollbar">

        {/* ... (keep modals) ... */}
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
          onSubmit={handleRegisterSubmit} 
        />

        {workspaceToRemove && (
          <ConfirmActionModal
            isOpen={isRemoveModalOpen}
            onClose={() => setIsRemoveModalOpen(false)}
            onConfirm={handleRemoveLocalConfirm}
            title={`Remove Local Workspace '${workspaceToRemove.name}'`}
            message={`Are you sure you want to unload this workspace? This will remove it from the list, but it will not delete the folder from your computer.`}
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

        <div className="mb-6 px-2">
          {activeTeam && activeTeam.team_id !== 0 && (
            <div className="flex items-center justify-between group">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="w-8 h-8 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
                  <FontAwesomeIcon icon={faUsers} />
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">
                    {activeTeam.team_name}
                  </span>
                  {activeRole && (
                    <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      {activeRole}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Local Workspaces */}
        {activeTeam && activeTeam.team_id !== 0 && (
          <SidebarSection
            title="Local Workspaces"
            icon={faCodeBranch}
            iconColor="text-green-500"
            defaultExpanded={true}
            actions={
              activeRole === Role.User && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (activeScriptSource?.type === 'workspace' && activeScriptSource.path) {
                      pullWorkspace(activeScriptSource.path);
                    }
                  }}
                  disabled={activeScriptSource?.type !== 'workspace'}
                  className="text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 p-1"
                  title="Update Workspace"
                >
                  <FontAwesomeIcon icon={faSync} className="w-3 h-3" />
                </button>
              )
            }
          >
            <div className="flex items-center gap-2 pr-4 mb-2 group">
              <div className="relative flex-1">
                <select
                  value={activeScriptSource?.type === 'workspace' ? String(activeScriptSource.id) : ''}
                  onChange={(e) => {
                    const selectedId = Number(e.target.value);
                    const workspace = localWorkspaces.find(ws => ws.id === selectedId);
                    const localPath = userWorkspacePaths[selectedId]?.path;
                    if (workspace && localPath) {
                      setActiveScriptSource({ type: 'workspace', id: String(selectedId), path: localPath, });
                    }
                  }}
                  className="w-full appearance-none bg-gray-50 dark:bg-gray-700/50 border border-transparent hover:border-gray-200 dark:hover:border-gray-600 rounded-md pl-2 pr-6 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-gray-700 dark:text-gray-200 transition-all"
                >
                  <option value="" disabled className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Select workspace...</option>
                  {localWorkspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                      {workspace.name} {workspace.isOrphaned ? '(orphaned)' : ''}
                    </option>
                  ))}
                </select>
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none"
                />
              </div>
              
              <div className="w-12 flex justify-end items-center shrink-0">
                {activeScriptSource?.type === 'workspace' && (
                  <button
                    className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                    onClick={() => {
                      if (activeScriptSource.id && userWorkspacePaths[Number(activeScriptSource.id)]?.path) {
                        const wsToRemove = {
                          id: Number(activeScriptSource.id),
                          name: getFolderNameFromPath(userWorkspacePaths[Number(activeScriptSource.id)]!.path),
                          repo_url: userWorkspacePaths[Number(activeScriptSource.id)]?.repo_url || '',
                          path: userWorkspacePaths[Number(activeScriptSource.id)]!.path
                        };
                        handleOpenRemoveModal(wsToRemove);
                      }
                    }}
                    title="Unload Workspace"
                  >
                    <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </SidebarSection>
        )}

        {/* Local Folders */}
        {isPersonalTeamActive && (
          <SidebarSection
            title="Local Folders"
            icon={faFolder}
            iconColor="text-amber-500"
            defaultExpanded={true}
            actions={
              <button
                className="text-gray-400 hover:text-blue-500 p-1"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddCustomFolder();
                }}
                title="Add Local Folder">
                <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
              </button>
            }
          >
            {customScriptFolders.length > 0 ? (
              <div className="flex items-center gap-2 pr-4 mb-2 group">
                <div className="relative flex-1">
                  <select
                    value={activeScriptSource?.type === 'local' ? activeScriptSource.path : ''}
                    onChange={(e) => handleFolderClick(e.target.value)}
                    className="w-full appearance-none bg-gray-50 dark:bg-gray-700/50 border border-transparent hover:border-gray-200 dark:hover:border-gray-600 rounded-md pl-2 pr-6 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-gray-700 dark:text-gray-200 transition-all"
                  >
                    <option value="" disabled className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Select folder...</option>
                    {customScriptFolders.map((folder) => (
                      <option key={folder} value={folder} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                        {getFolderNameFromPath(folder)}
                      </option>
                    ))}
                  </select>
                  <FontAwesomeIcon
                    icon={faChevronDown}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none"
                  />
                </div>
                <div className="w-12 flex justify-end items-center shrink-0">
                  {activeScriptSource?.type === 'local' && (
                    <button
                      className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                      onClick={() => {
                        if (activeScriptSource.path) {
                          removeCustomScriptFolder(activeScriptSource.path);
                          clearScriptsForWorkspace(activeScriptSource.path);
                          setSelectedScript(null);
                        }
                      }}
                      title="Remove Folder"
                    >
                      <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ) : (
               <div className="text-xs text-gray-400 italic px-2 py-1">No folders added</div>
            )}
          </SidebarSection>
        )}
        
        {/* Favorites */}
        <SidebarSection
          title="Favorites"
          icon={faStar}
          iconColor="text-yellow-400"
          defaultExpanded={true}
          actions={
            scripts.some(s => s.isFavorite) && (
              <button
                className="text-gray-400 hover:text-red-500 p-1"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenClearConfirmModal('favorites');
                }}
                title="Clear Favorites"
              >
                <FontAwesomeIcon icon={faBroom} className="w-3 h-3" />
              </button>
            )
          }
        >
          <ul className="space-y-0.5 pr-2">
            {scripts.filter((s: Script) => s.isFavorite).map((script: Script) => (
              <li
                key={script.id}
                className="group flex items-center py-1.5 px-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700/50 cursor-pointer text-gray-600 dark:text-gray-300 transition-colors"
                onClick={() => { setSelectedScript(script); setActiveInspectorTab('parameters'); }}
              >
                <FontAwesomeIcon icon={faFileCode} className="text-gray-300 dark:text-gray-600 mr-2 text-[10px]" />
                <span className="truncate text-xs font-medium">{script.metadata.displayName || script.name}</span>
              </li>
            ))}
            {scripts.filter((s: Script) => s.isFavorite).length === 0 && (
              <li className="text-xs text-gray-400 italic px-2 py-1">No favorites yet</li>
            )}
          </ul>
        </SidebarSection>

        {/* Recents */}
        <SidebarSection
          title="Recent"
          icon={faClock}
          iconColor="text-indigo-400"
          defaultExpanded={false}
          actions={
            recentScripts.length > 0 && (
              <button
                className="text-gray-400 hover:text-red-500 p-1"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenClearConfirmModal('recents');
                }}
                title="Clear Recents"
              >
                <FontAwesomeIcon icon={faBroom} className="w-3 h-3" />
              </button>
            )
          }
        >
          <ul className="space-y-0.5 pr-2">
            {recentScripts.map((script: Script) => (
              <li
                key={script.id}
                className="group flex items-center py-1.5 px-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700/50 cursor-pointer text-gray-600 dark:text-gray-300 transition-colors"
                onClick={() => { setSelectedScript(script); setActiveInspectorTab('parameters'); }}
              >
                <span className="truncate text-xs font-medium">{script.metadata.displayName || script.name}</span>
              </li>
            ))}
            {recentScripts.length === 0 && (
               <li className="text-xs text-gray-400 italic px-2 py-1">No recent scripts</li>
            )}
          </ul>
        </SidebarSection>

        {/* Custom Categories */}
        <SidebarSection
          title="Categories"
          icon={faTh}
          iconColor="text-purple-400"
          defaultExpanded={false}
          actions={
            <button
              className="text-gray-400 hover:text-blue-500 p-1"
              onClick={(e) => {
                e.stopPropagation();
                setIsAddCategoryModalOpen(true);
              }}
              title="Add Category">
              <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
            </button>
          }
        >
          <ul className="space-y-0.5 pr-2">
            {customCategories.map((category: string) => (
              <li
                key={category}
                className={`group flex items-center justify-between py-1.5 px-2 rounded-md cursor-pointer transition-colors
                  ${selectedCategory === category
                    ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-600 dark:text-gray-300"}
                `}
                onClick={() => setSelectedCategory(selectedCategory === category ? null : category)}
              >
                <span className="text-xs font-medium truncate">{String(category)}</span>
                <button
                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCustomCategory(category);
                  }}
                  title="Remove category"
                >
                  <FontAwesomeIcon icon={faTimes} className="text-[10px]" />
                </button>
              </li>
            ))}
             {customCategories.length === 0 && (
               <li className="text-xs text-gray-400 italic px-2 py-1">No custom categories</li>
            )}
          </ul>
        </SidebarSection>
        
        {/* Registered Workspaces (Repo list) */}
        {activeTeam && activeTeam.team_id !== 0 && (
          <SidebarSection
            title="Registered Workspaces"
            icon={faGlobe}
            iconColor="text-slate-400"
            defaultExpanded={false}
            actions={
               <button
                  onClick={(e) => {
                    e.stopPropagation();
                    fetchTeamWorkspaces();
                  }}
                  className="text-gray-400 hover:text-blue-500 p-1"
                  title="Refresh Registered Workspaces"
                >
                  <FontAwesomeIcon icon={faSync} className="w-3 h-3" />
                </button>
            }
          >
            <div className="flex items-center gap-2 pr-4 mb-2 group">
               <div className="relative flex-1">
                <select
                  value={selectedUnclonedWorkspaceId ?? ''}
                  onChange={(e) => setSelectedUnclonedWorkspaceId(e.target.value === '' ? null : Number(e.target.value))}
                  className="w-full appearance-none bg-gray-50 dark:bg-gray-700/50 border border-transparent hover:border-gray-200 dark:hover:border-gray-600 rounded-md pl-2 pr-6 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-gray-700 dark:text-gray-200 transition-all"
                >
                  <option value="" disabled className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">Select repo to clone...</option>
                  {currentTeamWorkspaces.map((workspace) => (
                    <option key={workspace.id} value={workspace.id} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                      {workspace.name}
                    </option>
                  ))}
                </select>
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-400 pointer-events-none"
                />
              </div>
              <div className="w-12 flex justify-end items-center shrink-0">
                {selectedUnclonedWorkspaceId !== null && !userWorkspacePaths[selectedUnclonedWorkspaceId] && (
                  <button
                    className="bg-blue-500 hover:bg-blue-600 text-white text-[10px] font-bold py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={handleCloneClick}
                  >
                    Clone
                  </button>
                )}
              </div>
            </div>
          </SidebarSection>
        )}

      </div>
    </div>
  );
};