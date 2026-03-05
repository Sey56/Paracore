import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { Script } from '@/types/scriptModel';
import { TeamScriptSource } from '@/types';
import { useAuth } from '@/features/auth';
import { useNotifications } from '@/hooks/useNotifications';
import useLocalStorage from '@/hooks/useLocalStorage';
import { Role } from '@/features/auth/types/authTypes';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { getRemoteSources } from '@/features/auth/services/rapAuthApiClient';
import api from '@/api/axios';
import { ScriptContext } from './ScriptContext';
import { useUI } from '@/hooks/useUI';
import { normalizePath } from '@/utils/pathHelpers';

const silentApi = axios.create({ baseURL: 'http://localhost:8000' });

silentApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('rap_cloud_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const ScriptProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [combinedScriptContent, setCombinedScriptContent] = useState<string | null>(null);
  const scriptsRef = useRef<Script[]>([]);

  useEffect(() => {
    scriptsRef.current = scripts;
  }, [scripts]);

  const { isAuthenticated, activeTeam, activeRole, user, cloudToken } = useAuth();
  const { showNotification } = useNotifications();
  const { activeScriptSource, setActiveScriptSource } = useUI();

  // V4: Determine stable user key
  const stableUserId = user?.id || 'anon';

  // 1. AUTOMATION FOLDER STATE (The Sidebar) - Strictly Isolated
  const [customScriptFolders, setCustomScriptFolders] = useLocalStorage<string[]>(`rap_customScriptFolders_${stableUserId}`, []);
  const [userSourcePaths, setUserSourcePaths] = useLocalStorage<Record<number, { path: string; name: string }>>(`rap-user-source-paths_${stableUserId}`, {});
  const [toolLibraryPath, setToolLibraryPath] = useLocalStorage<string | null>(`agentScriptsPath_${stableUserId}`, null);

  const [isSystemReady, setIsSystemReady] = useState(false);

  // 2. BOOTSTRAP: Ensure system is ready when user settles
  useEffect(() => {
    const hasToken = !!localStorage.getItem('rap_cloud_token');
    if (hasToken && !user) {
      setIsSystemReady(false);
      return;
    }
    setIsSystemReady(true);
  }, [user]);

  // 3. BOOTSTRAP RECOVERY: One-time check to ensure active source is valid
  // We only run this ONCE when the system becomes ready. We do NOT watch activeScriptSource
  // constantly, as that creates race conditions when trying to unload sources.
  useEffect(() => {
    if (!isSystemReady) return;

    if (activeScriptSource?.type === 'local' && activeScriptSource.path) {
      const path = activeScriptSource.path;
      const normPath = normalizePath(path);

      if (!customScriptFolders.some(f => normalizePath(f) === normPath)) {
        console.log("[ScriptProvider] 🚀 Bootstrap: Restoring missing active source to Sidebar registry:", path);
        setCustomScriptFolders(prev => Array.from(new Set([...prev, path])));
      }
    }
  }, [isSystemReady]); // Dependency array intentionally minimal to run only on mount/ready

  const setUserSourcePath = useCallback((sourceId: number, path: string, name: string) => {
    setUserSourcePaths(prev => ({ ...prev, [sourceId]: { path, name } }));
  }, [setUserSourcePaths]);

  // 4. REMOTE SOURCES
  const [remoteScriptSources, setRemoteScriptSources] = useState<Record<number, TeamScriptSource[]>>({});

  const fetchRemoteScriptSources = useCallback(async () => {
    if (!activeTeam || !cloudToken) {
      setRemoteScriptSources({});
      return;
    }
    try {
      let sources: TeamScriptSource[] = [];
      if (activeTeam.team_id !== 0) {
        sources = await getRemoteSources(activeTeam.team_id, cloudToken);
      }
      setRemoteScriptSources(prev => ({ ...prev, [activeTeam.team_id]: sources }));
    } catch (error) {
      console.error(`Failed to fetch registered script sources:`, error);
      setRemoteScriptSources(prev => ({ ...prev, [activeTeam.team_id]: [] }));
    }
  }, [activeTeam, cloudToken]);

  useEffect(() => {
    fetchRemoteScriptSources();
  }, [fetchRemoteScriptSources, activeTeam]);

  // 5. SELECTION & LOADING
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [favoriteScripts, setFavoriteScripts] = useLocalStorage<string[]>(`rap_favoriteScripts_${stableUserId}`, []);
  const [recentScripts, setRecentScripts] = useLocalStorage<string[]>(`rap_recentScripts_${stableUserId}`, []);
  const [lastRunTimes, setLastRunTimes] = useLocalStorage<Record<string, string>>(`rap_lastRunTimes_${stableUserId}`, {});

  // V4: Frontend-driven Metadata Tracking
  const [creationTimes, setCreationTimes] = useLocalStorage<Record<string, string>>(`rap_creationTimes_${stableUserId}`, {});
  const [modificationTimes, setModificationTimes] = useLocalStorage<Record<string, string>>(`rap_modificationTimes_${stableUserId}`, {});

  const toggleFavoriteScript = useCallback((scriptId: string) => {
    setFavoriteScripts(prev => {
      const isFavorite = prev.includes(scriptId);
      const next = isFavorite ? prev.filter(id => id !== scriptId) : [...prev, scriptId];
      setScripts(currentScripts => currentScripts.map(s =>
        s.id === scriptId ? { ...s, isFavorite: !isFavorite } : s
      ));
      return next;
    });
  }, [setFavoriteScripts]);

  const clearFavoriteScripts = useCallback(() => setFavoriteScripts([]), [setFavoriteScripts]);
  const addRecentScript = useCallback((scriptId: string) => {
    setRecentScripts(prev => [scriptId, ...prev.filter(id => id !== scriptId)].slice(0, 10));
  }, [setRecentScripts]);
  const clearRecentScripts = useCallback(() => setRecentScripts([]), [setRecentScripts]);
  const updateScriptLastRunTime = useCallback((scriptId: string) => {
    const now = new Date().toISOString();
    setLastRunTimes(prev => ({ ...prev, [scriptId]: now }));
    setScripts(prev => prev.map(s => s.id === scriptId ? { ...s, metadata: { ...s.metadata, lastRun: now } } : s));
  }, [setLastRunTimes, setScripts]);

  const canUseLocalFolders = useMemo(() => {
    if (!user || !activeTeam) return false;
    if (activeRole === Role.Admin) return true;
    if (activeTeam.owner_id === Number(user.id)) return true;
    return false;
  }, [user, activeTeam, activeRole]);

  const loadScriptsFromPath = useCallback(async (folderPath: string, silent: boolean = false) => {
    try {
      if (!silent) setScripts([]);
      setSelectedFolder(folderPath);
      const response = await api.get(`/api/scripts?folderPath=${encodeURIComponent(folderPath)}`);
      const loadedScripts: Script[] = response.data.map((s: Script) => ({
        ...s,
        metadata: {
          ...s.metadata,
          lastRun: lastRunTimes[s.id] || s.metadata.lastRun,
          dateCreated: creationTimes[s.id] || s.metadata.dateCreated,
          dateModified: modificationTimes[s.id] || s.metadata.dateModified
        }
      }));
      setScripts(loadedScripts);
      return loadedScripts;
    } catch (error: any) {
      console.error("Failed to load scripts:", error);
      showNotification(`Failed to fetch scripts`, "error");
      setScripts([]);
      return undefined;
    }
  }, [showNotification]);

  useEffect(() => {
    if (!isAuthenticated || !user || !activeTeam || !isSystemReady) return;

    let path_to_load: string | null = null;
    if (activeScriptSource) {
      if (activeScriptSource.type === 'local') {
        if (!canUseLocalFolders) {
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
  }, [activeScriptSource, loadScriptsFromPath, setActiveScriptSource, userSourcePaths, canUseLocalFolders, isAuthenticated, user, activeTeam, isSystemReady]);

  const createNewScript = useCallback(async (details: any) => {
    try {
      const response = await api.post("/api/scripts/new", details);

      // Update creation time in frontend storage
      const newScriptId = response.data.id;
      if (newScriptId) {
        const now = new Date().toISOString();

        // V5: Clear stale metadata if this path was used before (fixing "inheriting" old run times)
        setLastRunTimes(prev => {
          const next = { ...prev };
          delete next[newScriptId];
          return next;
        });
        setModificationTimes(prev => {
          const next = { ...prev };
          delete next[newScriptId];
          return next;
        });

        setCreationTimes(prev => ({ ...prev, [newScriptId]: now }));
      }

      if (selectedFolder) await loadScriptsFromPath(selectedFolder, true);
      return response.data; // Return the created script object
    } catch (error: any) {
      showNotification(error.response?.data?.detail || "Failed to create script", "error");
      return undefined;
    }
  }, [selectedFolder, loadScriptsFromPath, showNotification]);

  const deleteScript = useCallback(async (script: Script, scaffoldingOnly: boolean = false): Promise<boolean> => {
    try {
      await api.post("/api/scripts/delete", {
        script_path: script.absolutePath,
        delete_scaffolding_only: scaffoldingOnly
      });
      if (selectedFolder) await loadScriptsFromPath(selectedFolder, true);
      showNotification(scaffoldingOnly ? "Scaffolding cleared" : "Script deleted", "success");
      return true;
    } catch (error: any) {
      const msg = error.response?.data?.detail || (scaffoldingOnly ? "Failed to clear scaffolding" : "Failed to delete script");
      showNotification(msg, "error");
      return false;
    }
  }, [selectedFolder, loadScriptsFromPath, showNotification]);

  const addCustomScriptFolder = useCallback(async (path: string) => {
    setCustomScriptFolders(prev => [...new Set([...prev, path])]);
  }, [setCustomScriptFolders]);

  const addCustomScriptFolders = useCallback(async (paths: string[]) => {
    setCustomScriptFolders(prev => [...new Set([...prev, ...paths])]);
  }, [setCustomScriptFolders]);

  const removeCustomScriptFolder = useCallback((path: string) => {
    const normTarget = normalizePath(path);
    console.log("[ScriptProvider] 🗑️ Unloading source:", normTarget);

    // 1. If we are unloading the currently active source, clear the active state first
    if (activeScriptSource?.type === 'local' && normalizePath(activeScriptSource.path || "") === normTarget) {
      console.log("[ScriptProvider] 🗑️ Source was active. Clearing active state.");
      setActiveScriptSource(null);
      setScripts([]);
    }

    // 2. Remove from the list
    setCustomScriptFolders(prev => prev.filter(p => normalizePath(p) !== normTarget));
  }, [setCustomScriptFolders, activeScriptSource, setActiveScriptSource, setScripts]);

  const clearAllCustomScriptFolders = useCallback(async () => {
    if (activeScriptSource?.type === 'local' && activeScriptSource.path) {
      // Preserve ONLY the active one
      const activePath = activeScriptSource.path;
      setCustomScriptFolders([activePath]);
    } else {
      // Clear everything
      setActiveScriptSource(null);
      setScripts([]);
      setCustomScriptFolders([]);
    }
  }, [setCustomScriptFolders, activeScriptSource, setActiveScriptSource, setScripts]);

  const addRemoteScriptSource = useCallback(async (teamId: number, source: TeamScriptSource) => {
    await fetchRemoteScriptSources();
  }, [fetchRemoteScriptSources]);

  const removeRemoteScriptSource = useCallback(async (teamId: number, sourceId: number) => {
    await fetchRemoteScriptSources();
  }, [fetchRemoteScriptSources]);

  const removeSourcePath = useCallback(async (sourceId: string) => {
    // Clear active source if it matches the one being removed
    if (activeScriptSource?.type === 'team' && activeScriptSource.id === sourceId) {
      setActiveScriptSource(null);
      setScripts([]);
    }

    // Relay to the hook via setUserSourcePaths (which is just a setter here)
    setUserSourcePaths(prev => {
      const { [Number(sourceId)]: _, ...next } = prev;
      return next;
    });
  }, [activeScriptSource, setActiveScriptSource, setScripts, setUserSourcePaths]);

  const updateRemoteScriptSource = useCallback(async (teamId: number, sourceId: number, name: string | undefined, repoUrl: string | undefined) => {
    await fetchRemoteScriptSources();
  }, [fetchRemoteScriptSources]);

  const pullAllTeamSources = useCallback(async () => {
    showNotification("Pulling all sources...", "info");
  }, [showNotification]);

  const pullTeamSource = useCallback(async (path: string) => {
    showNotification(`Pulling ${path}...`, "info");
  }, [showNotification]);

  const clearScriptsForSource = useCallback((path: string) => {
    setScripts([]);
  }, []);

  const fetchScriptMetadata = useCallback(async (scriptId: string) => {
    const script = scriptsRef.current.find(s => s.id === scriptId);
    if (!script) return;
    try {
      const response = await api.post("/api/script-metadata", { scriptPath: script.absolutePath });

      const backendMetadata = response.data.metadata;
      const mergedMetadata = {
        ...script.metadata,
        ...backendMetadata,
        lastRun: lastRunTimes[scriptId] || backendMetadata.lastRun,
        dateCreated: creationTimes[scriptId] || backendMetadata.dateCreated,
        dateModified: modificationTimes[scriptId] || backendMetadata.dateModified
      };

      setScripts(prev => prev.map(s => s.id === scriptId ? { ...s, metadata: mergedMetadata } : s));
    } catch (err) { }
  }, [creationTimes, lastRunTimes, modificationTimes, setScripts]);

  const updateScriptModificationTime = useCallback((scriptId: string) => {
    const now = new Date().toISOString();
    setModificationTimes(prev => ({ ...prev, [scriptId]: now }));
    setScripts(prev => prev.map(s => s.id === scriptId ? { ...s, metadata: { ...s.metadata, dateModified: now } } : s));
  }, [setModificationTimes, setScripts]);

  const reloadScript = useCallback(async (script: Script, options: { silent?: boolean } = {}) => {
    try {
      const paramsRes = await api.post("/api/get-script-parameters", { scriptPath: script.absolutePath });
      const metadataRes = await api.post("/api/script-metadata", { scriptPath: script.absolutePath });

      // Merge with locally tracked timestamps
      const backendMetadata = metadataRes.data.metadata;
      const mergedMetadata = {
        ...script.metadata,
        ...backendMetadata,
        lastRun: lastRunTimes[script.id] || backendMetadata.lastRun,
        dateCreated: creationTimes[script.id] || backendMetadata.dateCreated,
        dateModified: modificationTimes[script.id] || backendMetadata.dateModified
      };

      setScripts(prev => prev.map(s => s.id === script.id ? { ...s, parameters: paramsRes.data.parameters, metadata: mergedMetadata } : s));
    } catch (err) { }
  }, [creationTimes, lastRunTimes, modificationTimes, setScripts]);

  // 6. SYNC SESSION TRACKING
  const [activeSyncSessions, setActiveSyncSessions] = useState<Record<string, any>>({});
  const fetchActiveSyncSessions = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const response = await silentApi.get('/api/sync/active-sessions');
      if (response.data) setActiveSyncSessions(response.data);
    } catch (err: any) {
      if (err.response?.status !== 401) {
        // Only log non-auth errors
        console.error("Failed to fetch active sessions:", err);
      }
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setActiveSyncSessions({});
      return;
    }
    fetchActiveSyncSessions();
    const interval = setInterval(fetchActiveSyncSessions, 2000);
    return () => clearInterval(interval);
  }, [fetchActiveSyncSessions, isAuthenticated]);

  const isSyncActive = useCallback((scriptPath: string) => {
    if (!scriptPath || !activeSyncSessions) return false;
    const normalized = scriptPath.replace(/\\/g, '/').toLowerCase();
    return Object.keys(activeSyncSessions).some(key => key.replace(/\\/g, '/').toLowerCase() === normalized);
  }, [activeSyncSessions]);

  // 7. STALE SOURCE RECONCILIATION (Auto-Healing)
  const validateSources = useCallback(async () => {
    if (!isSystemReady) return;

    // Gather all local paths to validate
    const localPaths = new Set<string>();
    customScriptFolders.forEach(p => localPaths.add(p));
    Object.values(userSourcePaths).forEach(s => { if (s.path) localPaths.add(s.path); });
    if (toolLibraryPath) localPaths.add(toolLibraryPath);

    if (localPaths.size === 0) return;

    try {
      console.log(`[ScriptProvider] 🔍 Validating ${localPaths.size} script source paths...`);
      const resp = await api.post("/api/scripts/validate-sources", { paths: Array.from(localPaths) });
      const existenceMap: Record<string, boolean> = resp.data;

      // Normalize existenceMap for robust lookup
      const normalizedMap: Record<string, boolean> = {};
      Object.entries(existenceMap).forEach(([p, exists]) => {
        normalizedMap[normalizePath(p)] = exists;
      });

      // Reconciliation logic
      let hasChanges = false;

      // A. Heal local folders
      const validCustomFolders = customScriptFolders.filter(p => {
        const exists = normalizedMap[normalizePath(p)];
        if (exists === false) {
          console.log(`[ScriptProvider] 🩹 Auto-Healing: Removing stale local source: ${p}`);
          hasChanges = true;
          return false;
        }
        return true;
      });
      if (hasChanges) setCustomScriptFolders(validCustomFolders);

      // B. Heal user source paths (Teams)
      const newUserSourcePaths = { ...userSourcePaths };
      let userPathsChanged = false;
      Object.entries(userSourcePaths).forEach(([id, info]) => {
        if (info.path && normalizedMap[normalizePath(info.path)] === false) {
          console.log(`[ScriptProvider] 🩹 Auto-Healing: Removing stale team source link: ${info.path}`);
          delete newUserSourcePaths[Number(id)];
          userPathsChanged = true;
        }
      });
      if (userPathsChanged) setUserSourcePaths(newUserSourcePaths);

      // C. Heal tool library (Agent)
      if (toolLibraryPath && normalizedMap[normalizePath(toolLibraryPath)] === false) {
        console.log(`[ScriptProvider] 🩹 Auto-Healing: Clearing stale agent scripts path: ${toolLibraryPath}`);
        setToolLibraryPath(null);
      }

      // D. Active source mismatch
      if (activeScriptSource?.type === 'local' && activeScriptSource.path && normalizedMap[normalizePath(activeScriptSource.path)] === false) {
        console.log(`[ScriptProvider] 🩹 Auto-Healing: Reseting stale active source: ${activeScriptSource.path}`);
        setActiveScriptSource(null);
        setScripts([]);
      } else if (activeScriptSource?.type === 'team' && activeScriptSource.id) {
        const info = userSourcePaths[Number(activeScriptSource.id)];
        if (info?.path && normalizedMap[normalizePath(info.path)] === false) {
          console.log(`[ScriptProvider] 🩹 Auto-Healing: Reseting stale active source (Team): ${info.path}`);
          setActiveScriptSource(null);
          setScripts([]);
        }
      }

      // E. Fine-Grained Script Sync: Refresh active list if individual scripts were deleted externally
      if (activeScriptSource && !hasChanges) {
        const currentPath = activeScriptSource.type === 'local' ? activeScriptSource.path : userSourcePaths[Number(activeScriptSource.id)]?.path;
        if (currentPath && normalizedMap[normalizePath(currentPath)] === true) {
          // If we have scripts, check if they still exist via a lightweight HEAD-like check
          // For now, we trigger a silent reload if individual scripts are missing from the backend response
          loadScriptsFromPath(currentPath, true);
        }
      }

    } catch (err) {
      console.error("[ScriptProvider] Failed to validate sources:", err);
    }
  }, [isSystemReady, customScriptFolders, userSourcePaths, toolLibraryPath, activeScriptSource, setCustomScriptFolders, setUserSourcePaths, setToolLibraryPath, setActiveScriptSource]);

  // Trigger Validation: Mount, Focus, and Interval
  useEffect(() => {
    if (!isSystemReady) return;

    validateSources();

    const handleFocus = () => validateSources();
    window.addEventListener('focus', handleFocus);

    const interval = setInterval(validateSources, 60000); // Every 60s

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(interval);
    };
  }, [isSystemReady, validateSources]);

  const contextValue = useMemo(() => ({
    scripts, setScripts, activeScriptSource, setActiveScriptSource,
    loadScriptsForFolder: loadScriptsFromPath, fetchScriptMetadata, reloadScript,
    combinedScriptContent, setCombinedScriptContent, createNewScript, deleteScript,
    favoriteScripts, toggleFavoriteScript, clearFavoriteScripts,
    recentScripts, addRecentScript, clearRecentScripts,
    lastRunTimes, updateScriptLastRunTime,
    isSyncActive, activeSyncSessions,
    customScriptFolders, setCustomScriptFolders, addCustomScriptFolder, addCustomScriptFolders, removeCustomScriptFolder, clearAllCustomScriptFolders,
    remoteScriptSources, fetchRemoteScriptSources, addRemoteScriptSource, removeRemoteScriptSource, updateRemoteScriptSource,
    pullAllTeamSources, pullTeamSource, clearScriptsForSource, toolLibraryPath, setToolLibraryPath,
    userSourcePaths, setUserSourcePath, removeSourcePath, canUseLocalFolders, selectedFolder,
    updateScriptModificationTime
  }), [
    scripts, activeScriptSource, setActiveScriptSource, loadScriptsFromPath, fetchScriptMetadata, reloadScript,
    combinedScriptContent, createNewScript, deleteScript, favoriteScripts, toggleFavoriteScript, clearFavoriteScripts,
    recentScripts, addRecentScript, clearRecentScripts, lastRunTimes, updateScriptLastRunTime,
    isSyncActive, activeSyncSessions, customScriptFolders, setCustomScriptFolders, addCustomScriptFolder, addCustomScriptFolders, removeCustomScriptFolder, clearAllCustomScriptFolders,
    remoteScriptSources, fetchRemoteScriptSources, addRemoteScriptSource, removeRemoteScriptSource, updateRemoteScriptSource,
    pullAllTeamSources, pullTeamSource, clearScriptsForSource, toolLibraryPath, setToolLibraryPath,
    userSourcePaths, setUserSourcePath, removeSourcePath, canUseLocalFolders, selectedFolder,
    updateScriptModificationTime
  ]);

  return <ScriptContext.Provider value={contextValue}>{children}</ScriptContext.Provider>;
};
