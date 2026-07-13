import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faFolder } from "@fortawesome/free-solid-svg-icons";
import { open } from '@tauri-apps/api/dialog';
import { invoke } from '@tauri-apps/api';
import { useUI } from "@/hooks/useUI";
import { useScripts } from "@/features/automation";
import { useScriptExecution } from "@/features/automation";
import { useState } from 'react';
import { AddCategoryModal } from '@/features/automation/components/AddCategoryModal';
import { AddFolderModal } from '@/features/automation/components/AddFolderModal';
import { ConfirmActionModal } from '@/features/automation/components/ScriptInspector/ConfirmActionModal';
import { InitializeSourceModal } from '@/features/automation/components/InitializeSourceModal';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/features/auth';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { normalizePath } from '@/utils/pathHelpers';
import api from '@/api/axios';

import { SidebarHeader } from './components/SidebarHeader';
import { SidebarFooter } from './components/SidebarFooter';
import { FavoritesList } from './components/FavoritesList';
import { RecentScriptsList } from './components/RecentScriptsList';
import { CategoryManager } from './components/CategoryManager';
import { LocalSourceManager } from './components/LocalSourceManager';

export const Sidebar = () => {
  const { user } = useAuth();
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
  } = useScripts();
  const { setSelectedScript } = useScriptExecution();

  const [isAddCategoryModalOpen, setIsAddCategoryModalOpen] = useState(false);
  const [isAddFolderModalOpen, setIsAddFolderModalOpen] = useState(false);
  const [isRemoveModalOpen, setIsRemoveModalOpen] = useState(false);
  const [sourceToRemove, setSourceToRemove] = useState<{ id: number; name: string; path?: string } | null>(null);
  const [isClearConfirmModalOpen, setIsClearConfirmModalOpen] = useState(false);
  const [clearActionType, setClearActionType] = useState<'favorites' | 'recents' | 'local-folders' | null>(null);
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
          if (discoveredSources.length > 1) {
            await addCustomScriptFolders(discoveredSources);
            setActiveScriptSource({ type: 'local', path: discoveredSources[0] });
            showNotification(`Loaded ${discoveredSources.length} script source(s).`, "success");
            return;
          }
          if (discoveredSources.length === 1) {
            const discovered = discoveredSources[0];
            if (normalizePath(discovered) === normalizePath(selected)) {
              const { exists } = await import('@tauri-apps/api/fs');
              const sep = selected.includes('/') ? '/' : '\\';
              const isInitialized = await exists(`${selected}${sep}.paracore`);
              if (isInitialized) {
                await addCustomScriptFolder(selected);
                setActiveScriptSource({ type: 'local', path: selected });
                showNotification("Script source loaded.", "success");
              } else {
                setFolderToInit(selected);
                setIsInitModalOpen(true);
              }
            } else {
              await addCustomScriptFolder(discovered);
              setActiveScriptSource({ type: 'local', path: discovered });
              showNotification("Script source loaded.", "success");
            }
          }
        } catch (err) {
          console.error("Discovery failed:", err);
          showNotification(`Failed to scan folder: ${(err as Error)?.message || err}`, "error");
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
    } catch (err) {
      console.error("[Sidebar] Failed to initialize source:", err);
      const msg = (err as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Failed to initialize folder.";
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

  const handleOpenRemoveModal = (source: { id: number; name: string; path?: string }) => {
    setSourceToRemove(source);
    setIsRemoveModalOpen(true);
  };

  const handleRemoveLocalConfirm = async () => {
    if (!sourceToRemove) return;
    try {
      if (sourceToRemove.path) removeCustomScriptFolder(sourceToRemove.path);
      showNotification(`Successfully unloaded '${sourceToRemove.name}'`, "success");
    } catch (err) {
      showNotification((err as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Failed to remove.", "error");
    } finally {
      setIsRemoveModalOpen(false);
      setSourceToRemove(null);
    }
  };

  const handleClearConfirm = () => {
    if (clearActionType === 'favorites') { clearFavoriteScripts(); showNotification("Favorites cleared.", "success"); }
    else if (clearActionType === 'recents') { clearRecentScripts(); showNotification("Recents cleared.", "success"); }
    else if (clearActionType === 'local-folders') { clearAllCustomScriptFolders(); showNotification("Local folders cleared.", "success"); }
    setIsClearConfirmModalOpen(false);
    setClearActionType(null);
  };

  return (
    <div className={`flex flex-col h-full border-r border-gray-100 dark:border-gray-800/50 ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}
      style={{ backgroundColor: 'var(--bg-card)' }}>
      <div className="p-4 flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar space-y-2">
        {sourceToRemove && (
          <ConfirmActionModal isOpen={isRemoveModalOpen} onClose={() => setIsRemoveModalOpen(false)}
            onConfirm={handleRemoveLocalConfirm} title={`Unload Script Source '${sourceToRemove.name}'`}
            message="Are you sure you want to unload this script source? This will remove it from the list, but it will not delete the folder from your computer."
            confirmButtonText="Unload" confirmButtonColor="red" />
        )}
        <AddCategoryModal isOpen={isAddCategoryModalOpen} onClose={() => setIsAddCategoryModalOpen(false)} onAddCategory={handleAddCategory} />
        <AddFolderModal isOpen={isAddFolderModalOpen} onClose={() => setIsAddFolderModalOpen(false)} onAddFolder={handleAddFolderSubmit} />
        <InitializeSourceModal isOpen={isInitModalOpen} onClose={() => setIsInitModalOpen(false)}
          onConfirm={handleInitializeSource} folderName={folderToInit ? folderToInit.split(/[\\/]/).pop() || 'Unknown' : ''} />
        <ConfirmActionModal isOpen={isClearConfirmModalOpen} onClose={() => setIsClearConfirmModalOpen(false)}
          onConfirm={handleClearConfirm}
          title={`Clear All ${clearActionType === 'favorites' ? 'Favorites' : (clearActionType === 'recents' ? 'Recents' : 'Script Sources')}`}
          message={`Are you sure you want to clear all your ${clearActionType === 'favorites' ? 'favorite scripts' : clearActionType === 'recents' ? 'recently used scripts' : 'script sources'}?`}
          confirmButtonText="Clear" confirmButtonColor="red" />
        <SidebarHeader />
        <LocalSourceManager activeScriptSource={activeScriptSource} setActiveScriptSource={setActiveScriptSource}
          customScriptFolders={customScriptFolders} onAddExisting={handleAddCustomFolder}
          onClear={() => { setClearActionType('local-folders'); setIsClearConfirmModalOpen(true); }}
          onUnload={handleOpenRemoveModal} />
        <FavoritesList scripts={scripts} setSelectedScript={setSelectedScript} setActiveInspectorTab={setActiveInspectorTab}
          onClear={() => { setClearActionType('favorites'); setIsClearConfirmModalOpen(true); }} />
        <RecentScriptsList recentScripts={recentScripts} scripts={scripts} setSelectedScript={setSelectedScript}
          setActiveInspectorTab={setActiveInspectorTab}
          onClear={() => { setClearActionType('recents'); setIsClearConfirmModalOpen(true); }} />
        <CategoryManager customCategories={customCategories} selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory} removeCustomCategory={removeCustomCategory}
          onAddCategory={() => setIsAddCategoryModalOpen(true)} />
      </div>
      <SidebarFooter />
    </div>
  );
};
