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

  const [userSourcePaths, setUserSourcePaths] = useLocalStorage<Record<number, { path: string; name: string }>>(`rap_userSourcePaths_${user?.id || 'anon'}`, {});
  const [toolLibraryPath, setToolLibraryPath] = useLocalStorage<string | null>(`agentScriptsPath_${user?.id || 'anon'}`, null);

  const setUserSourcePath = useCallback((sourceId: number, path: string, name: string) => {
    setUserSourcePaths(prev => ({ ...prev, [sourceId]: { path, name } }));
  }, [setUserSourcePaths]);

  const [customScriptFolders, setCustomScriptFolders] = useState<string[]>([]);
  const [configuredWatchdogRoots, setConfiguredWatchdogRoots] = useState<string[]>([]);
  const [watchdogSources, setWatchdogSources] = useState<string[]>([]);
  const [isConfigLoaded, setIsConfigLoaded] = useState(false);
  
  // Load ALL config with user-aware key & Migration
  useEffect(() => {
    const userId = user?.id || 'anon';
    setIsConfigLoaded(false);
    
    const loadWithMigration = (baseKey: string) => {
      const userKey = `${baseKey}_${userId}`;
      const userStored = localStorage.getItem(userKey);
      if (userStored) return JSON.parse(userStored);
      const oldStored = localStorage.getItem(baseKey);
      if (oldStored) {
        localStorage.setItem(userKey, oldStored);
        return JSON.parse(oldStored);
      }
      return [];
    };

    try {
      setCustomScriptFolders(loadWithMigration('rap_customScriptFolders'));
      setConfiguredWatchdogRoots(loadWithMigration('rap_configuredWatchdogRoots'));
      setWatchdogSources(loadWithMigration('rap_watchdogSources'));
    } catch (e) {
      console.error("[ScriptProvider] Failed to load config", e);
    } finally {
      setIsConfigLoaded(true);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!isConfigLoaded) return;
    const userId = user?.id || 'anon';
    localStorage.setItem(`rap_customScriptFolders_${userId}`, JSON.stringify(customScriptFolders));
  }, [customScriptFolders, user?.id, isConfigLoaded]);

  useEffect(() => {
    if (!isConfigLoaded) return;
    const userId = user?.id || 'anon';
    localStorage.setItem(`rap_configuredWatchdogRoots_${userId}`, JSON.stringify(configuredWatchdogRoots));
  }, [configuredWatchdogRoots, user?.id, isConfigLoaded]);

  useEffect(() => {
    if (!isConfigLoaded) return;
    const userId = user?.id || 'anon';
    localStorage.setItem(`rap_watchdogSources_${userId}`, JSON.stringify(watchdogSources));
  }, [watchdogSources, user?.id, isConfigLoaded]);

  // Initialize to true if there are any configured watchdog roots or sources, otherwise false.
  const [isArmingWatchdogs, setIsArmingWatchdogs] = useState(() => {
    try {
      const hasToken = !!localStorage.getItem('rap_cloud_token');
      if (!hasToken) return false;

      const storedUser = localStorage.getItem('rap_user');
      const userId = storedUser ? JSON.parse(storedUser).id : null;
      const userRoots = userId ? localStorage.getItem(`rap_configuredWatchdogRoots_${userId}`) : null;
      const legacyRoots = localStorage.getItem('rap_configuredWatchdogRoots');
      const hasRoots = !!((userRoots && JSON.parse(userRoots).length > 0) || (legacyRoots && JSON.parse(legacyRoots).length > 0));
      return hasRoots;
    } catch {
      return false;
    }
  });

  const gateStartTimeRef = useRef<number>(Date.now());
  const armingSessionStartedRef = useRef<string | null>(null);

  // Re-register watchdogs on mount to ensure backend is in sync
  useEffect(() => {
    const hasToken = !!localStorage.getItem('rap_cloud_token');
    
    // If not authenticated and no token, we are logged out. Close the gate.
    if (!hasToken && !isAuthenticated) {
      setIsArmingWatchdogs(false);
      armingSessionStartedRef.current = null;
      return;
    }

    if (hasToken && !user) return; 

    const userId = user?.id || 'anon';
    if (armingSessionStartedRef.current === userId) return;
    armingSessionStartedRef.current = userId;

    const rearmAndCleanup = async () => {
      // Stabilization delay: wait a bit for token interceptors to align
      await new Promise(resolve => setTimeout(resolve, 500));
      
      if (!isAuthenticated) {
        setIsArmingWatchdogs(false); // Close gate if we can't authenticate yet
        armingSessionStartedRef.current = null; // Allow retry
        return;
      }

      const userRootsJson = localStorage.getItem(`rap_configuredWatchdogRoots_${userId}`);
      const legacyRootsJson = localStorage.getItem('rap_configuredWatchdogRoots');
      
      let currentRoots: string[] = [];
      try {
        const userRoots = userRootsJson ? JSON.parse(userRootsJson) : [];
        const legacyRoots = legacyRootsJson ? JSON.parse(legacyRootsJson) : [];
        currentRoots = userRoots.length > 0 ? userRoots : legacyRoots;
      } catch {
        currentRoots = [];
      }

      if (currentRoots.length === 0) {
        setIsArmingWatchdogs(false);
        return;
      }
      
      setIsArmingWatchdogs(true); 

      try {
        const normalize = (p: string) => p.replace(/\\/g, '/').toLowerCase();
        const userSourcesJson = localStorage.getItem(`rap_watchdogSources_${userId}`);
        const legacySourcesJson = localStorage.getItem('rap_watchdogSources');
        let currentSources: string[] = [];
        try {
          const userSources = userSourcesJson ? JSON.parse(userSourcesJson) : [];
          const legacySources = legacySourcesJson ? JSON.parse(legacySourcesJson) : [];
          currentSources = userSources.length > 0 ? userSources : legacySources;
        } catch { currentSources = []; }

        // 1. Identify true orphans
        const orphans = currentSources.filter((src: string) => {
          const normSrc = normalize(src);
          return !currentRoots.some((root: string) => normSrc.startsWith(normalize(root)));
        });

        if (orphans.length > 0) {
          setWatchdogSources(prev => prev.filter(p => !orphans.includes(p)));
          for (const orphan of orphans) {
            try { if (isAuthenticated) await api.post("/api/watchdogs/unregister-source", { path: orphan }); } catch (e) { }
          }
        }

        // 2. Migration Logic
        const newSources = new Set<string>();
        const validSources = currentSources.filter((src: string) => !orphans.includes(src));

        for (const src of validSources) {
          const isRootMismatch = currentRoots.some((root: string) => normalize(root) === normalize(src));
          if (isRootMismatch) {
            try {
              if (isAuthenticated) {
                const res = await api.get(`/api/scripts?folderPath=${encodeURIComponent(src)}`);
                const scripts: Script[] = res.data;
                if (scripts.length > 0) {
                  scripts.forEach(s => newSources.add(s.absolutePath));
                  await api.post("/api/watchdogs/unregister-source", { path: src });
                }
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
          await Promise.all(finalSources.map(async (path) => {
            try { if (isAuthenticated) await api.post("/api/watchdogs/register-source", { path }); } catch (e) { }
          }));
        }
      } finally {
        const elapsed = Date.now() - gateStartTimeRef.current;
        const remaining = Math.max(0, 1500 - elapsed);
        setTimeout(() => {
          setIsArmingWatchdogs(false);
        }, remaining);
      }
    };

    rearmAndCleanup();
  }, [user?.id, isAuthenticated]);

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
  const [favoriteScripts, setFavoriteScripts] = useLocalStorage<string[]>(`rap_favoriteScripts_${user?.id || 'anon'}`, []);
  const [recentScripts, setRecentScripts] = useLocalStorage<string[]>(`rap_recentScripts_${user?.id || 'anon'}`, []);
  const [lastRunTimes, setLastRunTimes] = useLocalStorage<Record<string, string>>(`rap_lastRunTimes_${user?.id || 'anon'}`, {});

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

  // V4 HEALING: Ensure active local source is in customScriptFolders
  useEffect(() => {
    if (!isConfigLoaded) return; // Wait for load
    if (activeScriptSource?.type === 'local' && activeScriptSource.path) {
      if (!customScriptFolders.includes(activeScriptSource.path)) {
        console.log("[ScriptProvider] Healing: Restoring active source to folder list", activeScriptSource.path);
        setCustomScriptFolders(prev => [...new Set([...prev, activeScriptSource.path])]);
      }
    }
  }, [activeScriptSource, customScriptFolders, setCustomScriptFolders, isConfigLoaded]);

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
      setScripts(prev => prev.map(s => s.id === scriptId ? { 
        ...s, 
        metadata: { 
          ...s.metadata, 
          ...response.data.metadata,
          // V4: CRITICAL PRESERVATION
          isWatchdog: s.metadata.isWatchdog || response.data.metadata.isWatchdog 
        } 
      } : s));
    } catch (err) { }
  }, []);

  const reloadScript = useCallback(async (script: Script, options: { silent?: boolean } = {}) => {
    try {
      const paramsRes = await api.post("/api/get-script-parameters", { scriptPath: script.absolutePath });
      const metadataRes = await api.post("/api/script-metadata", { scriptPath: script.absolutePath });
      setScripts(prev => prev.map(s => s.id === script.id ? { 
        ...s, 
        parameters: paramsRes.data.parameters, 
        metadata: { 
          ...s.metadata, 
          ...metadataRes.data.metadata,
          // V4: CRITICAL PRESERVATION
          isWatchdog: s.metadata.isWatchdog || metadataRes.data.metadata.isWatchdog
        } 
      } : s));
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
    return Object.keys(activeSyncSessions).some(key => 
      key.replace(/\\/g, '/').toLowerCase() === normalized
    );
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
