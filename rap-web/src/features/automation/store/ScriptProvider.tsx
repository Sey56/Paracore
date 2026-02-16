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

  const [userSourcePaths, setUserSourcePaths] = useLocalStorage<Record<number, { path: string; name: string }>>('rap_userSourcePaths', {});
  const [toolLibraryPath, setToolLibraryPath] = useLocalStorage<string | null>('agentScriptsPath', null);

  const setUserSourcePath = useCallback((sourceId: number, path: string, name: string) => {
    setUserSourcePaths(prev => ({ ...prev, [sourceId]: { path, name } }));
  }, [setUserSourcePaths]);

  const [customScriptFolders, setCustomScriptFolders] = useLocalStorage<string[]>('rap_customScriptFolders', []);
  const [watchdogSources, setWatchdogSources] = useLocalStorage<string[]>('rap_watchdogSources', []);

  // Watchdog Roots (Display list)
  const [configuredWatchdogRoots, setConfiguredWatchdogRoots] = useLocalStorage<string[]>('rap_configuredWatchdogRoots', []);
  
  // Initialize to true if there are any configured watchdog roots or sources, otherwise false.
  // This ensures the overlay is shown from the very first render if needed.
  const [isArmingWatchdogs, setIsArmingWatchdogs] = useState(() => {
    // Access localStorage directly during initialization for immediate state.
    // This is safe as useLocalStorage also does this for initialValue.
    try {
      const storedRoots = localStorage.getItem('rap_configuredWatchdogRoots');
      const storedSources = localStorage.getItem('rap_watchdogSources');
      const hasStoredRoots = storedRoots ? JSON.parse(storedRoots).length > 0 : false;
      const hasStoredSources = storedSources ? JSON.parse(storedSources).length > 0 : false;
      return hasStoredRoots || hasStoredSources;
    } catch {
      return false;
    }
  });

  // Re-register watchdogs on mount to ensure backend is in sync
  // AND cleanup orphans (sources in watchdogSources but NOT in configuredWatchdogRoots)
  // Granular Watchdog Migration & Re-arming
  useEffect(() => {
    const rearmAndCleanup = async () => {
      const normalize = (p: string) => p.replace(/\\/g, '/').toLowerCase();

      // Read current state from refs or fresh from storage to avoid dependency loops
      const currentRoots = JSON.parse(localStorage.getItem('rap_configuredWatchdogRoots') || '[]');
      const currentSources = JSON.parse(localStorage.getItem('rap_watchdogSources') || '[]');

      const hasWatchdogConfig = currentRoots.length > 0 || currentSources.length > 0;
      if (!hasWatchdogConfig) {
        setIsArmingWatchdogs(false);
        return;
      }
      
      setIsArmingWatchdogs(true); 

      try {
        // 1. Identify true orphans
        const orphans = currentSources.filter((src: string) => {
          const normSrc = normalize(src);
          return !currentRoots.some((root: string) => normSrc.startsWith(normalize(root)));
        });

        if (orphans.length > 0) {
          setWatchdogSources(prev => prev.filter(p => !orphans.includes(p)));
          for (const orphan of orphans) {
            try { await api.post("/api/watchdogs/unregister-source", { path: orphan }); } catch (e) { }
          }
        }

        // 2. Migration Logic
        const newSources = new Set<string>();
        const validSources = currentSources.filter((src: string) => !orphans.includes(src));

        for (const src of validSources) {
          const isRootMismatch = currentRoots.some((root: string) => normalize(root) === normalize(src));
          if (isRootMismatch) {
            try {
              const res = await api.get(`/api/scripts?folderPath=${encodeURIComponent(src)}`);
              const scripts: Script[] = res.data;
              if (scripts.length > 0) {
                scripts.forEach(s => newSources.add(s.absolutePath));
                await api.post("/api/watchdogs/unregister-source", { path: src });
              }
            } catch (e) { newSources.add(src); }
          } else { newSources.add(src); }
        }

        const finalSources = Array.from(newSources);
        if (finalSources.length !== validSources.length) {
          setWatchdogSources(finalSources);
        }

        // 3. Re-register (The Gate)
        if (finalSources.length > 0) {
          console.log(`[ScriptProvider] Dynamically arming ${finalSources.length} watchdogs...`);
          await Promise.all(finalSources.map(async (path) => {
            try {
              await api.post("/api/watchdogs/register-source", { path });
            } catch (e) {
              console.error(`[ScriptProvider] Failed to re-arm: ${path}`, e);
            }
          }));
        }
      } finally {
        // Release the gate with a tiny safety buffer to ensure Revit queue is truly settled
        setTimeout(() => setIsArmingWatchdogs(false), 500);
      }
    };

    rearmAndCleanup();
  }, []); // Run strictly ONCE on mount

  // Watchdog Roots (Display list)
  // const [configuredWatchdogRoots, setConfiguredWatchdogRoots] = useLocalStorage<string[]>('rap_configuredWatchdogRoots', []); // Moved above

  const addConfiguredWatchdogRoot = useCallback((path: string) => {
    setConfiguredWatchdogRoots(prev => [...new Set([...prev, path])]);
  }, [setConfiguredWatchdogRoots]);

  const removeConfiguredWatchdogRoot = useCallback((path: string) => {
    setConfiguredWatchdogRoots(prev => prev.filter(p => p !== path));
    // Also disarm if removed
    setWatchdogSources(prev => prev.filter(p => p !== path));
  }, [setConfiguredWatchdogRoots, setWatchdogSources]);

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

  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [favoriteScripts, setFavoriteScripts] = useLocalStorage<string[]>('rap_favoriteScripts', []);
  const [recentScripts, setRecentScripts] = useLocalStorage<string[]>('rap_recentScripts', []);
  const [lastRunTimes, setLastRunTimes] = useLocalStorage<Record<string, string>>('rap_lastRunTimes', {});

  const toggleFavoriteScript = useCallback((scriptId: string) => {
    setFavoriteScripts(prev => {
      const isFavorite = prev.includes(scriptId);
      const next = isFavorite ? prev.filter(id => id !== scriptId) : [...prev, scriptId];

      // Update local scripts state immediately for instant feedback
      setScripts(currentScripts => currentScripts.map(s =>
        s.id === scriptId ? { ...s, isFavorite: !isFavorite } : s
      ));

      return next;
    });
  }, [setFavoriteScripts, setScripts]);

  const clearFavoriteScripts = useCallback(() => setFavoriteScripts([]), [setFavoriteScripts]);

  const addRecentScript = useCallback((scriptId: string) => {
    setRecentScripts(prev => [scriptId, ...prev.filter(id => id !== scriptId)].slice(0, 10));
  }, [setRecentScripts]);

  const clearRecentScripts = useCallback(() => setRecentScripts([]), [setRecentScripts]);

  const updateScriptLastRunTime = useCallback((scriptId: string) => {
    setLastRunTimes(prev => ({ ...prev, [scriptId]: new Date().toISOString() }));
  }, [setLastRunTimes]);

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
      const loadedScripts: Script[] = response.data;
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
    if (!isAuthenticated || !user || !activeTeam) return;

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
  }, [activeScriptSource, loadScriptsFromPath, setActiveScriptSource, userSourcePaths, canUseLocalFolders, isAuthenticated, user, activeTeam]);

  const createNewScript = useCallback(async (details: any) => {
    try {
      const response = await api.post("/api/scripts/new", details);
      // After creation, reload the list
      let newScriptObj = null;
      if (selectedFolder) {
        const freshScripts = await loadScriptsFromPath(selectedFolder, true);
        // Find the actual script object in the newly loaded list
        if (freshScripts) {
          const targetPath = response.data.absolutePath || response.data.script_path;
          newScriptObj = freshScripts.find(s => s.absolutePath === targetPath);
        }
      }
      if (newScriptObj) return newScriptObj;

      // Fallback: Construct a temporary Script object from response to prevent UI crashes
      // This happens if the file system hasn't updated yet when we try to reload
      const fallbackScript: Script = {
        id: response.data.id || response.data.script_id || `temp-${Date.now()}`,
        name: details.script_name || 'New Script',
        sourcePath: response.data.absolutePath || response.data.script_path || '',
        absolutePath: response.data.absolutePath || response.data.script_path || '',
        parameters: [],
        metadata: {
          displayName: details.script_name || 'New Script',
          lastRun: null,
          dependencies: [],
          description: '',
          categories: [],
          usage_examples: [],
          isProtected: false,
          isCompiled: false
        },
        isFavorite: false
      };

      return fallbackScript;
    } catch (error: any) {
      showNotification(error.response?.data?.detail || "Failed to create script", "error");
      return undefined;
    }
  }, [selectedFolder, loadScriptsFromPath, showNotification]);

  const deleteScript = useCallback(async (script: Script, scaffoldingOnly: boolean = false) => {
    try {
      await api.post("/api/scripts/delete", {
        script_path: script.absolutePath,
        delete_scaffolding_only: scaffoldingOnly
      });
      if (selectedFolder) await loadScriptsFromPath(selectedFolder, true);
      showNotification(scaffoldingOnly ? "Scaffolding cleared" : "Script deleted", "success");
      return true;
    } catch (error: any) {
      showNotification(scaffoldingOnly ? "Failed to clear scaffolding" : "Failed to delete script", "error");
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
      setScripts(prev => prev.map(s => s.id === scriptId ? { ...s, metadata: { ...s.metadata, ...response.data.metadata } } : s));
    } catch (err) { }
  }, []);

  const reloadScript = useCallback(async (script: Script, options: { silent?: boolean } = {}) => {
    try {
      const paramsRes = await api.post("/api/get-script-parameters", { scriptPath: script.absolutePath });
      const metadataRes = await api.post("/api/script-metadata", { scriptPath: script.absolutePath });
      setScripts(prev => prev.map(s => s.id === script.id ? { ...s, parameters: paramsRes.data.parameters, metadata: { ...s.metadata, ...metadataRes.data.metadata } } : s));
    } catch (err) { }
  }, []);

  const [activeSyncSessions, setActiveSyncSessions] = useState<Record<string, any>>({});

  const fetchActiveSyncSessions = useCallback(async () => {
    if (!localStorage.getItem('rap_cloud_token')) return;
    try {
      const response = await silentApi.get('/api/sync/active-sessions');
      if (response.data) setActiveSyncSessions(response.data);
    } catch (err) { }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchActiveSyncSessions();
    const interval = setInterval(fetchActiveSyncSessions, 2000);
    return () => clearInterval(interval);
  }, [fetchActiveSyncSessions, isAuthenticated]);

  const isSyncActive = useCallback((scriptPath: string) => {
    const normalized = scriptPath.replace(/\\/g, '/').toLowerCase();
    return Object.keys(activeSyncSessions).some(key => key.toLowerCase() === normalized);
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
    watchdogSources, setWatchdogSources,
    configuredWatchdogRoots, addConfiguredWatchdogRoot, removeConfiguredWatchdogRoot,
    isArmingWatchdogs,
    remoteScriptSources, fetchRemoteScriptSources, addRemoteScriptSource, removeRemoteScriptSource, updateRemoteScriptSource,
    pullAllTeamSources, pullTeamSource, clearScriptsForSource,
    toolLibraryPath, setToolLibraryPath,
    userSourcePaths, setUserSourcePath, canUseLocalFolders, selectedFolder
  }), [
    scripts, activeScriptSource, setActiveScriptSource, loadScriptsFromPath, fetchScriptMetadata, reloadScript,
    combinedScriptContent, createNewScript, deleteScript, favoriteScripts, toggleFavoriteScript, clearFavoriteScripts,
    recentScripts, addRecentScript, clearRecentScripts, lastRunTimes, updateScriptLastRunTime,
    isSyncActive, activeSyncSessions, customScriptFolders, setCustomScriptFolders, addCustomScriptFolder, addCustomScriptFolders, removeCustomScriptFolder, clearAllCustomScriptFolders,
    watchdogSources, setWatchdogSources, configuredWatchdogRoots, addConfiguredWatchdogRoot, removeConfiguredWatchdogRoot,
    remoteScriptSources, fetchRemoteScriptSources, addRemoteScriptSource, removeRemoteScriptSource, updateRemoteScriptSource,
    pullAllTeamSources, pullTeamSource, clearScriptsForSource, toolLibraryPath, setToolLibraryPath,
    userSourcePaths, setUserSourcePath, canUseLocalFolders, selectedFolder
  ]);

  return <ScriptContext.Provider value={contextValue}>{children}</ScriptContext.Provider>;
};
