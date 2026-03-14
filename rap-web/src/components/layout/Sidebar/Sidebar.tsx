import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faFolder,
} from "@fortawesome/free-solid-svg-icons";

import { open } from '@tauri-apps/api/dialog';
import { invoke } from '@tauri-apps/api';
import { useUI } from "@/hooks/useUI";
import { useScripts } from "@/features/automation";
import { useScriptExecution } from "@/features/automation";
import { useState, useMemo, useCallback, useEffect } from 'react';
import { RegisterSourceModal } from '@/features/team-sources/components/RegisterSourceModal';
import { SetupSourceModal } from '@/features/team-sources/components/SetupSourceModal';
import { AddCategoryModal } from '@/features/automation/components/AddCategoryModal';
import { AddFolderModal } from '@/features/automation/components/AddFolderModal';
import { ConfirmActionModal } from '@/features/automation/components/ScriptInspector/ConfirmActionModal';
import { InitializeSourceModal } from '@/features/automation/components/InitializeSourceModal';
import { useNotifications } from '@/hooks/useNotifications';
import { cloneSource } from '@/features/team-sources/services/teamSources';
import { useUserTeamSources } from '@/features/team-sources';

import { useAuth } from '@/features/auth';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { Script, TeamScriptSource } from '@/types/index';
import { Role } from '@/features/auth';

import { getFolderNameFromPath, normalizePath } from '@/utils/pathHelpers';
import api from '@/api/axios';

