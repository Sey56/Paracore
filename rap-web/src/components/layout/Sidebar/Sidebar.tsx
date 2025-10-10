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

const getFolderNameFromPath = (path: string) => {
  if (!path) return '';
  const parts = path.split(/[\\/]/);
  return parts.pop() || '';
};

export const Sidebar = () => {
  const { user, activeTeam, activeRole } = useAuth();
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

  const { userWorkspacePaths, setWorkspacePath, removeWorkspacePath } = useUserWorkspaces();

  const isPersonalTeamActive = useMemo(() => {
    return activeTeam && user && activeTeam.owner_id === Number(user.id);
  }, [activeTeam, user]);

  const currentTeamWorkspaces = useMemo(() => {
    return activeTeam ? (teamWorkspaces[activeTeam.team_id] || []) : [];
  }, [activeTeam, teamWorkspaces]);

  const canManageWorkspaces = activeRole === Role.Admin;

  const handleOpenSetupModal = (workspace: Workspace) => {
    setWorkspaceToSetup(workspace);
    setIsSetupModalOpen(true);
  };

  const handleSetupSubmit = async (localPath: string) => {
    if (!workspaceToSetup) return;

    try {
      const newWorkspaceResponse = await cloneWorkspace({
        repo_url: workspaceToSetup.repo_url,
        local_path: localPath
      });
      
      setWorkspacePath(workspaceToSetup.id, newWorkspaceResponse.cloned_path, Number(newWorkspaceResponse.workspace_id));
      setActiveScriptSource({ type: 'workspace', id: workspaceToSetup.id, path: newWorkspaceResponse.cloned_path });
      showNotification(`Workspace '${workspaceToSetup.name}' set up successfully!`, "success");
    } catch (err: any) {
      const apiError = err as any;
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
    setWorkspaceToRemove(workspace);
    setIsRemoveModalOpen(true);
  };

  const handleRemoveLocalConfirm = async () => {
    if (!workspaceToRemove) return;

    const localWorkspaceInfo = userWorkspacePaths[workspaceToRemove.id];
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

  const defaultCategories = [
    { name: "Architectural", icon: faLandmark, color: "text-red-500" },
    { name: "Structural", icon: faIndustry, color: "text-indigo-500" },
    { name: "MEP", icon: faFan, color: "text-teal-500" },
  ];

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

        {/* Categories, Favorites, Recent Sections... */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium text-sm uppercase text-gray-500 dark:text-gray-400">Categories</h3>
            <button className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white" onClick={() => setIsAddCategoryModalOpen(true)}>
              <FontAwesomeIcon icon={faPlus} />
            </button>
          </div>
          <ul className="space-y-1">
            {defaultCategories.map(category => (
              <li
                key={category.name}
                className={`flex items-center justify-between py-1 px-2 rounded cursor-pointer
                  ${selectedCategory === category.name
                    ? "bg-blue-100 dark:bg-blue-700 text-blue-800 dark:text-blue-100"
                    : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"}
                `}
                onClick={() => setSelectedCategory(selectedCategory === category.name ? null : category.name)}
              >
                <div className="flex items-center">
                  <FontAwesomeIcon icon={category.icon} className={`${category.color} mr-2`} />
                  <span className="font-semibold">{category.name}</span>
                </div>
                <FontAwesomeIcon icon={faChevronRight} className="text-xs text-gray-400 dark:text-gray-500" />
              </li>
            ))}
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
                <button className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white" onClick={(e) => {e.stopPropagation(); removeCustomCategory(category)} }>
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

        {/* 📂 Script Sources */}
        <div className="mb-6">
          <h3 className="font-medium text-sm uppercase text-gray-500 dark:text-gray-400 mb-2">Script Sources</h3>
        
          {/* Local Folders */}
          {isPersonalTeamActive && (
            <div className="mb-4 ml-2">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-medium text-xs uppercase text-gray-500 dark:text-gray-400">Local Folders</h4>
                <button className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white" onClick={handleAddCustomFolder}>
                  Add
                </button>
              </div>
              <ul className="space-y-1">
                {customScriptFolders.map((folder: string) => (
                  <li
                    key={folder}
                    className={`flex items-center justify-between py-1 px-2 rounded cursor-pointer ${activeScriptSource?.type === 'local' && activeScriptSource.path === folder ? "bg-blue-100 dark:bg-blue-700 text-blue-800 dark:text-blue-100" : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"}`}
                    onClick={() => handleFolderClick(folder)}
                  >
                    <div className="flex items-center">
                      <FontAwesomeIcon icon={faFolder} className="text-yellow-500 mr-2" />
                      <span className="font-semibold">{getFolderNameFromPath(folder)}</span>
                    </div>
                    <button className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white" onClick={(e) => {e.stopPropagation(); removeCustomScriptFolder(folder)} }>
                      <FontAwesomeIcon icon={faTimes} className="text-xs" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        
          {/* Workspaces */}
          <div className="mb-4 ml-2">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-medium text-xs uppercase text-gray-500 dark:text-gray-400">Workspaces</h4>
              <div className="flex items-center space-x-2">
                {activeRole === Role.User && (
                  <button onClick={pullAllTeamWorkspaces} className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white" disabled={!activeTeam || currentTeamWorkspaces.length === 0} title="Update Workspaces">
                    <FontAwesomeIcon icon={faSync} />
                  </button>
                )}
                {canManageWorkspaces && (
                  <button className="text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-white" onClick={() => setIsRegisterModalOpen(true)} title="Register New Workspace">
                    Register
                  </button>
                )}
              </div>
            </div>
            <ul className="space-y-1">
              {currentTeamWorkspaces.map((workspace: Workspace) => {
                const localWorkspaceInfo = userWorkspacePaths[workspace.id];
                const isSetUp = !!localWorkspaceInfo;
                const localPath = isSetUp ? localWorkspaceInfo.path : undefined;

                const isActive = activeScriptSource?.type === 'workspace' && activeScriptSource.id === workspace.id;

                if (isSetUp && localPath) {
                  return (
                    <li key={workspace.id} className={`flex items-center justify-between py-1 px-2 rounded cursor-pointer ${isActive ? "bg-blue-100 dark:bg-blue-700 text-blue-800 dark:text-blue-100" : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200"}`}>
                      <div className="flex items-center flex-grow min-w-0" onClick={() => setActiveScriptSource({ type: 'workspace', id: workspace.id, path: localPath })}
                      >
                        <FontAwesomeIcon icon={faCodeBranch} className="text-purple-500 mr-2 flex-shrink-0" />
                        <span className="font-semibold truncate">{workspace.name}</span>
                      </div>
                      <button className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 ml-2 flex-shrink-0" onClick={() => handleOpenRemoveModal(workspace)}>
                        <FontAwesomeIcon icon={faTrash} className="text-xs" />
                      </button>
                    </li>
                  );
                } else {
                  return (
                    <li key={workspace.id} className="flex items-center justify-between py-1 px-2 rounded">
                      <div className="flex items-center text-gray-500 dark:text-gray-400">
                        <FontAwesomeIcon icon={faCodeBranch} className="text-purple-500 mr-2" />
                        <span className="font-semibold">{workspace.name}</span>
                      </div>
                      <button className="text-xs bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-2 rounded" onClick={() => handleOpenSetupModal(workspace)}>
                        Setup
                      </button>
                    </li>
                  );
                }
              })}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};