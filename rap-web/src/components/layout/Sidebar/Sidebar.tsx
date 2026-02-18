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
import { useNotifications } from '@/hooks/useNotifications';
import { cloneSource, deleteLocalSource } from '@/features/team-sources/services/teamSources';
import { useUserTeamSources } from '@/features/team-sources';

import { useAuth } from '@/features/auth';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { Script, TeamScriptSource } from '@/types/index';
import { Role } from '@/features/auth';

import { defaultCategories } from '@/data/categories';
import { getFolderNameFromPath } from '@/utils/pathHelpers';
import api from '@/api/axios';

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
    pullAllTeamSources,
    clearScriptsForSource,
    pullTeamSource,
    fetchRemoteScriptSources,
    loadScriptsForFolder
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
  const [clearActionType, setClearActionType] = useState<'favorites' | 'recents' | 'local-folders' | null>(null);

  const [localDropdownOpen, setLocalDropdownOpen] = useState(false);
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);

  const { userSourcePaths, setSourcePath, removeSourcePath } = useUserTeamSources();

  const isPersonalTeamActive = useMemo(() => {
    return activeTeam && user && activeTeam.owner_id === Number(user.id);
  }, [activeTeam, user]);

  useEffect(() => {
    const closeDropdowns = () => {
      setLocalDropdownOpen(false);
      setTeamDropdownOpen(false);
    };
    if (localDropdownOpen || teamDropdownOpen) {
      window.addEventListener('click', closeDropdowns);
    }
    return () => window.removeEventListener('click', closeDropdowns);
  }, [localDropdownOpen, teamDropdownOpen]);

  const currentTeamSources = useMemo(() => {
    if (!activeTeam) return [];

    const allSources = remoteScriptSources[activeTeam.team_id] || [];

    return allSources.filter(source => {
      const name = source.name.toLowerCase();
      const isDevSource = name.endsWith('-dev');
      const isUserSource = name.endsWith('-user');

      if (isDevSource) {
        return activeRole === Role.Admin || activeRole === Role.Developer;
      } else if (isUserSource) {
        return activeRole === Role.Admin || activeRole === Role.User;
      } else {
        return true;
      }
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

        teamSources.push({
          id: id,
          name: repoName,
          repo_url: localPathInfo.repo_url,
          path: localPathInfo.path,
          isOrphaned: isOrphaned,
        });
      }
    }

    currentTeamSources.forEach(ws => {
      if (!clonedIds.has(ws.id)) {
        uncloned.push(ws);
      }
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

    const newSource = {
      name,
      repo_url: repoUrl,
    };

    await addRemoteScriptSource(activeTeam.team_id, newSource as TeamScriptSource);
  };

  const handleOpenRemoveModal = (source: TeamScriptSource) => {
    setSourceToRemove(source);
    setIsRemoveModalOpen(true);
  };

  const handleRemoveLocalConfirm = async () => {
    if (!sourceToRemove) return;

    try {
      await removeSourcePath(String(sourceToRemove.id));

      if (activeScriptSource?.type === 'team' && Number(activeScriptSource.id) === sourceToRemove.id) {
        setActiveScriptSource(null);
        setSelectedScript(null);
        const localPath = userSourcePaths[sourceToRemove.id]?.path;
        if (localPath) {
          clearScriptsForSource(localPath);
        }
      }

      showNotification(`Successfully removed script source '${sourceToRemove.name}'`, "success");
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

          if (discoveredSources.length > 0) {
            await addCustomScriptFolders(discoveredSources);
            setActiveScriptSource({ type: 'local', path: discoveredSources[0] });
          } else {
            // V4 Flow: Offer to initialize if nothing found
            setFolderToInit(selected);
            setIsInitModalOpen(true);
          }
        } catch (err) {
          console.error("Discovery failed:", err);
          showNotification("Failed to scan folder. Make sure the app has permissions.", "error");
        }
      }
    } else {
      setIsAddFolderModalOpen(true);
    }
  };

  const handleInitializeSource = async () => {
    if (!folderToInit) return;
    try {
      showNotification("Initializing source...", "info");
      const res = await api.post("/api/scripts/initialize-source", { path: folderToInit });
      if (res.data.success) {
        await addCustomScriptFolder(folderToInit);
        setActiveScriptSource({ type: 'local', path: folderToInit });
        showNotification(res.data.message, "success");
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

  const handleFolderClick = (folder: string) => {
    setActiveScriptSource({ type: 'local', path: folder });
  };

  const handleAddCategory = (categoryName: string) => {
    addCustomCategory(categoryName);
    setIsAddCategoryModalOpen(false);
  };

  const handleOpenClearConfirmModal = (type: 'favorites' | 'recents' | 'local-folders') => {
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
      // Clear all team sources locally
      Object.keys(userSourcePaths).forEach(id => removeSourcePath(id));
      showNotification("Team sources cleared.", "success");
    }
    setIsClearConfirmModalOpen(false);
    setClearActionType(null);
  };

  return (
    <div className={`bg-white dark:bg-gray-800/20 backdrop-blur-3xl flex flex-col h-full border-r border-gray-100 dark:border-gray-800/50 ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="p-4 flex-1 overflow-y-auto custom-scrollbar space-y-2">

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

        <ConfirmActionModal
          isOpen={isInitModalOpen}
          onClose={() => setIsInitModalOpen(false)}
          onConfirm={handleInitializeSource}
          title="Initialize Script Source"
          message={`The selected folder is not a Paracore Script Source yet. Would you like to initialize it? This will allow you to create and manage automation scripts inside it.`}
          confirmButtonText="Initialize"
          confirmButtonColor="blue"
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

        {/* Team Header */}
        <div className="mb-4 mt-2 px-1">
          {activeTeam && activeTeam.team_id !== 0 ? (
            <div className="flex items-center gap-3 p-3 rounded-[1.25rem] bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-sm relative overflow-hidden group">
              <div className="w-10 h-10 rounded-xl bg-blue-600 dark:bg-blue-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 shrink-0 transform group-hover:scale-105 transition-transform">
                <FontAwesomeIcon icon={faUsers} className="text-sm" />
              </div>
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-black text-gray-800 dark:text-gray-100 truncate tracking-tight uppercase">
                  {activeTeam.team_name}
                </span>
                {activeRole && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                      {activeRole}
                    </span>
                  </div>
                )}
              </div>
              <div className="absolute top-0 right-0 w-24 h-full bg-gradient-to-l from-white dark:from-gray-900 to-transparent pointer-events-none" />
            </div>
          ) : (
            <div className="px-3 py-1">
              <h1 className="text-xs font-black text-gray-400 dark:text-gray-600 uppercase tracking-[0.2em]">Automation Foundry</h1>
            </div>
          )}
        </div>

        {/* Team Script Sources */}
        {activeTeam && activeTeam.team_id !== 0 && (
          <SidebarSection
            title="Team Script Sources"
            icon={faCodeBranch}
            iconColor="text-green-500"
            defaultExpanded={true}
            actions={
              activeRole === Role.User && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (activeScriptSource?.type === 'team' && activeScriptSource.path) {
                      pullTeamSource(activeScriptSource.path);
                    }
                  }}
                  disabled={activeScriptSource?.type !== 'team'}
                  className="text-gray-400 hover:text-blue-500 p-1.5 transition-colors"
                  title="Update Source"
                >
                  <FontAwesomeIcon icon={faSync} className="w-3 h-3" />
                </button>
              )
            }
          >
            <div className="space-y-2 pr-2">
              <div className="flex items-center gap-3 group/team-source">
                <div className="relative flex-1">
                  <div
                    onClick={(e) => { e.stopPropagation(); setTeamDropdownOpen(!teamDropdownOpen); setLocalDropdownOpen(false); }}
                    className="w-full bg-gray-100 dark:bg-gray-900 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-800 rounded-xl pl-3 pr-3 py-2 text-sm font-bold text-gray-600 dark:text-gray-400 cursor-pointer transition-all flex items-center justify-between"
                  >
                    <span className="truncate">
                      {activeScriptSource?.type === 'team' 
                        ? (teamScriptSources.find(s => String(s.id) === activeScriptSource.id)?.name || 'Select source...')
                        : 'Select source...'}
                    </span>
                    <FontAwesomeIcon icon={faChevronDown} className={`text-[10px] transition-transform duration-300 ${teamDropdownOpen ? 'rotate-180' : ''}`} />
                  </div>

                  {teamDropdownOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 z-[100] bg-white dark:bg-gray-800 shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="max-h-60 overflow-y-auto py-1.5">
                        {teamScriptSources.map((source) => (
                          <div
                            key={source.id}
                            onClick={() => {
                              const localPath = userSourcePaths[source.id]?.path;
                              if (localPath) setActiveScriptSource({ type: 'team', id: String(source.id), path: localPath });
                              setTeamDropdownOpen(false);
                            }}
                            className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:text-blue-600 dark:hover:text-blue-300 cursor-pointer transition-colors flex items-center justify-between"
                          >
                            <span>{source.name}</span>
                            {source.isOrphaned && <span className="text-[10px]">⚠️</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="w-[34px] flex items-center justify-center shrink-0">
                  {activeScriptSource?.type === 'team' && (
                    <div className="opacity-0 group-hover/team-source:opacity-100 transition-all duration-300 translate-x-2 group-hover/team-source:translate-x-0" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 rounded-lg p-0.5 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (activeScriptSource.id && userSourcePaths[Number(activeScriptSource.id)]?.path) {
                              const sourceToRemove = {
                                id: Number(activeScriptSource.id),
                                name: getFolderNameFromPath(userSourcePaths[Number(activeScriptSource.id)]!.path),
                                repo_url: userSourcePaths[Number(activeScriptSource.id)]?.repo_url || '',
                                path: userSourcePaths[Number(activeScriptSource.id)]!.path
                              };
                              handleOpenRemoveModal(sourceToRemove);
                            }
                          }}
                          className="text-gray-400 hover:text-red-500 transition-colors p-1.5"
                          title="Unload Source"
                        >
                          <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </SidebarSection>
        )}

        {/* Script Sources (Local Folders) */}
        {isPersonalTeamActive && (
          <SidebarSection
            title="Script Sources"
            icon={faFolder}
            iconColor="text-amber-500"
            defaultExpanded={true}
            actions={
              <div className="flex items-center space-x-1">
                <button
                  className="text-gray-400 hover:text-blue-500 p-1.5 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddCustomFolder();
                  }}
                  title="Load Existing Source">
                  <FontAwesomeIcon icon={faFolder} className="w-3 h-3" />
                </button>
                <button
                  className="text-gray-400 hover:text-emerald-500 p-1.5 transition-colors"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (window.__TAURI__) {
                      const selected = await open({ directory: true, multiple: false });
                      if (typeof selected === 'string') {
                        setFolderToInit(selected);
                        setIsInitModalOpen(true);
                      }
                    }
                  }}
                  title="Initialize New Source">
                  <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
                </button>
                {customScriptFolders.length > 0 && (
                  <button
                    className="text-gray-400 hover:text-red-500 p-1.5 transition-colors"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenClearConfirmModal('local-folders');
                    }}
                    title="Clear All Script Sources"
                  >
                    <FontAwesomeIcon icon={faBroom} className="w-3 h-3" />
                  </button>
                )}
              </div>
            }
          >
            <div className="space-y-1.5 pr-2">
              {customScriptFolders.length > 0 ? (
                <div className="flex items-center gap-3 group/source">
                  <div className="relative flex-1">
                    <div
                      onClick={(e) => { e.stopPropagation(); setLocalDropdownOpen(!localDropdownOpen); setTeamDropdownOpen(false); }}
                      className="w-full bg-gray-100 dark:bg-gray-900 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-800 rounded-xl pl-3 pr-3 py-2 text-sm font-bold text-gray-600 dark:text-gray-400 cursor-pointer transition-all flex items-center justify-between"
                    >
                      <span className="truncate">
                        {activeScriptSource?.type === 'local' 
                          ? getFolderNameFromPath(activeScriptSource.path || '')
                          : 'Select source...'}
                      </span>
                      <FontAwesomeIcon icon={faChevronDown} className={`text-[10px] transition-transform duration-300 ${localDropdownOpen ? 'rotate-180' : ''}`} />
                    </div>

                    {localDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 z-[100] bg-white dark:bg-gray-800 shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="max-h-60 overflow-y-auto py-1.5">
                          {customScriptFolders.map((folder) => (
                            <div
                              key={folder}
                              onClick={() => {
                                handleFolderClick(folder);
                                setLocalDropdownOpen(false);
                              }}
                              className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:text-blue-600 dark:hover:text-blue-300 cursor-pointer transition-colors"
                            >
                              {getFolderNameFromPath(folder)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="w-[34px] flex items-center justify-center shrink-0">
                    {activeScriptSource?.type === 'local' && (
                      <div className="opacity-0 group-hover/source:opacity-100 transition-all duration-300 translate-x-2 group-hover/source:translate-x-0" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 rounded-lg p-0.5 shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (activeScriptSource.path) {
                                removeCustomScriptFolder(activeScriptSource.path);
                                clearScriptsForSource(activeScriptSource.path);
                                setActiveScriptSource(null);
                                setSelectedScript(null);
                              }
                            }}
                            className="text-gray-400 hover:text-red-500 transition-colors p-1.5"
                            title="Unload Source"
                          >
                            <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-400 italic px-2 py-1.5 bg-gray-50/50 dark:bg-gray-900/30 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">No folders added</div>
              )}
            </div>
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
                className="text-gray-400 hover:text-red-500 p-1.5 transition-colors"
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
                className="group flex items-center py-1.5 px-3 rounded-xl hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer text-gray-700 dark:text-gray-300 transition-all border border-transparent hover:border-blue-100/50 dark:hover:border-blue-900/30 active:scale-[0.98]"
                onClick={() => { setSelectedScript(script); setActiveInspectorTab('parameters'); }}
              >
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 mr-3 shrink-0 group-hover:scale-125 transition-transform" />
                <span className="truncate text-sm font-bold leading-none">{(script.metadata?.displayName || script.name).replace(/\.cs$/, "")}</span>
              </li>
            ))}
            {scripts.filter((s: Script) => s.isFavorite).length === 0 && (
              <li className="text-sm text-gray-400 italic px-2 py-1.5 bg-gray-50/50 dark:bg-gray-900/30 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">No favorites yet</li>
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
                className="text-gray-400 hover:text-red-500 p-1.5 transition-colors"
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
            {recentScripts
              .map(id => scripts.find(s => s.id === id))
              .filter((s): s is Script => !!s)
              .map((script: Script) => (
                <li
                  key={script.id}
                  className="group flex items-center py-1.5 px-3 rounded-xl hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 cursor-pointer text-gray-700 dark:text-gray-300 transition-all border border-transparent hover:border-indigo-100/50 dark:hover:border-indigo-900/30 active:scale-[0.98]"
                  onClick={() => { setSelectedScript(script); setActiveInspectorTab('parameters'); }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-300 dark:bg-indigo-500 mr-3 shrink-0 group-hover:scale-125 transition-transform" />
                  <span className="truncate text-sm font-bold leading-none">{(script.metadata?.displayName || script.name).replace(/\.cs$/, "")}</span>
                </li>
              ))}
            {recentScripts.length === 0 && (
              <li className="text-sm text-gray-400 italic px-2 py-1.5 bg-gray-50/50 dark:bg-gray-900/30 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">No recent activity</li>
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
              className="text-gray-400 hover:text-blue-500 p-1.5 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setIsAddCategoryModalOpen(true);
              }}
              title="Add Category">
              <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
            </button>
          }
        >
          <ul className="grid grid-cols-1 gap-1 pr-2">
            {customCategories.map((category: string) => (
              <li
                key={category}
                className={`group flex items-center justify-between py-1.5 px-3 rounded-xl cursor-pointer transition-all border
                  ${selectedCategory === category
                    ? "bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300 border-purple-100 dark:border-purple-900/50 shadow-sm"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800/40 text-gray-600 dark:text-gray-300 border-transparent active:scale-[0.98]"}
                `}
                onClick={() => setSelectedCategory(selectedCategory === category ? null : category)}
              >
                <span className="text-sm font-bold truncate leading-none">{String(category)}</span>
                <button
                  className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
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
              <li className="text-sm text-gray-400 italic px-2 py-1.5 bg-gray-50/50 dark:bg-gray-900/30 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">Environment default sets</li>
            )}
          </ul>
        </SidebarSection>

        {/* Remote Script Sources (Registry) */}
        {activeTeam && activeTeam.team_id !== 0 && (
          <SidebarSection
            title="Team Registry"
            icon={faGlobe}
            iconColor="text-slate-400"
            defaultExpanded={false}
            actions={
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  fetchRemoteScriptSources();
                }}
                className="text-gray-400 hover:text-blue-500 p-1.5 transition-colors"
                title="Refresh Team Sources"
              >
                <FontAwesomeIcon icon={faSync} className="w-3 h-3" />
              </button>
            }
          >
            <div className="space-y-2 pr-2">
              <div className="relative group">
                <select
                  value={selectedUnclonedSourceId ?? ''}
                  onChange={(e) => setSelectedUnclonedSourceId(e.target.value === '' ? null : Number(e.target.value))}
                  className="w-full appearance-none bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700/50 rounded-xl pl-3 pr-8 py-2 text-sm font-black text-gray-700 dark:text-gray-200 focus:border-blue-500/40 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all cursor-pointer group-hover:border-gray-200 dark:group-hover:border-gray-700 shadow-sm"
                >
                  <option value="" disabled className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">Cloud availability...</option>
                  {currentTeamSources.map((source) => (
                    <option key={source.id} value={source.id} className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                      {source.name}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 dark:text-gray-500 border-l border-gray-100 dark:border-gray-800 pl-2">
                  <FontAwesomeIcon icon={faChevronDown} className="text-[10px]" />
                </div>
              </div>

              {selectedUnclonedSourceId !== null && !userSourcePaths[selectedUnclonedSourceId] && (
                <div className="px-1 animate-in slide-in-from-top-1 duration-300">
                  <button
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-widest py-1.5 rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-2"
                    onClick={handleCloneClick}
                  >
                    <FontAwesomeIcon icon={faSync} className="text-[10px]" />
                    Initialize Local Sync
                  </button>
                </div>
              )}
            </div>
          </SidebarSection>
        )}

      </div>

      {/* Foundry Footer */}
      <div className="p-6 border-t border-gray-50 dark:border-gray-800/50 bg-gray-50/20 dark:bg-gray-900/10">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-bold text-gray-400 dark:text-gray-500 italic leading-tight">
            Here begins the forging of your BIM reality...
          </p>
          <div className="w-8 h-0.5 bg-blue-500/30 rounded-full" />
        </div>
      </div>
    </div>
  );
};
