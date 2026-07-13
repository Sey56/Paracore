import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';
import { Script } from '@/types/scriptModel';
import { useAuth } from '@/features/auth';
import { useNotifications } from '@/hooks/useNotifications';
import useLocalStorage from '@/hooks/useLocalStorage';
import { useRevitStatus } from '@/hooks/useRevitStatus';
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

  const { isAuthenticated, user } = useAuth();
  const { showNotification } = useNotifications();
  const { activeScriptSource, setActiveScriptSource } = useUI();

  // V4: Determine stable user key
  const stableUserId = user?.id || 'anon';

  // 1. AUTOMATION FOLDER STATE (The Sidebar) - Strictly Isolated
  const [customScriptFolders, setCustomScriptFolders] = useLocalStorage<string[]>(`rap_customScriptFolders_${stableUserId}`, []);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSystemReady]); // Dependency array intentionally minimal to run only on mount/ready

  // 4. SELECTION & LOADING
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [favoriteScripts, setFavoriteScripts] = useLocalStorage<string[]>(`rap_favoriteScripts_${stableUserId}`, []);
  const [recentScripts, setRecentScripts] = useLocalStorage<string[]>(`rap_recentScripts_${stableUserId}`, []);
  const [lastRunTimes, setLastRunTimes] = useLocalStorage<Record<string, string>>(`rap_lastRunTimes_${stableUserId}`, {});

  // V4: Frontend-driven Metadata Tracking
  const [creationTimes, setCreationTimes] = useLocalStorage<Record<string, string>>(`rap_creationTimes_${stableUserId}`, {});
  const [modificationTimes, setModificationTimes] = useLocalStorage<Record<string, string>>(`rap_modificationTimes_${stableUserId}`, {});

  // V5: Stable Metadata Refs to prevent dependency loops in loadScriptsFromPath
  const lastRunTimesRef = useRef(lastRunTimes);
  const creationTimesRef = useRef(creationTimes);
  const modificationTimesRef = useRef(modificationTimes);

  useEffect(() => { lastRunTimesRef.current = lastRunTimes; }, [lastRunTimes]);
  useEffect(() => { creationTimesRef.current = creationTimes; }, [creationTimes]);
  useEffect(() => { modificationTimesRef.current = modificationTimes; }, [modificationTimes]);

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

  const loadScriptsFromPath = useCallback(async (folderPath: string, silent: boolean = false) => {
    try {
      if (!silent) setScripts([]);
      setSelectedFolder(folderPath);
      const response = await api.get(`/api/scripts?folderPath=${encodeURIComponent(folderPath)}`);
      const loadedScripts: Script[] = response.data.map((s: Script) => ({
        ...s,
        metadata: {
          ...s.metadata,
          lastRun: lastRunTimesRef.current[s.id] || s.metadata.lastRun,
          dateCreated: creationTimesRef.current[s.id] || s.metadata.dateCreated,
          dateModified: modificationTimesRef.current[s.id] || s.metadata.dateModified
        }
      }));
      setScripts(loadedScripts);
      return loadedScripts;
    } catch (error: unknown) {
      console.error("Failed to load scripts:", error);
      showNotification(`Failed to fetch scripts`, "error");
      setScripts([]);
      return undefined;
    }
  }, [showNotification]);

  useEffect(() => {
    if (!isAuthenticated || !user || !isSystemReady) return;

    let path_to_load: string | null = null;
    if (activeScriptSource) {
      if (activeScriptSource.type === 'local') {
        path_to_load = activeScriptSource.path;
      }
    }

    if (path_to_load) {
      loadScriptsFromPath(path_to_load);
      setSelectedFolder(path_to_load);
    } else {
      setScripts([]);
      setSelectedFolder(null);
    }
  }, [activeScriptSource, loadScriptsFromPath, setActiveScriptSource, isAuthenticated, user, isSystemReady]);

  const createNewScript = useCallback(async (details: {
    script_name: string;
    template_id?: string;
    generated_logic?: string;
    generated_params?: string;
    parent_folder?: string | null;
  }) => {
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
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      showNotification(err.response?.data?.detail || "Failed to create script", "error");
      return undefined;
    }
  }, [selectedFolder, loadScriptsFromPath, showNotification, setLastRunTimes, setModificationTimes, setCreationTimes]);

  const editScript = useCallback(async (script: Script, forceScaffold: boolean = false) => {
    if (!script || !isAuthenticated) return false;
    try {
      await api.post("/api/edit-script", {
        scriptPath: script.absolutePath,
        force_scaffold: forceScaffold
      });
      showNotification(forceScaffold ? "Scaffolding regenerated. Opening..." : "Opening project in VS Code...", "success");
      return true;
    } catch (error: unknown) {
      console.error("[EditScript] Error:", error);
      const err = error as { response?: { data?: { detail?: string } } };
      showNotification(err.response?.data?.detail || "Failed to open script in VSCode.", "error");
      return false;
    }
  }, [isAuthenticated, showNotification]);

  const deleteScript = useCallback(async (script: Script, scaffoldingOnly: boolean = false): Promise<boolean> => {
    try {
      await api.post("/api/scripts/delete", {
        script_path: script.absolutePath,
        delete_scaffolding_only: scaffoldingOnly
      });
      if (selectedFolder) await loadScriptsFromPath(selectedFolder, true);
      showNotification(scaffoldingOnly ? "Scaffolding cleared" : "Script deleted", "success");
      return true;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } } };
      const msg = err.response?.data?.detail || (scaffoldingOnly ? "Failed to clear scaffolding" : "Failed to delete script");
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

  const fetchScriptMetadata = useCallback(async (scriptId: string) => {
    const script = scriptsRef.current.find(s => s.id === scriptId);
    if (!script) return;
    try {
      const response = await api.post("/api/script-metadata", { scriptPath: script.absolutePath });

      const backendMetadata = response.data.metadata;
      const mergedMetadata = {
        ...script.metadata,
        ...backendMetadata,
        lastRun: lastRunTimesRef.current[scriptId] || backendMetadata.lastRun,
        dateCreated: creationTimesRef.current[scriptId] || backendMetadata.dateCreated,
        dateModified: modificationTimesRef.current[scriptId] || backendMetadata.dateModified
      };

      setScripts(prev => prev.map(s => s.id === scriptId ? { ...s, metadata: mergedMetadata } : s));
    } catch (err) { /* ignore individual metadata fetch errors */ }
  }, [setScripts]);

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
        lastRun: lastRunTimesRef.current[script.id] || backendMetadata.lastRun,
        dateCreated: creationTimesRef.current[script.id] || backendMetadata.dateCreated,
        dateModified: modificationTimesRef.current[script.id] || backendMetadata.dateModified
      };

      setScripts(prev => prev.map(s => s.id === script.id ? { ...s, parameters: paramsRes.data.parameters, metadata: mergedMetadata } : s));
    } catch (err) { /* ignore reload errors */ }
  }, [setScripts]);

  // 5. SYNC SESSION TRACKING
  const [activeSyncSessions, setActiveSyncSessions] = useState<Record<string, { last_modified: number }>>({});
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchActiveSyncSessions = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const response = await silentApi.get('/api/sync/active-sessions');
      if (response.data) {
        setActiveSyncSessions(response.data);
      }
    } catch (error: unknown) {
      const err = error as { response?: { status: number } };
      if (err.response?.status === 401) {
        // Token expired — silently ignore
        setActiveSyncSessions({});
      }
      // Other errors (e.g., endpoint not available in dev) — silently ignore
    }
  }, [isAuthenticated]);

  // Smart polling: only poll fast when sessions are active
  useEffect(() => {
    if (!isAuthenticated) {
      setActiveSyncSessions({});
      return;
    }

    // Determine polling speed based on session state
    const hasActiveSessions = Object.keys(activeSyncSessions).length > 0;
    const normalizedFolder = (selectedFolder || "").replace(/\\/g, '/').toLowerCase();
    const activeFolderMatches = hasActiveSessions && normalizedFolder && Object.keys(activeSyncSessions).some(
      key => key.replace(/\\/g, '/').toLowerCase() === normalizedFolder
    );

    // Speed: 500ms (active editing), 2000ms (any session), 30000ms (no sessions — discovery probe)
    const speed = activeFolderMatches ? 500 : hasActiveSessions ? 2000 : 30000;

    // Clear existing interval and set new one
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    syncIntervalRef.current = setInterval(fetchActiveSyncSessions, speed);

    // Also fetch on window focus (catches VS Code edits made while window was unfocused)
    const onFocus = () => fetchActiveSyncSessions();
    window.addEventListener('focus', onFocus);

    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      window.removeEventListener('focus', onFocus);
    };
  }, [isAuthenticated, activeSyncSessions, selectedFolder, fetchActiveSyncSessions]);

  const isSyncActive = useCallback((scriptPath: string) => {
    if (!scriptPath || !activeSyncSessions) return false;
    const normalized = scriptPath.replace(/\\/g, '/').toLowerCase();
    return Object.keys(activeSyncSessions).some(key => key.replace(/\\/g, '/').toLowerCase() === normalized);
  }, [activeSyncSessions]);

  const isValidatingRef = useRef(false);

  // 6. STALE SOURCE RECONCILIATION (Auto-Healing)
  const validateSources = useCallback(async () => {
    if (!isSystemReady || isValidatingRef.current) return;

    // Gather all local paths to validate
    const localPaths = new Set<string>();
    customScriptFolders.forEach(p => localPaths.add(p));
    if (toolLibraryPath) localPaths.add(toolLibraryPath);

    if (localPaths.size === 0) return;

    isValidatingRef.current = true;
    try {
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

      // B. Heal tool library (Agent)
      if (toolLibraryPath && normalizedMap[normalizePath(toolLibraryPath)] === false) {
        console.log(`[ScriptProvider] 🩹 Auto-Healing: Clearing stale agent scripts path: ${toolLibraryPath}`);
        setToolLibraryPath(null);
      }

      // C. Active source mismatch
      if (activeScriptSource?.type === 'local' && activeScriptSource.path && normalizedMap[normalizePath(activeScriptSource.path)] === false) {
        console.log(`[ScriptProvider] 🩹 Auto-Healing: Reseting stale active source: ${activeScriptSource.path}`);
        setActiveScriptSource(null);
        setScripts([]);
      }

      // D. Fine-Grained Script Sync: Refresh active list if individual scripts were deleted externally
      if (activeScriptSource?.type === 'local' && !hasChanges) {
        const currentPath = activeScriptSource.path;
        if (currentPath && normalizedMap[normalizePath(currentPath)] === true) {
          loadScriptsFromPath(currentPath, true);
        }
      }

    } catch (err) {
      console.error("[ScriptProvider] Failed to validate sources:", err);
    } finally {
      isValidatingRef.current = false;
    }
  }, [isSystemReady, customScriptFolders, toolLibraryPath, activeScriptSource, setCustomScriptFolders, setToolLibraryPath, setActiveScriptSource, loadScriptsFromPath]);

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
  }, [isSystemReady, validateSources, loadScriptsFromPath]);

  const contextValue = useMemo(() => ({
    scripts, setScripts, activeScriptSource, setActiveScriptSource,
    loadScriptsForFolder: loadScriptsFromPath, fetchScriptMetadata, reloadScript,
    combinedScriptContent, setCombinedScriptContent, createNewScript, editScript, deleteScript,
    favoriteScripts, toggleFavoriteScript, clearFavoriteScripts,
    recentScripts, addRecentScript, clearRecentScripts,
    lastRunTimes, updateScriptLastRunTime,
    isSyncActive, activeSyncSessions,
    customScriptFolders, setCustomScriptFolders, addCustomScriptFolder, addCustomScriptFolders, removeCustomScriptFolder, clearAllCustomScriptFolders,
    toolLibraryPath, setToolLibraryPath,
    canUseLocalFolders: true,
    selectedFolder,
    updateScriptModificationTime
  }), [
    scripts, activeScriptSource, setActiveScriptSource, loadScriptsFromPath, fetchScriptMetadata, reloadScript,
    combinedScriptContent, createNewScript, editScript, deleteScript, favoriteScripts, toggleFavoriteScript, clearFavoriteScripts,
    recentScripts, addRecentScript, clearRecentScripts, lastRunTimes, updateScriptLastRunTime,
    isSyncActive, activeSyncSessions, customScriptFolders, setCustomScriptFolders, addCustomScriptFolder, addCustomScriptFolders, removeCustomScriptFolder, clearAllCustomScriptFolders,
    toolLibraryPath, setToolLibraryPath,
    selectedFolder,
    updateScriptModificationTime
  ]);

  return <ScriptContext.Provider value={contextValue}>{children}</ScriptContext.Provider>;
};