// Sub-components
import { SidebarHeader } from './components/SidebarHeader';
import { SidebarFooter } from './components/SidebarFooter';
import { FavoritesList } from './components/FavoritesList';
import { RecentScriptsList } from './components/RecentScriptsList';
import { CategoryManager } from './components/CategoryManager';
import { TeamSourceManager } from './components/TeamSourceManager';
import { LocalSourceManager } from './components/LocalSourceManager';
import { TeamRegistryManager } from './components/TeamRegistryManager';

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
  const {
    customScriptFolders,
    addCustomScriptFolder,
    addCustomScriptFolders,
    removeCustomScriptFolder,
    clearAllCustomScriptFolders,
    scripts,
    recentScripts,
    clearFavoriteScripts,
    clearRecentScripts,
    remoteScriptSources,
    addRemoteScriptSource,
    pullTeamSource,
    fetchRemoteScriptSources,
    loadScriptsForFolder,
    clearScriptsForSource,
    removeSourcePath
  } = useScripts();
  const { setSelectedScript } = useScriptExecution();

  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [sourceToSetup, setSourceToSetup] = useState<TeamScriptSource | null>(null);
  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [isAddFolderModalOpen, setIsAddFolderModalOpen] = useState(false);
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
  const [sourceToRemove, setSourceToRemove] = useState<TeamScriptSource | null>(null);
  const [selectedUnclonedSourceId, setSelectedUnclonedSourceId] = useState<number | null>(null);
  const [isClearConfirmModalOpen, setIsClearConfirmModalOpen] = useState(false);
  const [clearActionType, setClearActionType] = useState<'favorites' | 'recents' | 'local-folders' | 'team-sources' | null>(null);

  const { userSourcePaths, setSourcePath } = useUserTeamSources();

  const currentTeamSources = useMemo(() => {
    if (!activeTeam) return [];
    const allSources = remoteScriptSources[activeTeam.team_id] || [];
    return allSources.filter(source => {
      const name = source.name.toLowerCase();
      const isDevSource = name.endsWith('-dev');
      const isUserSource = name.endsWith('-user');
      if (isDevSource) return activeRole === Role.Admin || activeRole === Role.Developer;
      if (isUserSource) return activeRole === Role.Admin || activeRole === Role.User;
      return true;
    });
  }, [activeTeam, remoteScriptSources, activeRole]);

  const { teamScriptSources, unclonedSources } = useMemo(() => {
    const teamSources: (TeamScriptSource & { isOrphaned?: boolean; path?: string })[] = [];
    const uncloned: TeamScriptSource[] = [];
    const clonedIds = new Set(Object.keys(userSourcePaths).map(Number));
    const registeredRepoUrls = new Set(currentTeamSources.map(ws => ws.repo_url.toLowerCase()));

    for (const idStr in userSourcePaths) {
      const id = Number(idStr);
      const localPathInfo = userSourcePaths[idStr];
      if (localPathInfo) {
        const repoName = getFolderNameFromPath(localPathInfo.path);
        const isOrphaned = localPathInfo.repo_url ? !registeredRepoUrls.has(localPathInfo.repo_url.toLowerCase()) : true;
        teamSources.push({ id, name: repoName, repo_url: localPathInfo.repo_url, path: localPathInfo.path, isOrphaned });
      }
    }

    currentTeamSources.forEach(ws => {
      if (!clonedIds.has(ws.id)) uncloned.push(ws);
    });

    return { teamScriptSources: teamSources, unclonedSources: uncloned };
  }, [currentTeamSources, userSourcePaths]);

  const handleCloneClick = () => {
    const sourceToClone = unclonedSources.find(ws => selectedUnclonedSourceId !== null && ws.id === selectedUnclonedSourceId);
    if (!sourceToClone) {
      showNotification("Please select a source to initialize.", "info");
      return;
    }
    setSourceToSetup(sourceToClone);
    setIsSetupModalOpen(true);
  };

  const handleSetupSubmit = async (localPath: string) => {
    if (!sourceToSetup) return;
    try {
      const response = await cloneSource({
        repo_url: sourceToSetup.repo_url.replace(/\/+$/, ''),
        local_path: localPath
      });
      setSourcePath(String(sourceToSetup.id), response.cloned_path, sourceToSetup.repo_url);
      setActiveScriptSource({ type: 'team', id: String(sourceToSetup.id), path: response.cloned_path });
      showNotification(`Script source '${sourceToSetup.name}' set up successfully!`, "success");
      loadScriptsForFolder(response.cloned_path);
      if (response.message && response.message.includes("Source exists in path")) {
        showNotification(response.message, "info");
      }
    } catch (err) {
      const apiError = err as ApiError;
      const errorMessage = apiError.response?.data?.detail || "Failed to set up script source.";
      if (apiError.response && apiError.response.status === 409 && errorMessage.includes("Source exists in path")) {
        showNotification(errorMessage, "info");
      } else {
        showNotification(errorMessage, "error");
      }
      console.error(err);
    }
  };

  const handleRegisterSubmit = async (name: string, repoUrl: string) => {
    if (!activeTeam) return;
    const newSource = { name, repo_url: repoUrl };
    await addRemoteScriptSource(activeTeam.team_id, newSource as TeamScriptSource);
  };

  const handleOpenRemoveModal = (source: TeamScriptSource) => {
    setSourceToRemove(source);
    setIsRemoveModalOpen(true);
  };

  const handleRemoveLocalConfirm = async () => {
    if (!sourceToRemove) return;
    try {
      if (sourceToRemove.id === 0 && sourceToRemove.path) {
        removeCustomScriptFolder(sourceToRemove.path);
      } else {
        if (activeScriptSource?.type === 'team' && Number(activeScriptSource.id) === sourceToRemove.id) {
          setActiveScriptSource(null);
          setSelectedScript(null);
          const localPath = userSourcePaths[sourceToRemove.id]?.path;
          if (localPath) clearScriptsForSource(localPath);
        }
        await removeSourcePath(String(sourceToRemove.id));
      }
      showNotification(`Successfully unloaded '${sourceToRemove.name}'`, "success");
      setIsRemoveModalOpen(false);
      setSourceToRemove(null);
    } catch (err) {
      const apiError = err as ApiError;
      const errorMessage = apiError.response?.data?.detail || "Failed to remove script source.";
      showNotification(errorMessage, "error");
      console.error(err);
    }
  };

  const [isInitModalOpen, setIsInitModalOpen] = useState(false);
  const [folderToInit, setFolderToInit] = useState<string | null>(null);

  const handleAddCustomFolder = async () => {
    if (window.__TAURI__) {
      const selected = await open({ directory: true, multiple: false });
      if (typeof selected === 'string') {
        try {
          showNotification("Scanning for script sources...", "info");
          const discoveredSources: string[] = await invoke('discover_script_sources', { path: selected });
          
          if (discoveredSources.length === 0) {
            showNotification("No script sources found. Select a Paracore source or an empty folder to initialize.", "info");
            return;
          }

          // Case 1: Multiple sources found (Container Mode)
          if (discoveredSources.length > 1) {
            await addCustomScriptFolders(discoveredSources);
            setActiveScriptSource({ type: 'local', path: discoveredSources[0] });
            showNotification(`Loaded ${discoveredSources.length} script source(s).`, "success");
            return;
          }

          // Case 2: Exactly one source returned
          if (discoveredSources.length === 1) {
            const discovered = discoveredSources[0];
            
            // Check if it's the root itself
            if (normalizePath(discovered) === normalizePath(selected)) {
              // The Rust backend returns this path in two cases:
              // a) It has .paracore (existing source)
              // b) It is empty (init candidate)
              // Check locally if .paracore exists to distinguish
              const { exists } = await import('@tauri-apps/api/fs');
              const sep = selected.includes('/') ? '/' : '\\';
              const isInitialized = await exists(`${selected}${sep}.paracore`);
              
              if (isInitialized) {
                // It's an existing source, just load it
                await addCustomScriptFolder(selected);
                setActiveScriptSource({ type: 'local', path: selected });
                showNotification("Script source loaded.", "success");
              } else {
                // It's empty and needs initialization
                setFolderToInit(selected);
                setIsInitModalOpen(true);
              }
            } else {
              // It's a single child source found inside
              await addCustomScriptFolder(discovered);
              setActiveScriptSource({ type: 'local', path: discovered });
              showNotification("Script source loaded.", "success");
            }
          }
        } catch (err: any) {
          console.error("Discovery failed:", err);
          showNotification(`Failed to scan folder: ${err?.message || err}`, "error");
        }
      }
    } else {
      setIsAddFolderModalOpen(true);
    }
  };

  const handleInitializeSource = async (description: string) => {
    if (!folderToInit) return;
    try {
      showNotification("Initializing source...", "info");
      const res = await api.post("/api/scripts/initialize-source", { path: folderToInit, description });
      if (res.data.success) {
        await addCustomScriptFolder(folderToInit);
        setActiveScriptSource({ type: 'local', path: folderToInit });
        showNotification(res.data.message || "Source initialized!", res.data.already_initialized ? "info" : "success");
      }
    } catch (err: any) {
      console.error("[Sidebar] Failed to initialize source:", err);
      const msg = err.response?.data?.detail || "Failed to initialize folder.";
      showNotification(msg, "error");
    } finally {
      setIsInitModalOpen(false);
      setFolderToInit(null);
    }
  };

  const handleAddFolderSubmit = (folderPath: string) => {
    addCustomScriptFolder(folderPath);
    setActiveScriptSource({ type: 'local', path: folderPath });
    setIsAddFolderModalOpen(false);
  };

  const handleAddCategory = (categoryName: string) => {
    addCustomCategory(categoryName);
    setIsAddCategoryModalOpen(false);
  };

  const handleOpenClearConfirmModal = (type: 'favorites' | 'recents' | 'local-folders' | 'team-sources') => {
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
    } else if (clearActionType === 'local-folders') {
      clearAllCustomScriptFolders();
      showNotification("Local folders cleared.", "success");
    } else if (clearActionType === 'team-sources') {
      // V5: Preservation logic for Team Sources
      const activeSourceId = activeScriptSource?.type === 'team' ? activeScriptSource.id : null;
      Object.keys(userSourcePaths).forEach(id => {
        if (id !== activeSourceId) {
          removeSourcePath(id);
        }
      });
      showNotification("Team sources cleared.", "success");
    }
    setIsClearConfirmModalOpen(false);
    setClearActionType(null);
  };

  return (
    <div 
      className={`flex flex-col h-full border-r border-gray-100 dark:border-gray-800/50 ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}
      style={{ backgroundColor: 'var(--bg-card)' }}
    >
      <div className="p-4 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar space-y-2">

        {sourceToSetup && (
          <SetupSourceModal
            isOpen={isSetupModalOpen}
            onClose={() => setIsSetupModalOpen(false)}
            sourceName={sourceToSetup.name}
            onSetup={handleSetupSubmit}
          />
        )}

        <RegisterSourceModal
          isOpen={isRegisterModalOpen}
          onClose={() => setIsRegisterModalOpen(false)}
          onSubmit={handleRegisterSubmit}
        />

        {sourceToRemove && (
          <ConfirmActionModal
            isOpen={isRemoveModalOpen}
            onClose={() => setIsRemoveModalOpen(false)}
            onConfirm={handleRemoveLocalConfirm}
            title={`Unload Script Source '${sourceToRemove.name}'`}
            message={`Are you sure you want to unload this script source? This will remove it from the list, but it will not delete the folder from your computer.`}
            confirmButtonText="Unload"
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

        <InitializeSourceModal
          isOpen={isInitModalOpen}
          onClose={() => setIsInitModalOpen(false)}
          onConfirm={handleInitializeSource}
          folderName={folderToInit ? folderToInit.split(/[\\/]/).pop() || 'Unknown' : ''}
        />

        <ConfirmActionModal
          isOpen={isClearConfirmModalOpen}
          onClose={() => setIsClearConfirmModalOpen(false)}
          onConfirm={handleClearConfirm}
          title={`Clear All ${clearActionType === 'favorites' ? 'Favorites' : (clearActionType === 'recents' ? 'Recents' : 'Script Sources')}`}
          message={`Are you sure you want to clear all your ${clearActionType === 'favorites' ? 'favorite scripts' : (clearActionType === 'recents' ? 'recently used scripts' : 'script sources')}? This action cannot be undone.`}
          confirmButtonText="Clear"
          confirmButtonColor="red"
        />

        <SidebarHeader activeTeam={activeTeam} activeRole={activeRole} />

        {activeTeam && activeTeam.team_id !== 0 && (
          <TeamSourceManager
            activeScriptSource={activeScriptSource}
            setActiveScriptSource={setActiveScriptSource}
            teamScriptSources={teamScriptSources}
            userSourcePaths={userSourcePaths}
            onUnload={handleOpenRemoveModal}
            onUpdate={pullTeamSource}
            activeRole={activeRole}
          />
        )}

        <LocalSourceManager
          activeScriptSource={activeScriptSource}
          setActiveScriptSource={setActiveScriptSource}
          customScriptFolders={customScriptFolders}
          onAddExisting={handleAddCustomFolder}
          onClear={() => handleOpenClearConfirmModal('local-folders')}
          onUnload={handleOpenRemoveModal}
        />

        <FavoritesList
          scripts={scripts}
          setSelectedScript={setSelectedScript}
          setActiveInspectorTab={setActiveInspectorTab}
          onClear={() => handleOpenClearConfirmModal('favorites')}
        />

        <RecentScriptsList
          recentScripts={recentScripts}
          scripts={scripts}
          setSelectedScript={setSelectedScript}
          setActiveInspectorTab={setActiveInspectorTab}
          onClear={() => handleOpenClearConfirmModal('recents')}
        />

        <CategoryManager
          customCategories={customCategories}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          removeCustomCategory={removeCustomCategory}
          onAddCategory={() => setIsAddCategoryModalOpen(true)}
        />

        {activeTeam && activeTeam.team_id !== 0 && (
          <TeamRegistryManager
            selectedUnclonedSourceId={selectedUnclonedSourceId}
            setSelectedUnclonedSourceId={setSelectedUnclonedSourceId}
            currentTeamSources={currentTeamSources}
            userSourcePaths={userSourcePaths}
            onClone={handleCloneClick}
            onRefresh={fetchRemoteScriptSources}
          />
        )}

      </div>
      <SidebarFooter />
    </div>
  );
};
