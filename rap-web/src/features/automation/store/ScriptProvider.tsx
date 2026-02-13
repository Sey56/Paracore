import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ScriptContext, ScriptContextProps } from './ScriptContext';
export { ScriptContext };
export type { ScriptContextProps };
import type { Script, RawScriptFromApi, ScriptParameter, RawScriptParameterData } from '@/types/scriptModel';
import { TeamScriptSource } from '@/types/index';
import { useNotifications } from '@/hooks/useNotifications';
import api from '@/api/axios';
import axios from 'axios';

// Create a silent API instance for background polling that doesn't trigger global logouts on 401
const silentApi = axios.create({ baseURL: 'http://localhost:8000' });
silentApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('rap_cloud_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

import useLocalStorage from '@/hooks/useLocalStorage';
import { useUI } from '@/hooks/useUI';
import { useAuth } from '@/features/auth';
import { isAxiosErrorWithResponseData } from '@/utils/errorUtils';
import { pullTeamSources as pullTeamSourcesApi } from '@/features/team-sources/services/teamSources';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { useRapServerUrl } from '@/hooks/useRapServerUrl';
import { useUserTeamSources } from '@/features/team-sources';

import { getRemoteSources, registerRemoteSource, deleteRemoteSource, updateRemoteSource } from '@/features/auth/services/rapAuthApiClient';
import { Role } from '@/features/auth';

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
  const { user, isAuthenticated, activeTeam, activeRole, cloudToken } = useAuth();
  const rapServerUrl = useRapServerUrl();
  const { userSourcePaths, isLoaded: userSourcesLoaded } = useUserTeamSources();

  const [scripts, setScripts] = useState<Script[]>([]);
  const scriptsRef = useRef<Script[]>([]);

  // Keep scriptsRef in sync with scripts state
  useEffect(() => {
    scriptsRef.current = scripts;
  }, [scripts]);

  // Use useLocalStorage to persist custom folders across restarts
  const [customScriptFolders, setCustomScriptFolders] = useLocalStorage<string[]>('rap_customScriptFolders', []);

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
      // Do NOT clear on error - keep local cache
    }
  }, [user, cloudToken, rapServerUrl, setCustomScriptFolders]);

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

  // Fetch folders on user change/login
  useEffect(() => {
    if (user) {
      fetchCustomScriptFolders();
    }
  }, [user, fetchCustomScriptFolders]);

  // Handle clearing on logout - only if truly logged out (no token in storage)
  useEffect(() => {
    const storedToken = localStorage.getItem('rap_cloud_token');
    if (!isAuthenticated && !storedToken) {
      setCustomScriptFolders([]);
    }
  }, [isAuthenticated, setCustomScriptFolders]);

  const [remoteScriptSources, setRemoteScriptSources] = useState<Record<number, TeamScriptSource[]>>({});

  const fetchRemoteScriptSources = useCallback(async () => {
    if (!activeTeam || !cloudToken) {
      setRemoteScriptSources({});
      return;
    }
    try {
      let sources: TeamScriptSource[] = [];
      // registered sources are only applicable for cloud teams
      if (activeTeam.team_id !== 0) {
        sources = await getRemoteSources(activeTeam.team_id, cloudToken);
      }

      setRemoteScriptSources(prev => ({
        ...prev,
        [activeTeam.team_id]: sources
      }));
    } catch (error) {
      console.error(`Failed to fetch registered script sources for team ${activeTeam.team_id}:`, error);
      setRemoteScriptSources(prev => ({
        ...prev,
        [activeTeam.team_id]: []
      }));
    }
  }, [activeTeam, cloudToken, setRemoteScriptSources]);

  useEffect(() => {
    fetchRemoteScriptSources();
  }, [fetchRemoteScriptSources, activeTeam]);

  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [favoriteScripts, setFavoriteScripts] = useLocalStorage<string[]>('rap_favoriteScripts', []);
  const [recentScripts, setRecentScripts] = useLocalStorage<string[]>('rap_recentScripts', []);
  const [lastRunTimes, setLastRunTimes] = useLocalStorage<Record<string, string>>('rap_lastRunTimes', {});
  const [combinedScriptContent, setCombinedScriptContent] = useState<string | null>(null);
  const [currentDisplayPath, setCurrentDisplayPath] = useState<string | null>(null);
  const [activeSyncSessions, setActiveSyncSessions] = useState<Record<string, string>>({});

  const fetchActiveSyncSessions = useCallback(async () => {
    try {
      const response = await silentApi.get('/api/sync/active-sessions');
      if (response.data) {
        setActiveSyncSessions(response.data);
      }
    } catch (err) {
      // Silently fail background poll
    }
  }, []);

  // Poll for active sync sessions every 5 seconds to keep UI in sync
  useEffect(() => {
    if (!isAuthenticated) return;
    
    fetchActiveSyncSessions();
    const interval = setInterval(fetchActiveSyncSessions, 5000);
    return () => clearInterval(interval);
  }, [fetchActiveSyncSessions, isAuthenticated]);

  const isSyncActive = useCallback((scriptPath: string) => {
    const normalized = scriptPath.replace(/\\/g, '/').toLowerCase();
    // Keys in activeSyncSessions might still be mixed case, so we check case-insensitively
    return Object.keys(activeSyncSessions).some(key => key.toLowerCase() === normalized);
  }, [activeSyncSessions]);

  const currentTeamSources = useMemo(() => {
    return activeTeam ? (remoteScriptSources[activeTeam.team_id] || []) : [];
  }, [activeTeam, remoteScriptSources]);

  const canUseLocalFolders = useMemo(() => {
    if (!user || !activeTeam) return false;
    // Admins can always use local folders
    if (activeRole === Role.Admin) return true;
    // In Personal Team, everyone is implicitly an admin or it's their personal space
    if (activeTeam.owner_id === Number(user.id)) return true;
    return false;
  }, [user, activeTeam, activeRole]);

  const ignorePersistRef = useRef(false);

  useEffect(() => {
    setScripts([]);
    setCurrentDisplayPath(null);
    setSelectedFolder(null);
    ignorePersistRef.current = true;
    setActiveScriptSource(null);
  }, [activeTeam, setActiveScriptSource]);

  // Persist activeScriptSource whenever it changes
  useEffect(() => {
    if (activeTeam) {
      if (ignorePersistRef.current && activeScriptSource === null) {
        ignorePersistRef.current = false;
        return;
      }

      const key = `rap_lastActiveSource_${activeTeam.team_id}`;
      // Rule: Only persist/store local folders if role allows it
      if (activeScriptSource) {
        if (activeScriptSource.type === 'local' && !canUseLocalFolders) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, JSON.stringify(activeScriptSource));
        }
      } else {
        localStorage.removeItem(key);
      }
    }
  }, [activeTeam, activeScriptSource, canUseLocalFolders]);

  // Restore activeScriptSource when activeTeam changes (and no source is selected yet)
  useEffect(() => {
    // We wait for activeTeam to be present and user team sources to be loaded.
    if (activeTeam && !activeScriptSource && userSourcesLoaded) {
      const key = `rap_lastActiveSource_${activeTeam.team_id}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.type === 'team') {
            // Validate that the source still exists in our local paths
            if (userSourcePaths[parsed.id]) {
              setActiveScriptSource(parsed);
            } else {
              console.log(`[ScriptProvider] Stored active source ${parsed.id} not found in user paths. Clearing.`);
              localStorage.removeItem(key);
            }
          } else {
            // For local folders, restore directly AND ensure it's in the list
            setActiveScriptSource(parsed);
            if (parsed.type === 'local' && parsed.path) {
              setCustomScriptFolders(prev => {
                if (!prev.includes(parsed.path)) {
                  // Verify we aren't adding duplicates
                  return [...prev, parsed.path];
                }
                return prev;
              });
            }
          }
        } catch (e) {
          console.error("Failed to parse saved active script source:", e);
        }
      }
    }
  }, [activeTeam, userSourcesLoaded, userSourcePaths, activeScriptSource, setActiveScriptSource, setCustomScriptFolders]);


  const loadScriptsFromPath = useCallback(async (folderPath: string, suppressNotification: boolean = false): Promise<Script[] | undefined> => {
    if (!folderPath) {
      setScripts([]);
      return [];
    }

    // If the path is a direct file path, handle it differently
    if (folderPath.endsWith('.cs')) {
      try {
        if (!suppressNotification) {
          showNotification(`Loading script: ${folderPath}...`, "info");
        }
        // We need the get the metadata for this single script.
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
        return [scriptObject];

      } catch (error) {
        console.error(`Failed to fetch metadata for script ${folderPath}:`, error);
        const message = error instanceof Error ? error.message : "Unknown error";
        showNotification(`Failed to fetch metadata: ${message}`, "error");
        setScripts([]);
        return undefined;
      }
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
        return undefined;
      } else {
        const currentScripts = scriptsRef.current;
        const transformedData: Script[] = data.map((s: RawScriptFromApi) => {
          const normalizedNewId = s.id.replace(/\\/g, '/');
          const existing = currentScripts.find(es => {
            const normalizedExistingId = es.id.replace(/\\/g, '/');
            return normalizedExistingId === normalizedNewId;
          });
          const transformed: Script = {
            ...s,
            id: normalizedNewId, // Keep IDs normalized
            metadata: {
              ...s.metadata,
              documentType: s.metadata.document_type,
              gitInfo: s.metadata.git_info ? {
                lastCommitDate: s.metadata.git_info.last_commit_date,
                lastCommitAuthor: s.metadata.git_info.last_commit_author,
                lastCommitMessage: s.metadata.git_info.last_commit_message,
              } : undefined,
              isProtected: s.metadata.is_protected,
              isCompiled: s.metadata.is_compiled,
            },
          };

          // Merge with existing to preserve parameters and computed metadata
          if (existing) {
            return {
              ...existing,
              ...transformed,
              metadata: {
                ...existing.metadata,
                ...transformed.metadata,
              },
              parameters: (transformed.parameters && transformed.parameters.length > 0)
                ? transformed.parameters
                : (existing.parameters && existing.parameters.length > 0 ? existing.parameters : [])
            };
          }
          return transformed;
        });

        // DE-DUPLICATION: Ensure unique scripts by ID
        const uniqueScripts = transformedData.filter((script, index, self) =>
          index === self.findIndex((t) => t.id === script.id)
        );

        setScripts(uniqueScripts);
        setSelectedFolder(folderPath);
        // Only show success if we actually found scripts
        if (uniqueScripts.length > 0 && !suppressNotification) {
          showNotification(`Loaded ${uniqueScripts.length} scripts.`, "success");
        }
        return uniqueScripts;
      }
    } catch (error: unknown) {
      console.error(`Failed to fetch scripts from ${folderPath}:`, error);

      const err = error as { response?: { status?: number; data?: { detail?: string } } };
      let message = error instanceof Error ? error.message : "Unknown error";

      // V2.5 UI Polish: Descriptive message for missing folders (renamed/deleted)
      if (err.response?.status === 400) {
        message = "Can't find the script source. Make sure you have not deleted or renamed it.";
      } else if (err.response?.data?.detail) {
        message = err.response.data.detail;
      }

      showNotification(`Failed to fetch scripts: ${message}`, "error");
      setScripts([]);
      return undefined;
    }
  }, [showNotification, setSelectedFolder]);

  useEffect(() => {
    let path_to_load: string | null = null;

    if (activeScriptSource) {
      if (activeScriptSource.type === 'local') {
        // Final safety gate: If source is local but user can't use them, clear it immediately
        if (!canUseLocalFolders) {
          console.warn("[ScriptProvider] Attempted to load local folder for restricted role. Clearing source.");
          setActiveScriptSource(null);
          return;
        }
        path_to_load = activeScriptSource.path;
      } else if (activeScriptSource.type === 'team') {
        path_to_load = userSourcePaths[Number(activeScriptSource.id)]?.path;
      }
    }

    if (path_to_load) {
      loadScriptsFromPath(path_to_load);
      setSelectedFolder(path_to_load);
    } else {
      setScripts([]);
      setSelectedFolder(null);
    }
  }, [activeScriptSource, loadScriptsFromPath, setSelectedFolder, userSourcePaths, showNotification, canUseLocalFolders, setActiveScriptSource]);

  const { ParacoreConnected } = useRevitStatus();
  const [toolLibraryPath, setToolLibraryPath] = useLocalStorage<string | null>('agentScriptsPath', null);

  const fetchScriptMetadata = useCallback(async (scriptId: string) => {
    // Use the ref to avoid dependency on the 'scripts' state
    const script = scriptsRef.current.find(s => s.id === scriptId);
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
  }, [showNotification]); // NO SCRIPTS DEPENDENCY HERE

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

    // First, check for duplicates using the current state.
    if (customScriptFolders.includes(folderPath)) {
      showNotification(`Source '${folderPath}' is already added.`, "warning");
      return; // Exit early if it's a duplicate
    }

    // If not a duplicate, proceed with adding the folder.
    const newState = [...customScriptFolders, folderPath];
    setCustomScriptFolders(newState);
    await saveCustomScriptFolders(newState);
    showNotification(`Added custom script source: ${folderPath}.`, "success");

  }, [user, customScriptFolders, saveCustomScriptFolders, showNotification]);

  const addCustomScriptFolders = useCallback(async (folderPaths: string[]): Promise<void> => {
    if (!user) return;

    // Filter out duplicates
    const newFolders = folderPaths.filter(path => !customScriptFolders.includes(path));
    
    if (newFolders.length === 0) {
      if (folderPaths.length === 1) {
        showNotification(`Source is already added.`, "warning");
      }
      return;
    }

    const newState = [...customScriptFolders, ...newFolders];
    setCustomScriptFolders(newState);
    await saveCustomScriptFolders(newState);
    showNotification(`Added ${newFolders.length} script sources.`, "success");
  }, [user, customScriptFolders, saveCustomScriptFolders, showNotification]);

  const clearAllCustomScriptFolders = useCallback(async () => {
    if (!user) return;
    setCustomScriptFolders([]);
    await saveCustomScriptFolders([]);
    if (activeScriptSource?.type === 'local') {
      setActiveScriptSource(null);
    }
    showNotification("All script sources cleared.", "info");
  }, [user, saveCustomScriptFolders, activeScriptSource, setActiveScriptSource, setCustomScriptFolders]);

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
    showNotification(`Removed custom script source: ${folderPath}.`, "info");
  }, [user, saveCustomScriptFolders, selectedFolder, showNotification, activeScriptSource, setActiveScriptSource]);

  const addRemoteScriptSource = useCallback(async (teamId: number, source: TeamScriptSource): Promise<void> => {
    if (!cloudToken) {
      showNotification("Not authenticated.", "error");
      return;
    }
    try {
      let registeredSource;
      if (teamId === 0) {
        // Local Mode
        const response = await api.post("/api/team-sources/register", {
          team_id: teamId,
          name: source.name,
          repo_url: source.repo_url
        });
        registeredSource = response.data;
      } else {
        registeredSource = await registerRemoteSource(teamId, source.name, source.repo_url, cloudToken);
      }

      setRemoteScriptSources(prev => ({
        ...prev,
        [teamId]: [...(prev[teamId] || []), registeredSource]
      }));
      showNotification(`Added script source '${registeredSource.name}' to team.`, "success");
    } catch (error) {
      console.error("Failed to register script source:", error);
      if (isAxiosErrorWithResponseData(error) && error.response.status === 409) {
        showNotification(error.response.data.detail, "warning");
      } else {
        const message = error instanceof Error ? error.message : "An unknown error occurred.";
        showNotification(`Failed to add script source: ${message}`, "error");
      }
      throw error;
    }
  }, [cloudToken, setRemoteScriptSources, showNotification]);

  const removeRemoteScriptSource = useCallback(async (teamId: number, sourceId: number): Promise<void> => {
    if (!cloudToken) {
      showNotification("Not authenticated.", "error");
      return;
    }
    try {
      if (teamId === 0) {
        await api.delete(`/api/team-sources/registered/${sourceId}`);
      } else {
        await deleteRemoteSource(sourceId, cloudToken);
      }

      setRemoteScriptSources(prev => ({
        ...prev,
        [teamId]: (prev[teamId] || []).filter(w => w.id !== sourceId)
      }));
      showNotification(`Removed script source from team.`, "info");
    } catch (error) {
      console.error("Failed to remove script source:", error);
      const message = error instanceof Error ? error.message : "An unknown error occurred.";
      showNotification(`Failed to remove script source: ${message}`, "error");
    }
  }, [cloudToken, setRemoteScriptSources, showNotification]);

  const updateRemoteScriptSource = useCallback(async (teamId: number, sourceId: number, name: string | undefined, repoUrl: string | undefined): Promise<void> => {
    if (!cloudToken) {
      showNotification("Not authenticated.", "error");
      return;
    }
    try {
      let updatedSource;
      if (teamId === 0) {
        showNotification("Updating script source details not supported in Local Mode yet.", "warning");
        return;
      } else {
        updatedSource = await updateRemoteSource(sourceId, name, repoUrl, cloudToken);
      }

      setRemoteScriptSources(prev => ({
        ...prev,
        [teamId]: (prev[teamId] || []).map(w => w.id === updatedSource.id ? updatedSource : w)
      }));
      showNotification(`Updated script source '${updatedSource.name}'.`, "success");
    } catch (error) {
      console.error("Failed to update script source:", error);
      const message = error instanceof Error ? error.message : "An unknown error occurred.";
      showNotification(`Failed to update script source: ${message}`, "error");
    }
  }, [cloudToken, setRemoteScriptSources, showNotification]);

  const clearScriptsForSource = useCallback((sourcePath: string) => {
    if (currentDisplayPath === sourcePath) {
      setScripts([]);
      setCurrentDisplayPath(null);
    }
  }, [currentDisplayPath]);

  const createNewScript = useCallback(async (details: {
    parent_folder: string;
    script_type: 'single' | 'multi';
    script_name: string;
    folder_name?: string;
    template_id?: string;
    generated_logic?: string;
    generated_params?: string;
    overwrite?: boolean;
  }): Promise<Script | undefined> => {
    try {
      const response = await api.post("/api/scripts/new", details);
      showNotification(response.data.message, "success");

      const newScriptPath = response.data.script_path?.replace(/\\/g, '/'); // Normalize path

      const loadedScripts = await loadScriptsFromPath(details.parent_folder, true); // Silent reload

      // Refresh sync state
      fetchActiveSyncSessions();

      if (loadedScripts && newScriptPath) {
        const newScript = loadedScripts.find(s => s.absolutePath?.replace(/\\/g, '/') === newScriptPath);
        return newScript;
      }
      return undefined;
    } catch (error: unknown) {
      const message = isAxiosErrorWithResponseData(error) ? error.response.data.detail : (error instanceof Error ? error.message : "An unknown error occurred.");
      showNotification(`Failed to create script: ${message}`, "error");
      throw new Error(message);
    }
  }, [loadScriptsFromPath, showNotification, fetchActiveSyncSessions]);

  const deleteScript = useCallback(async (script: Script): Promise<boolean> => {
    try {
      const response = await api.post("/api/scripts/delete", {
        script_path: script.absolutePath,
        script_type: script.type
      });
      
      if (response.data.success) {
        showNotification(response.data.message, "success");
        // Update local state immediately
        setScripts(prev => prev.filter(s => s.id !== script.id));
        return true;
      }
      return false;
    } catch (error: unknown) {
      const message = isAxiosErrorWithResponseData(error) ? error.response.data.detail : (error instanceof Error ? error.message : "An unknown error occurred.");
      showNotification(`Failed to delete: ${message}`, "error");
      return false;
    }
  }, [showNotification]);

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

  const pullTeamSource = useCallback(async (sourcePath: string) => {
    if (!activeTeam || !cloudToken) {
      showNotification("Not authenticated or no active team.", "error");
      return;
    }

    if (!sourcePath) {
      showNotification("No source path provided.", "error");
      return;
    }

    showNotification(`Updating script source at ${sourcePath}...`, "info");
    try {
      if (!rapServerUrl) {
        showNotification("RAP Server URL not available.", "error");
        return;
      }
      const response = await pullTeamSourcesApi(rapServerUrl, [sourcePath], cloudToken, "main");
      const result = response.results[0];
      if (result.status === "failed") {
        showNotification(`Failed to update script source: ${result.message}`, "error");
        console.error(`Pull failed for ${result.path}: ${result.message}`);
      } else {
        showNotification("Script source updated successfully!", "success");
      }
      if (activeScriptSource?.type === 'team' && currentDisplayPath) {
        loadScriptsFromPath(currentDisplayPath, true);
      }
    } catch (err) {
      const apiError = err as ApiError;
      showNotification(apiError.response?.data?.detail || "Failed to update script source.", "error");
      console.error("Pull source error:", err);
    }
  }, [activeTeam, cloudToken, showNotification, activeScriptSource, currentDisplayPath, loadScriptsFromPath, rapServerUrl]);

  const pullAllTeamSources = useCallback(async () => {
    if (!activeTeam || !cloudToken) {
      showNotification("Not authenticated or no active team.", "error");
      return;
    }

    const sourcePaths = currentTeamSources
      .map(ws => userSourcePaths[ws.id]?.path)
      .filter((path): path is string => !!path);

    if (sourcePaths.length === 0) {
      showNotification("No team script sources have been set up on this machine for this team.", "info");
      return;
    }

    showNotification("Updating team script sources...!", "info");
    try {
      if (!rapServerUrl) {
        showNotification("RAP Server URL not available.", "error");
        return;
      }
      const response = await pullTeamSourcesApi(rapServerUrl, sourcePaths, cloudToken);
      const failedPulls = response.results.filter((r: { status: string; }) => r.status === "failed");
      if (failedPulls.length > 0) {
        showNotification(`Failed to update ${failedPulls.length} script sources.`, "error");
        failedPulls.forEach((f: { path: string; message: string; }) => console.error(`Pull failed for ${f.path}: ${f.message}`));
      } else {
        showNotification("All team script sources updated successfully!", "success");
      }
      if (activeScriptSource?.type === 'team' && currentDisplayPath) {
        loadScriptsFromPath(currentDisplayPath);
      }
    } catch (err) {
      const apiError = err as ApiError;
      showNotification(apiError.response?.data?.detail || "Failed to update team script sources.", "error");
      console.error("Pull all team sources error:", err);
    }
  }, [activeTeam, cloudToken, currentTeamSources, userSourcePaths, showNotification, activeScriptSource, currentDisplayPath, loadScriptsFromPath, rapServerUrl]);

  const reloadScript = useCallback(async (script: Script, options?: { silent?: boolean }) => {
    const isSilent = options?.silent ?? false;
    try {
      if (!isSilent) {
        showNotification(`Reloading ${script.name}...`, "info");
      }

      const [metadataResponse, paramsResponse] = await Promise.all([
        api.post("/api/script-metadata", {
          scriptPath: script.absolutePath,
          type: script.type
        }),
        api.post("/api/get-script-parameters", {
          scriptPath: script.absolutePath,
          type: script.type
        }).catch(err => ({ data: { parameters: [] as RawScriptParameterData[], error: err.message } })) // Gracefully handle param errors
      ]);

      const metadata = metadataResponse.data.metadata;
      const rawParams = (paramsResponse.data.parameters || []) as RawScriptParameterData[];

      const updateLogic = (s: Script) => {
        if (!s?.id || !script?.id) return s;
        const normalizedSid = s.id.replace(/\\/g, '/');
        const normalizedTargetId = script.id.replace(/\\/g, '/');

        if (normalizedSid !== normalizedTargetId) return s;

        // Map raw parameters and preserve existing options/values
        const mergedParameters: ScriptParameter[] = rawParams.map((p) => {
          let defaultValue: string | number | boolean = p.defaultValueJson;
          try {
            defaultValue = JSON.parse(p.defaultValueJson);
          } catch { /* Ignore if not JSON */ }
          if (p.type === 'number' && typeof defaultValue === 'string') defaultValue = parseFloat(defaultValue) || 0;
          else if (p.type === 'boolean' && typeof defaultValue === 'string') defaultValue = defaultValue.toLowerCase() === 'true';

          const existingParam = s.parameters?.find(ep => ep.name === p.name && ep.type === p.type);

          if (existingParam?.options && existingParam.options.length > 0) {
            // console.debug(`[ScriptProvider] Preserving ${existingParam.options.length} options for parameter: ${p.name}`);
          }

          return {
            ...(existingParam || {} as ScriptParameter),
            ...p,
            type: p.type as ScriptParameter['type'],
            value: existingParam ? existingParam.value : defaultValue,
            defaultValue: defaultValue,
            // Preserve dynamic UI state
            inputType: (existingParam?.inputType && existingParam.inputType !== 'String')
              ? existingParam.inputType
              : p.inputType,
            options: (existingParam?.options && existingParam.options.length > 0)
              ? existingParam.options
              : ((p as RawScriptParameterData).options || []),
            unit: p.unit,
            selectionType: p.selectionType
          };
        });

        return {
          ...s,
          metadata: {
            ...s.metadata,
            documentType: metadata.document_type ?? 'Any',
            description: metadata.description ?? '',
            author: metadata.author ?? '',
            website: metadata.website ?? '',
            categories: metadata.categories ?? [],
            usage_examples: metadata.usage_examples ?? [],
            dependencies: metadata.dependencies ?? [],
            displayName: metadata.displayName ?? metadata.name ?? s.metadata?.displayName ?? s.name,
            dateCreated: metadata.dateCreated ?? s.metadata?.dateCreated,
            dateModified: metadata.dateModified ?? s.metadata?.dateModified,
            lastRun: s.metadata?.lastRun,
            gitInfo: metadata.git_info ? {
              lastCommitDate: metadata.git_info.last_commit_date,
              lastCommitAuthor: metadata.git_info.last_commit_author,
              lastCommitMessage: metadata.git_info.last_commit_message,
            } : s.metadata?.gitInfo,
            isProtected: metadata.is_protected ?? s.metadata?.isProtected,
            isCompiled: metadata.is_compiled ?? s.metadata?.isCompiled
          },
          parameters: mergedParameters
        };
      };

      setScripts(prevScripts => prevScripts.map(updateLogic));

      if (!isSilent) {
        showNotification(`Reloaded ${script.name}.`, "success");
      }
    } catch (error) {
      console.error(`Failed to reload script ${script.name}:`, error);
      if (!isSilent) {
        showNotification(`Failed to reload script: ${error instanceof Error ? error.message : "Unknown error"}`, "error");
      }
    }
  }, [showNotification, setScripts]);

  const contextValue: ScriptContextProps = useMemo(() => ({
    scripts: scriptsWithFavorites,
    customScriptFolders: customScriptFolders,
    remoteScriptSources,
    selectedFolder,
    favoriteScripts,
    recentScripts: recentScriptsData,
    combinedScriptContent,
    toggleFavoriteScript,
    addRecentScript,
    updateScriptLastRunTime,
    addCustomScriptFolder,
    addCustomScriptFolders,
    removeCustomScriptFolder,
    clearAllCustomScriptFolders,
    addRemoteScriptSource,
    removeRemoteScriptSource,
    updateRemoteScriptSource,
    loadScriptsForFolder: loadScriptsFromPath,
    createNewScript,
    deleteScript,
    isSyncActive,
    activeSyncSessions,
    clearFavoriteScripts,
    clearRecentScripts,
    fetchScriptMetadata,
    setScripts,
    setCombinedScriptContent,
    clearScriptsForSource,
    clearScripts,
    reloadScript,
    pullAllTeamSources,
    pullTeamSource,
    fetchRemoteScriptSources,
    toolLibraryPath: toolLibraryPath,
    setToolLibraryPath: setToolLibraryPath,
  }), [
    scriptsWithFavorites,
    customScriptFolders,
    remoteScriptSources,
    selectedFolder,
    favoriteScripts,
    recentScriptsData,
    combinedScriptContent,
    toggleFavoriteScript,
    addRecentScript,
    updateScriptLastRunTime,
    addCustomScriptFolder,
    addCustomScriptFolders,
    removeCustomScriptFolder,
    clearAllCustomScriptFolders,
    addRemoteScriptSource,
    removeRemoteScriptSource,
    updateRemoteScriptSource,
    loadScriptsFromPath,
    createNewScript,
    deleteScript,
    isSyncActive,
    activeSyncSessions,
    clearFavoriteScripts,
    clearRecentScripts,
    fetchScriptMetadata,
    setScripts,
    setCombinedScriptContent,
    clearScriptsForSource,
    clearScripts,
    reloadScript,
    pullAllTeamSources,
    pullTeamSource,
    fetchRemoteScriptSources,
    toolLibraryPath,
    setToolLibraryPath
  ]);

  return (
    <ScriptContext.Provider value={contextValue}>{children}</ScriptContext.Provider>
  );
};
