import { useState, useEffect, useCallback, useMemo } from 'react';
import { ScriptContext, ScriptContextProps } from './ScriptContext';
import type { Script, RawScriptFromApi } from '@/types/scriptModel';
import { Workspace } from '@/types/index';
import { useNotifications } from '@/hooks/useNotifications';
import api from '@/api/axios';
import useLocalStorage from '@/hooks/useLocalStorage';
import { useUI } from '@/hooks/useUI';
import { useAuth } from '@/hooks/useAuth';
import { isAxiosErrorWithResponseData } from '@/utils/errorUtils';
import { pullTeamWorkspaces as pullTeamWorkspacesApi } from '@/api/rapServerApiClient';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { useRapServerUrl } from '@/hooks/useRapServerUrl';
import { useUserWorkspaces } from '@/hooks/useUserWorkspaces';

import { getTeamWorkspaces, registerWorkspace, deleteRegisteredWorkspace, updateRegisteredWorkspace } from '@/api/rapAuthApiClient';

interface ApiError {
  response?: {
    data?: {
      detail?: string;
    };
  };
}

export const ScriptProvider = ({ children }: { children: React.ReactNode }) => {
  const { showNotification } = useNotifications();
  const { activeScriptSource, setActiveScriptSource } = useUI();
  const { user, isAuthenticated, activeTeam, cloudToken } = useAuth();
  const rapServerUrl = useRapServerUrl();
  const { userWorkspacePaths } = useUserWorkspaces();

  const [scripts, setScripts] = useState<Script[]>([]);
  const [allScripts, setAllScripts] = useState<Script[]>([]);
  const [customScriptFolders, setCustomScriptFolders] = useState<string[]>([]);

  const fetchCustomScriptFolders = useCallback(async () => {
    if (!user || !cloudToken || !rapServerUrl) return;
    try {
      const response = await api.get(
        `${rapServerUrl}/api/user-settings/custom_script_folders`,
        {
          headers: { Authorization: `Bearer ${cloudToken}` },
        }
      );
      setCustomScriptFolders(response.data.setting_value || []);
    } catch (error) {
      console.error("Failed to fetch custom script folders:", error);
      setCustomScriptFolders([]);
    }
  }, [user, cloudToken, rapServerUrl]);

  const saveCustomScriptFolders = useCallback(async (folders: string[]) => {
    if (!user || !cloudToken || !rapServerUrl) return;
    try {
      await api.post(
        `${rapServerUrl}/api/user-settings/custom_script_folders`,
        {
          setting_key: "custom_script_folders",
          setting_value: folders,
        },
        {
          headers: { Authorization: `Bearer ${cloudToken}` },
        }
      );
    } catch (error) {
      console.error("Failed to save custom script folders:", error);
    }
  }, [user, cloudToken, rapServerUrl]);

  useEffect(() => {
    if (!user) {
      setCustomScriptFolders([]); // Clear folders if user logs out
      return;
    }
    fetchCustomScriptFolders();
  }, [user, fetchCustomScriptFolders]);

  const [teamWorkspaces, setTeamWorkspaces] = useState<Record<number, Workspace[]>>({});

  const fetchTeamWorkspaces = useCallback(async () => {
    if (!activeTeam || !cloudToken) {
      setTeamWorkspaces({});
      return;
    }
    try {
      const workspaces = await getTeamWorkspaces(activeTeam.team_id, cloudToken);
      setTeamWorkspaces(prev => ({
        ...prev,
        [activeTeam.team_id]: workspaces
      }));
    } catch (error) {
      console.error(`Failed to fetch registered workspaces for team ${activeTeam.team_id}:`, error);
      setTeamWorkspaces(prev => ({
        ...prev,
        [activeTeam.team_id]: []
      }));
    }
  }, [activeTeam, cloudToken, setTeamWorkspaces]);

  useEffect(() => {
    fetchTeamWorkspaces();
  }, [fetchTeamWorkspaces, activeTeam]);

  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [favoriteScripts, setFavoriteScripts] = useState<string[]>([]);
  const [recentScripts, setRecentScripts] = useState<string[]>([]);
  const [lastRunTimes, setLastRunTimes] = useState<Record<string, string>>({});
  const [combinedScriptContent, setCombinedScriptContent] = useState<string | null>(null);
  const [currentDisplayPath, setCurrentDisplayPath] = useState<string | null>(null);

  const currentTeamWorkspaces = useMemo(() => {
    return activeTeam ? (teamWorkspaces[activeTeam.team_id] || []) : [];
  }, [activeTeam, teamWorkspaces]);

  useEffect(() => {
    setScripts([]);
    setCurrentDisplayPath(null);
    setSelectedFolder(null);
    setActiveScriptSource(null);
  }, [activeTeam, setActiveScriptSource]);

  const loadScriptsFromPath = useCallback(async (folderPath: string, suppressNotification: boolean = false) => {
    if (!folderPath) {
        setScripts([]);
        return;
    }

    // If the path is a direct file path, handle it differently
    if (folderPath.endsWith('.cs')) {
        try {
            if (!suppressNotification) {
                showNotification(`Loading script: ${folderPath}...`, "info");
            }
            // We need to get the metadata for this single script.
            // We can reuse the logic from fetchScriptManifest but for a single file.
            const metadataResponse = await api.post("/api/script-metadata", {
              scriptPath: folderPath,
              type: 'single-file', // Assuming agent-selected scripts are single files for now
            });
            const metadata = metadataResponse.data.metadata;

            const scriptObject: Script = {
                id: folderPath,
                name: folderPath.split('/').pop() || folderPath,
                type: 'single-file',
                absolutePath: folderPath,
                sourcePath: folderPath,
                metadata: {
                    ...metadata,
                    documentType: metadata.document_type,
                },
                parameters: [], // Satisfy the Script type
            };
            setScripts([scriptObject]);
            setSelectedFolder(folderPath); // Keep track of the selected file
            showNotification(`Loaded script ${scriptObject.name}.`, "success");

        } catch (error) {
            console.error(`Failed to fetch metadata for script ${folderPath}:`, error);
            const message = error instanceof Error ? error.message : "Unknown error";
            showNotification(`Failed to fetch metadata: ${message}`, "error");
            setScripts([]);
        }
        return;
    }

    // Original logic for handling folder paths
    try {
      if (!suppressNotification) {
        showNotification(`Loading scripts from ${folderPath}...`, "info");
      }
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
      console.error(`Failed to fetch scripts from ${folderPath}:`, error);
      const message = error instanceof Error ? error.message : "Unknown error";
      showNotification(`Failed to fetch scripts: ${message}`, "error");
      setScripts([]);
    }
  }, [showNotification, setSelectedFolder]);

  useEffect(() => {
    let path_to_load: string | null = null;

    if (activeScriptSource) {
      if (activeScriptSource.type === 'local') {
        path_to_load = activeScriptSource.path;
      } else if (activeScriptSource.type === 'workspace') {
        path_to_load = userWorkspacePaths[Number(activeScriptSource.id)]?.path;
      }
    }

    if (path_to_load) {
      loadScriptsFromPath(path_to_load);
      setSelectedFolder(path_to_load);
    } else {
      setScripts([]);
      setSelectedFolder(null);
    }
  }, [activeScriptSource, loadScriptsFromPath, setSelectedFolder, userWorkspacePaths, showNotification]);

  const { rserverConnected } = useRevitStatus();
  const [toolLibraryPath, setToolLibraryPath] = useLocalStorage<string | null>('agentScriptsPath', null);

  const fetchScriptManifest = useCallback(async () => {
    if (!rserverConnected || !toolLibraryPath) {
      showNotification("Cannot generate manifest: RServer is not connected or tool library path is not set.", "error");
      return;
    }

    showNotification("Generating agent tool manifest...", "info");
    try {
      const response = await api.post("/api/script-manifest", { tool_library_path: toolLibraryPath });
      showNotification(response.data.message, "success");
    } catch (error) {
      console.error(`Failed to generate script manifest:`, error);
      const message = error instanceof Error ? error.message : "Unknown error";
      showNotification(`Failed to generate script manifest: ${message}`, "error");
    }
  }, [rserverConnected, toolLibraryPath, showNotification]);



  const fetchScriptMetadata = useCallback(async (scriptId: string) => {
    const script = scripts.find(s => s.id === scriptId);
    if (!script || script.metadata) return;

    try {
      const response = await api.post("/api/script-metadata", { scriptPath: script.absolutePath, type: script.type });

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

  const addCustomScriptFolder = useCallback(async (folderPath: string): Promise<void> => {
    if (!user) return;
    setCustomScriptFolders(prev => {
      const newState = [...prev, folderPath];
      saveCustomScriptFolders(newState);
      return newState;
    });
    showNotification(`Added custom script folder: ${folderPath}.`, "success");
  }, [user, saveCustomScriptFolders, showNotification]);

  const removeCustomScriptFolder = useCallback((folderPath: string) => {
    if (!user) return;
    setCustomScriptFolders(prev => {
      const newState = prev.filter(folder => folder !== folderPath);
      saveCustomScriptFolders(newState);
      return newState;
    });
    if (selectedFolder === folderPath) {
      setScripts([]);
      setSelectedFolder(null);
    }
    if (activeScriptSource?.type === 'local' && activeScriptSource.path === folderPath) {
      setActiveScriptSource(null);
    }
    showNotification(`Removed custom script folder: ${folderPath}.`, "info");
  }, [user, saveCustomScriptFolders, selectedFolder, showNotification, activeScriptSource, setActiveScriptSource]);

  const addTeamWorkspace = useCallback(async (teamId: number, workspace: Workspace): Promise<void> => {
    if (!cloudToken) {
      showNotification("Not authenticated.", "error");
      return;
    }
    try {
      const registeredWorkspace = await registerWorkspace(teamId, workspace.name, workspace.repo_url, cloudToken);
      setTeamWorkspaces(prev => ({
        ...prev,
        [teamId]: [...(prev[teamId] || []), registeredWorkspace]
      }));
      showNotification(`Added workspace '${registeredWorkspace.name}' to team.`, "success");
    } catch (error) {
      console.error("Failed to register workspace:", error);
      if (isAxiosErrorWithResponseData(error) && error.response.status === 409) {
        showNotification(error.response.data.detail, "warning");
      } else {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        showNotification(`Failed to add workspace: ${message}`, "error");
      }
      throw error;
    }
  }, [cloudToken, setTeamWorkspaces, showNotification]);

  const removeTeamWorkspace = useCallback(async (teamId: number, workspaceId: number): Promise<void> => {
    if (!cloudToken) {
      showNotification("Not authenticated.", "error");
      return;
    }
    try {
      await deleteRegisteredWorkspace(workspaceId, cloudToken);
      setTeamWorkspaces(prev => ({
        ...prev,
        [teamId]: (prev[teamId] || []).filter(w => w.id !== workspaceId)
      }));
      showNotification(`Removed workspace from team.`, "info");
    } catch (error) {
      console.error("Failed to remove workspace:", error);
      const message = error instanceof Error ? error.message : "An unknown error occurred.";
      showNotification(`Failed to remove workspace: ${message}`, "error");
    }
  }, [cloudToken, setTeamWorkspaces, showNotification]);

  const updateTeamWorkspace = useCallback(async (teamId: number, workspaceId: number, name: string | undefined, repoUrl: string | undefined): Promise<void> => {
    if (!cloudToken) {
      showNotification("Not authenticated.", "error");
      return;
    }
    try {
      const updatedWorkspace = await updateRegisteredWorkspace(workspaceId, name, repoUrl, cloudToken);
      setTeamWorkspaces(prev => ({
        ...prev,
        [teamId]: (prev[teamId] || []).map(w => w.id === updatedWorkspace.id ? updatedWorkspace : w)
      }));
      showNotification(`Updated workspace '${updatedWorkspace.name}'.`, "success");
    } catch (error) {
      console.error("Failed to update workspace:", error);
      const message = error instanceof Error ? error.message : "An unknown error occurred.";
      showNotification(`Failed to update workspace: ${message}`, "error");
    }
  }, [cloudToken, setTeamWorkspaces, showNotification]);

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

  const toggleFavoriteScript = useCallback((scriptId: string) => {
    setFavoriteScripts(prev => prev.includes(scriptId) ? prev.filter(id => id !== scriptId) : [...prev, scriptId]);
  }, []);

  const addRecentScript = useCallback((scriptId: string) => {
    setRecentScripts(prev => [scriptId, ...prev.filter(id => id !== scriptId)].slice(0, 10));
  }, []);

  const updateScriptLastRunTime = (scriptId: string) => {
    setLastRunTimes(prev => ({ ...prev, [scriptId]: new Date().toISOString() }));
  };

  const clearFavoriteScripts = useCallback(() => setFavoriteScripts([]), []);
  const clearRecentScripts = useCallback(() => setRecentScripts([]), []);

  const clearScripts = useCallback(() => setScripts([]), []);

  const pullWorkspace = useCallback(async (workspacePath: string) => {
    if (!activeTeam || !cloudToken) {
      showNotification("Not authenticated or no active team.", "error");
      return;
    }

    if (!workspacePath) {
      showNotification("No workspace path provided.", "error");
      return;
    }

    showNotification(`Updating workspace at ${workspacePath}...`, "info");
    try {
      if (!rapServerUrl) {
        showNotification("RAP Server URL not available.", "error");
        return;
      }
      const response = await pullTeamWorkspacesApi(rapServerUrl, [workspacePath], cloudToken, "main");
      const result = response.results[0];
      if (result.status === "failed") {
        showNotification(`Failed to update workspace: ${result.message}`, "error");
        console.error(`Pull failed for ${result.path}: ${result.message}`);
      } else {
        showNotification("Workspace updated successfully!", "success");
      }
      if (activeScriptSource?.type === 'workspace' && currentDisplayPath) {
        loadScriptsFromPath(currentDisplayPath, true);
      }
    } catch (err) {
      const apiError = err as ApiError;
      showNotification(apiError.response?.data?.detail || "Failed to update workspace.", "error");
      console.error("Pull workspace error:", err);
    }
  }, [activeTeam, cloudToken, showNotification, activeScriptSource, currentDisplayPath, loadScriptsFromPath, rapServerUrl]);

  const pullAllTeamWorkspaces = useCallback(async () => {
    if (!activeTeam || !cloudToken) {
      showNotification("Not authenticated or no active team.", "error");
      return;
    }
    
    const workspacePaths = currentTeamWorkspaces
      .map(ws => userWorkspacePaths[ws.id]?.path)
      .filter((path): path is string => !!path);

    if (workspacePaths.length === 0) {
      showNotification("No workspaces have been set up on this machine for this team.", "info");
      return;
    }

    showNotification("Updating team workspaces...!", "info");
    try {
      if (!rapServerUrl) {
        showNotification("RAP Server URL not available.", "error");
        return;
      }
      const response = await pullTeamWorkspacesApi(rapServerUrl, workspacePaths, cloudToken);
      const failedPulls = response.results.filter((r: { status: string; }) => r.status === "failed");
      if (failedPulls.length > 0) {
        showNotification(`Failed to update ${failedPulls.length} workspaces.`, "error");
        failedPulls.forEach((f: { path: string; message: string; }) => console.error(`Pull failed for ${f.path}: ${f.message}`));
      } else {
        showNotification("All team workspaces updated successfully!", "success");
      }
      if (activeScriptSource?.type === 'workspace' && currentDisplayPath) {
        loadScriptsFromPath(currentDisplayPath);
      }
    } catch (err) {
      const apiError = err as ApiError;
      showNotification(apiError.response?.data?.detail || "Failed to update team workspaces.", "error");
      console.error("Pull all team workspaces error:", err);
    }
  }, [activeTeam, cloudToken, currentTeamWorkspaces, userWorkspacePaths, showNotification, activeScriptSource, currentDisplayPath, loadScriptsFromPath, rapServerUrl]);

  const contextValue: ScriptContextProps = {
    scripts: scriptsWithFavorites,
    allScripts: allScripts,
    customScriptFolders: customScriptFolders,
    teamWorkspaces,
    selectedFolder,
    favoriteScripts,
    recentScripts: recentScriptsData,
    combinedScriptContent,
    toggleFavoriteScript,
    addRecentScript,
    updateScriptLastRunTime,
    addCustomScriptFolder,
    removeCustomScriptFolder,
    addTeamWorkspace,
    removeTeamWorkspace,
    updateTeamWorkspace,
    loadScriptsForFolder: loadScriptsFromPath,
    createNewScript,
    clearFavoriteScripts,
    clearRecentScripts,
    fetchScriptMetadata,
    setScripts,
    setCombinedScriptContent,
    clearScriptsForWorkspace,
    clearScripts,
    pullAllTeamWorkspaces,
    pullWorkspace,
    fetchTeamWorkspaces,
    fetchScriptManifest,
    toolLibraryPath: toolLibraryPath,
    setToolLibraryPath: setToolLibraryPath,
  };

  return (
    <ScriptContext.Provider value={contextValue}>{children}</ScriptContext.Provider>
  );
};