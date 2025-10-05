import { useState, useEffect, useCallback, useMemo } from 'react';
import { ScriptContext, ScriptContextProps } from '../ScriptContext'; // Import from new file
import type { Script, RawScriptFromApi } from '@/types/scriptModel';
import { useNotifications } from '@/hooks/useNotifications';
import api from '@/api/axios';
import useLocalStorage from '@/hooks/useLocalStorage';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useUI } from '@/hooks/useUI';
import { useAuth } from '@/hooks/useAuth'; // Import useAuth
import { isAxiosErrorWithResponseData } from '@/utils/errorUtils';



export const ScriptProvider = ({ children }: { children: React.ReactNode }) => {
  const { showNotification } = useNotifications();
  const { activeWorkspace } = useWorkspaces();
  const { activeScriptSource } = useUI();
  const { user, isAuthenticated } = useAuth(); // Get user and auth status from auth context
  const [scripts, setScripts] = useState<Script[]>([]);
  const [allScripts, setAllScripts] = useState<Script[]>([]);
  const [customScriptFolders, setCustomScriptFolders] = useLocalStorage<string[]>("customScriptFolders", []);
  const [selectedFolder, setSelectedFolder] = useLocalStorage<string | null>('selectedScriptFolder', null);
  const [favoriteScripts, setFavoriteScripts] = useLocalStorage<string[]>("favoriteScripts", []);
  const [recentScripts, setRecentScripts] = useLocalStorage<string[]>("recentScripts", []);
  const [lastRunTimes, setLastRunTimes] = useState<Record<string, string>>({});
  const [combinedScriptContent, setCombinedScriptContent] = useState<string | null>(null);
  const [currentDisplayPath, setCurrentDisplayPath] = useState<string | null>(null);

  const loadScriptsFromPath = useCallback(async (folderPath: string) => {
    try {
      showNotification(`Loading scripts from ${folderPath}...`, "info");
      const response = await api.get(`/api/scripts?folderPath=${encodeURIComponent(folderPath)}`);
      const data = response.data;
      if (data.error || !Array.isArray(data)) {
        showNotification(`Failed to load scripts: ${data.error || "Invalid data format"}`, "error");
        setScripts([]);
      } else {
        const transformedData = data.map((s: RawScriptFromApi) => ({
          ...s,
          metadata: {
            ...s.metadata,
            documentType: s.metadata.document_type,
            gitInfo: s.metadata.git_info ? {
              lastCommitDate: s.metadata.git_info.last_commit_date,
              lastCommitAuthor: s.metadata.git_info.last_commit_author,
              lastCommitMessage: s.metadata.git_info.last_commit_message,
            } : undefined,
          },
        }));
        setScripts(transformedData);
        setSelectedFolder(folderPath);
        showNotification(`Loaded ${transformedData.length} scripts.`, "success");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      showNotification(`Failed to fetch scripts: ${message}`, "error");
      setScripts([]);
    }
  }, [showNotification, setSelectedFolder]);

  // Effect to manage currentDisplayPath based on activeScriptSource
  useEffect(() => {
    if (activeScriptSource) {
      if (activeScriptSource.type === 'local') {
        setCurrentDisplayPath(activeScriptSource.path);
      } else if (activeScriptSource.type === 'workspace' && activeWorkspace) {
        setCurrentDisplayPath(activeWorkspace.path);
      }
    } else {
      setCurrentDisplayPath(null);
    }
  }, [activeScriptSource, activeWorkspace]);

  // Main script loading effect
  useEffect(() => {
    if (currentDisplayPath) {
      loadScriptsFromPath(currentDisplayPath);
    } else {
      setScripts([]);
    }
  }, [currentDisplayPath, loadScriptsFromPath]);

  const { workspaces } = useWorkspaces();

  const fetchAllScripts = useCallback(async () => {
    let newAllScripts: Script[] = [];
    const scriptSources = activeScriptSource?.type === 'local' 
      ? customScriptFolders 
      : activeScriptSource?.type === 'workspace' 
      ? workspaces.map(w => w.path) 
      : [];

    for (const path of scriptSources) {
      try {
        const response = await api.get(`/api/scripts?folderPath=${encodeURIComponent(path)}`);
        const data = response.data;
        if (!data.error && Array.isArray(data)) {
          const transformedData = data.map((s: RawScriptFromApi) => ({
            ...s,
            metadata: {
              ...s.metadata,
              documentType: s.metadata.document_type,
              gitInfo: s.metadata.git_info ? {
                lastCommitDate: s.metadata.git_info.last_commit_date,
                lastCommitAuthor: s.metadata.git_info.last_commit_author,
                lastCommitMessage: s.metadata.git_info.last_commit_message,
              } : undefined,
            },
          }));
          newAllScripts = [...newAllScripts, ...transformedData];
        }
      } catch (error) {
        console.error(`Failed to fetch scripts from ${path}:`, error);
      }
    }
    setAllScripts(newAllScripts);
  }, [activeScriptSource?.type, customScriptFolders, workspaces]);

  useEffect(() => {
    fetchAllScripts();
  }, [fetchAllScripts]);


  const fetchScriptMetadata = useCallback(async (scriptId: string) => {
    const script = scripts.find(s => s.id === scriptId);
    if (!script || script.metadata) return;

    try {
      const response = await api.post("/api/script-metadata", {
        scriptPath: script.absolutePath,
        type: script.type,
      });

      const metadata = response.data;
      
      setScripts(prevScripts =>
        prevScripts.map(s =>
          s.id === scriptId ? { ...s, metadata: metadata.metadata } : s
        )
      );
    } catch (error) {
      console.error(`[RAP] Error fetching metadata for script ${script.absolutePath}:`, error);
      showNotification(`Failed to fetch metadata for ${script.name}.`, "error");
    }
  }, [scripts, showNotification]);

  const scriptsWithFavorites = useMemo(() => {
    return scripts.map(script => ({
      ...script,
      isFavorite: favoriteScripts.includes(script.id),
      metadata: {
        ...script.metadata,
        lastRun: lastRunTimes[script.id] || script.metadata?.lastRun,
      }
    }));
  }, [scripts, favoriteScripts, lastRunTimes]);

  const recentScriptsData = useMemo(() => {
    return recentScripts
      .map(id => scripts.find(script => script.id === id))
      .filter((script): script is Script => !!script);
  }, [recentScripts, scripts]);

  const addCustomScriptFolder = async (folderPath: string) => {
    const normalizedPath = folderPath.replaceAll('/', '/');
    if (!customScriptFolders.includes(normalizedPath)) {
      setCustomScriptFolders((prevFolders) => [...prevFolders, normalizedPath]);
      showNotification(`Added custom script folder: ${folderPath}.`, "success");
    } else {
      showNotification(`Folder already added: ${folderPath}.`, "info");
    }
  };

  const removeCustomScriptFolder = (folderPath: string) => {
    setCustomScriptFolders((prevFolders) =>
      prevFolders.filter((folder) => folder !== folderPath)
    );
    if (selectedFolder === folderPath) {
      setScripts([]);
      setSelectedFolder(null);
    }
    showNotification(`Removed custom script folder: ${folderPath}.`, "info");
  };

  const clearScriptsForWorkspace = useCallback((workspacePath: string) => {
    if (currentDisplayPath === workspacePath) {
      setScripts([]);
      setCurrentDisplayPath(null);
    }
  }, [currentDisplayPath]);
  
  
  const createNewScript = useCallback(async (details: {
    parent_folder: string;
    script_type: 'single' | 'multi';
    script_name: string;
    folder_name?: string;
  }) => {
    try {
      const response = await api.post("/api/scripts/new", details);
      showNotification(response.data.message, "success");
      await loadScriptsFromPath(details.parent_folder);
    } catch (error: unknown) {
      const message = isAxiosErrorWithResponseData(error) ? error.response.data.detail : (error instanceof Error ? error.message : "An unknown error occurred.");
      showNotification(`Failed to create script: ${message}`, "error");
      throw new Error(message); 
    }
  }, [loadScriptsFromPath, showNotification]);

  // Other functions (toggleFavoriteScript, addRecentScript, etc.) remain the same
  const toggleFavoriteScript = useCallback((scriptId: string) => {
    setFavoriteScripts(prev => prev.includes(scriptId) ? prev.filter(id => id !== scriptId) : [...prev, scriptId]);
  }, [setFavoriteScripts]);
  const addRecentScript = useCallback((scriptId: string) => {
    setRecentScripts(prev => [scriptId, ...prev.filter(id => id !== scriptId)].slice(0, 10));
  }, [setRecentScripts]);
  const updateScriptLastRunTime = (scriptId: string) => {
    setLastRunTimes(prev => ({ ...prev, [scriptId]: new Date().toISOString() }));
  };
  const clearFavoriteScripts = useCallback(() => setFavoriteScripts([]), [setFavoriteScripts]);
  const clearRecentScripts = useCallback(() => setRecentScripts([]), [setRecentScripts]);

  const clearScripts = useCallback(() => setScripts([]), []);

  const contextValue: ScriptContextProps = {
    scripts: scriptsWithFavorites,
    allScripts: allScripts, // allScripts is now less relevant for the role-based view
    customScriptFolders,
    selectedFolder,
    favoriteScripts,
    recentScripts: recentScriptsData,
    combinedScriptContent,
    toggleFavoriteScript,
    addRecentScript,
    updateScriptLastRunTime,
    addCustomScriptFolder,
    removeCustomScriptFolder,
    loadScriptsForFolder: loadScriptsFromPath, // Keep original name for compatibility
    createNewScript,
    clearFavoriteScripts,
    clearRecentScripts,
    fetchScriptMetadata,
    setScripts,
    setCombinedScriptContent,
    clearScriptsForWorkspace, // Add this line
    clearScripts,
  };

  return (
    <ScriptContext.Provider value={contextValue}>{children}</ScriptContext.Provider>
  );
};