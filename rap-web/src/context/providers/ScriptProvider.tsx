import { useState, useEffect, useCallback, useMemo } from 'react';
import { ScriptContext, ScriptContextProps } from '../ScriptContext';
import type { Script, RawScriptFromApi } from '@/types/scriptModel';
import { Workspace } from '@/types/index';
import { useNotifications } from '@/hooks/useNotifications';
import api from '@/api/axios';
import useLocalStorage from '@/hooks/useLocalStorage';
import { useUI } from '@/hooks/useUI';
import { useAuth } from '@/hooks/useAuth';
import { isAxiosErrorWithResponseData } from '@/utils/errorUtils';
import { pullTeamWorkspaces as pullTeamWorkspacesApi } from '@/api/rapServerApiClient';
import { useRapServerUrl } from '@/hooks/useRapServerUrl';
import { useUserWorkspaces } from '@/hooks/useUserWorkspaces';

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
  // CORRECTED: useLocalStorage key is now user-specific
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
    if (!user || !cloudToken || !rapServerUrl || !activeTeam) {
      setTeamWorkspaces({}); // Clear if no active team or not authenticated
      return;
    }
    try {
      const response = await api.get(
        `${rapServerUrl}/api/workspaces/registered/${activeTeam.team_id}`,
        {
          headers: { Authorization: `Bearer ${cloudToken}` },
        }
      );
      console.log("fetchTeamWorkspaces - response.data:", response.data);
      setTeamWorkspaces(prev => ({
        ...prev,
        [activeTeam.team_id]: response.data
      }));
    } catch (error) {
      console.error(`Failed to fetch registered workspaces for team ${activeTeam.team_id}:`, error);
      setTeamWorkspaces(prev => ({
        ...prev,
        [activeTeam.team_id]: []
      }));
    }
  }, [user, cloudToken, rapServerUrl, activeTeam, setTeamWorkspaces]);

  useEffect(() => {
    fetchTeamWorkspaces();
  }, [fetchTeamWorkspaces]);
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

  const loadScriptsFromPath = useCallback(async (folderPath: string) => {
    if (!folderPath) {
        setScripts([]);
        return;
    }
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
      console.error(`Failed to fetch scripts from ${folderPath}:`, error);
      const message = error instanceof Error ? error.message : "Unknown error";
      showNotification(`Failed to fetch scripts: ${message}`, "error");
      setScripts([]);
    }
  }, [showNotification, setSelectedFolder]);

  useEffect(() => {
    if (activeScriptSource) {
      if (activeScriptSource.type === 'local') {
        setCurrentDisplayPath(activeScriptSource.path);
        setSelectedFolder(activeScriptSource.path);
      } else if (activeScriptSource.type === 'workspace') {
        setCurrentDisplayPath(activeScriptSource.path);
        setSelectedFolder(activeScriptSource.path);
      }
    } else {
      setCurrentDisplayPath(null);
      setSelectedFolder(null);
    }
  }, [activeScriptSource, setSelectedFolder]);

  useEffect(() => {
    if (currentDisplayPath) {
      loadScriptsFromPath(currentDisplayPath);
    } else {
      setScripts([]);
    }
  }, [currentDisplayPath, loadScriptsFromPath]);

  const fetchAllScripts = useCallback(async () => {
    let newAllScripts: Script[] = [];
    if (!isAuthenticated || !activeTeam) {
      setAllScripts([]);
      return;
    }

    const workspacePaths = currentTeamWorkspaces
      .map(ws => userWorkspacePaths[ws.id]?.path)
      .filter((path): path is string => !!path);

    const scriptSourcesToFetch = [...customScriptFolders, ...workspacePaths];

    for (const path of scriptSourcesToFetch) {
        if (!path) continue;
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
  }, [isAuthenticated, activeTeam, customScriptFolders, currentTeamWorkspaces, userWorkspacePaths]);

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

  const addCustomScriptFolder = useCallback(async (folderPath: string): Promise<void> => {
    if (!user) return;
    setCustomScriptFolders(prev => {
      const newState = [...prev, folderPath];
      saveCustomScriptFolders(newState); // Save to server
      return newState;
    });
    showNotification(`Added custom script folder: ${folderPath}.`, "success");
  }, [user, saveCustomScriptFolders, showNotification]);

  const removeCustomScriptFolder = useCallback((folderPath: string) => {
    if (!user) return;
    setCustomScriptFolders(prev => {
      const newState = prev.filter(folder => folder !== folderPath);
      saveCustomScriptFolders(newState); // Save to server
      return newState;
    });
    if (selectedFolder === folderPath) {
      setScripts([]);
      setSelectedFolder(null);
    }
    showNotification(`Removed custom script folder: ${folderPath}.`, "info");
  }, [user, saveCustomScriptFolders, selectedFolder, showNotification]);

  const addTeamWorkspace = useCallback(async (teamId: number, workspace: Workspace): Promise<void> => {
    if (!user || !cloudToken || !rapServerUrl) {
      showNotification("Not authenticated.", "error");
      return;
    }
    try {
      const response = await api.post(
        `${rapServerUrl}/api/workspaces/register`,
        {
          team_id: teamId,
          name: workspace.name,
          repo_url: workspace.repo_url,
        },
        {
          headers: { Authorization: `Bearer ${cloudToken}` },
        }
      );
      const registeredWorkspace = response.data; // Backend should return the registered workspace with its ID

      setTeamWorkspaces(prev => ({
        ...prev,
        [teamId]: [...(prev[teamId] || []), registeredWorkspace] // Use the registeredWorkspace from backend
      }));
      showNotification(`Added workspace '${registeredWorkspace.name}' to team.`, "success");
    } catch (error) {
      console.error("Failed to register workspace:", error);
      const message = error instanceof Error ? error.message : "An unknown error occurred.";
      showNotification(`Failed to add workspace: ${message}`, "error");
    }
  }, [user, cloudToken, rapServerUrl, setTeamWorkspaces, showNotification]);

  const removeTeamWorkspace = useCallback(async (teamId: number, workspaceId: string): Promise<void> => { // workspaceId should be string here
    if (!user || !cloudToken || !rapServerUrl) {
      showNotification("Not authenticated.", "error");
      return;
    }
    try {
      await api.delete(
        `${rapServerUrl}/api/workspaces/registered/${Number(workspaceId)}`, // Convert to number for backend
        {
          headers: { Authorization: `Bearer ${cloudToken}` },
        }
      );

      setTeamWorkspaces(prev => ({
        ...prev,
        [teamId]: (prev[teamId] || []).filter(w => w.id !== workspaceId) // w.id is string, workspaceId is string
      }));
      showNotification(`Removed workspace from team.`, "info");
    } catch (error) {
      console.error("Failed to remove workspace:", error);
      const message = error instanceof Error ? error.message : "An unknown error occurred.";
      showNotification(`Failed to remove workspace: ${message}`, "error");
    }
  }, [user, cloudToken, rapServerUrl, setTeamWorkspaces, showNotification]);

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
      const response = await pullTeamWorkspacesApi(rapServerUrl, [workspacePath], cloudToken);
      const result = response.results[0];
      if (result.status === "failed") {
        showNotification(`Failed to update workspace: ${result.message}`, "error");
        console.error(`Pull failed for ${result.path}: ${result.message}`);
      } else {
        showNotification("Workspace updated successfully!", "success");
      }
      if (activeScriptSource?.type === 'workspace' && currentDisplayPath) {
        loadScriptsFromPath(currentDisplayPath);
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
  };

  return (
    <ScriptContext.Provider value={contextValue}>{children}</ScriptContext.Provider>
  );
};