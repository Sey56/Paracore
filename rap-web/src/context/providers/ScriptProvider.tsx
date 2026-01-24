import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ScriptContext, ScriptContextProps } from './ScriptContext';
import type { Script, RawScriptFromApi, ScriptParameter, RawScriptParameterData } from '@/types/scriptModel';
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
import { Role } from '@/context/authTypes';

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
  const { userWorkspacePaths, isLoaded: userWorkspacesLoaded } = useUserWorkspaces();

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

  const [teamWorkspaces, setTeamWorkspaces] = useState<Record<number, Workspace[]>>({});

  const fetchTeamWorkspaces = useCallback(async () => {
    if (!activeTeam || !cloudToken) {
      setTeamWorkspaces({});
      return;
    }
    try {
      let workspaces: Workspace[] = [];
      // registered workspaces are only applicable for cloud teams
      if (activeTeam.team_id !== 0) {
        workspaces = await getTeamWorkspaces(activeTeam.team_id, cloudToken);
      }

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
  const [favoriteScripts, setFavoriteScripts] = useLocalStorage<string[]>('rap_favoriteScripts', []);
  const [recentScripts, setRecentScripts] = useLocalStorage<string[]>('rap_recentScripts', []);
  const [lastRunTimes, setLastRunTimes] = useLocalStorage<Record<string, string>>('rap_lastRunTimes', {});
  const [combinedScriptContent, setCombinedScriptContent] = useState<string | null>(null);
  const [currentDisplayPath, setCurrentDisplayPath] = useState<string | null>(null);

  const currentTeamWorkspaces = useMemo(() => {
    return activeTeam ? (teamWorkspaces[activeTeam.team_id] || []) : [];
  }, [activeTeam, teamWorkspaces]);

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
    // We wait for activeTeam to be present and user workspaces to be loaded.
    if (activeTeam && !activeScriptSource && userWorkspacesLoaded) {
      const key = `rap_lastActiveSource_${activeTeam.team_id}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.type === 'workspace') {
            // Validate that the workspace still exists in our local paths
            if (userWorkspacePaths[parsed.id]) {
              setActiveScriptSource(parsed);
            } else {
              console.log(`[ScriptProvider] Stored active workspace ${parsed.id} not found in user paths. Clearing.`);
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
  }, [activeTeam, userWorkspacesLoaded, userWorkspacePaths, activeScriptSource, setActiveScriptSource, setCustomScriptFolders]);


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
    } catch (error) {
      console.error(`Failed to fetch scripts from ${folderPath}:`, error);
      const message = error instanceof Error ? error.message : "Unknown error";
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
  }, [activeScriptSource, loadScriptsFromPath, setSelectedFolder, userWorkspacePaths, showNotification, canUseLocalFolders, setActiveScriptSource]);

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
      showNotification(`Folder '${folderPath}' is already added.`, "warning");
      return; // Exit early if it's a duplicate
    }

    // If not a duplicate, proceed with adding the folder.
    const newState = [...customScriptFolders, folderPath];
    setCustomScriptFolders(newState);
    await saveCustomScriptFolders(newState);
    showNotification(`Added custom script folder: ${folderPath}.`, "success");

  }, [user, customScriptFolders, saveCustomScriptFolders, showNotification]);

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
      let registeredWorkspace;
      if (teamId === 0) {
        // Local Mode
        const response = await api.post("/api/workspaces/register", {
          team_id: teamId,
          name: workspace.name,
          repo_url: workspace.repo_url
        });
        registeredWorkspace = response.data;
      } else {
        registeredWorkspace = await registerWorkspace(teamId, workspace.name, workspace.repo_url, cloudToken);
      }

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
      if (teamId === 0) {
        await api.delete(`/api/workspaces/registered/${workspaceId}`);
      } else {
        await deleteRegisteredWorkspace(workspaceId, cloudToken);
      }

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
      let updatedWorkspace;
      if (teamId === 0) {
        // Local Mode - Update not implemented in router yet?
        // I didn't see an update endpoint in workspace_router.py. 
        // Let's assume it's NOT supported locally for now or fallback to error.
        // Or just do nothing.
        // Wait, user might validly try to rename. 
        // Since I didn't see PUT in workspace_router.py, let's warn.
        showNotification("Updating workspace details not supported in Local Mode yet.", "warning");
        return;
      } else {
        updatedWorkspace = await updateRegisteredWorkspace(workspaceId, name, repoUrl, cloudToken);
      }

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
  }): Promise<Script | undefined> => {
    try {
      const response = await api.post("/api/scripts/new", details);
      showNotification(response.data.message, "success");

      const newScriptPath = response.data.script_path?.replace(/\\/g, '/'); // Normalize path

      const loadedScripts = await loadScriptsFromPath(details.parent_folder);

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
              : ((p as any).options || []),
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
            } : s.metadata?.gitInfo
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
    reloadScript,
    pullAllTeamWorkspaces,
    pullWorkspace,
    fetchTeamWorkspaces,
    toolLibraryPath: toolLibraryPath,
    setToolLibraryPath: setToolLibraryPath,
  }), [
    scriptsWithFavorites,
    customScriptFolders,
    teamWorkspaces,
    selectedFolder,
    favoriteScripts,
    recentScriptsData,
    combinedScriptContent,
    toggleFavoriteScript,
    addRecentScript,
    updateScriptLastRunTime,
    addCustomScriptFolder,
    removeCustomScriptFolder,
    addTeamWorkspace,
    removeTeamWorkspace,
    updateTeamWorkspace,
    loadScriptsFromPath,
    createNewScript,
    clearFavoriteScripts,
    clearRecentScripts,
    fetchScriptMetadata,
    setScripts,
    setCombinedScriptContent,
    clearScriptsForWorkspace,
    clearScripts,
    reloadScript,
    pullAllTeamWorkspaces,
    pullWorkspace,
    fetchTeamWorkspaces,
    toolLibraryPath,
    setToolLibraryPath
  ]);

  return (
    <ScriptContext.Provider value={contextValue}>{children}</ScriptContext.Provider>
  );
};
