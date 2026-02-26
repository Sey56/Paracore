import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { Script, ScriptMetadata } from '@/types/scriptModel';
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
  const [userSourcePaths, setUserSourcePaths] = useLocalStorage<Record<number, { path: string; name: string }>>(`rap_userSourcePaths_${stableUserId}`, {});
  const [toolLibraryPath, setToolLibraryPath] = useLocalStorage<string | null>(`agentScriptsPath_${stableUserId}`, null);

  const [isSystemReady, setIsSystemReady] = useState(false);
  const normalizationHelper = (p: string) => (p || "").replace(/\\/g, '/').toLowerCase().trim();

  // 2. BOOTSTRAP: Ensure system is ready when user settles
  useEffect(() => {
    const hasToken = !!localStorage.getItem('rap_cloud_token');
    if (hasToken && !user) {
      setIsSystemReady(false);
      return;
    }
    setIsSystemReady(true);
  }, [user]);

  // 3. HEALING: Ensure active source is always in the Sidebar list
  useEffect(() => {
    const hasToken = !!localStorage.getItem('rap_cloud_token');
    if (hasToken && stableUserId === 'anon') return;
    if (!isSystemReady || !activeScriptSource) return;

    if (activeScriptSource.type === 'local' && activeScriptSource.path) {
      const path = activeScriptSource.path;
      const normPath = normalizationHelper(path);
      if (!customScriptFolders.some(f => normalizationHelper(f) === normPath)) {
        console.log("[ScriptProvider] 🩹 Healing: Restoring missing active source to Sidebar registry:", path);
        setCustomScriptFolders(prev => Array.from(new Set([...prev, path])));
      }
    }
  }, [activeScriptSource, isSystemReady, customScriptFolders, setCustomScriptFolders, stableUserId]);

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
    setCustomScriptFolders(prev => prev.filter(p => p !== path));
  }, [setCustomScriptFolders]);

  const clearAllCustomScriptFolders = useCallback(async () => setCustomScriptFolders([]), [setCustomScriptFolders]);

  const addRemoteScriptSource = useCallback(async (teamId: number, source: TeamScriptSource) => {
    await fetchRemoteScriptSources();
  }, [fetchRemoteScriptSources]);

  const removeRemoteScriptSource = useCallback(async (teamId: number, sourceId: number) => {
    await fetchRemoteScriptSources();
  }, [fetchRemoteScriptSources]);

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
  }, []);

  const [activeSyncSessions, setActiveSyncSessions] = useState<Record<string, any>>({});
  const fetchActiveSyncSessions = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const response = await silentApi.get('/api/sync/active-sessions');
      if (response.data) setActiveSyncSessions(response.data);
    } catch (err) { }
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
    userSourcePaths, setUserSourcePath, canUseLocalFolders, selectedFolder,
    updateScriptModificationTime
  }), [
    scripts, activeScriptSource, setActiveScriptSource, loadScriptsFromPath, fetchScriptMetadata, reloadScript,
    combinedScriptContent, createNewScript, deleteScript, favoriteScripts, toggleFavoriteScript, clearFavoriteScripts,
    recentScripts, addRecentScript, clearRecentScripts, lastRunTimes, updateScriptLastRunTime,
    isSyncActive, activeSyncSessions, customScriptFolders, setCustomScriptFolders, addCustomScriptFolder, addCustomScriptFolders, removeCustomScriptFolder, clearAllCustomScriptFolders,
    remoteScriptSources, fetchRemoteScriptSources, addRemoteScriptSource, removeRemoteScriptSource, updateRemoteScriptSource,
    pullAllTeamSources, pullTeamSource, clearScriptsForSource, toolLibraryPath, setToolLibraryPath,
    userSourcePaths, setUserSourcePath, canUseLocalFolders, selectedFolder,
    updateScriptModificationTime
  ]);

  return <ScriptContext.Provider value={contextValue}>{children}</ScriptContext.Provider>;
};
