import { useEffect, useCallback, useRef, useMemo } from 'react';
import { ScriptExecutionContext, ScriptExecutionContextProps } from './ScriptExecutionContext';
export { ScriptExecutionContext };
export type { ScriptExecutionContextProps };
import type { Script, ScriptParameter, RawScriptParameterData } from '@/types/scriptModel';
import { useNotifications } from '@/hooks/useNotifications';
import { useScripts } from '../hooks/useScripts';
import { useAuth } from '@/features/auth';
import { useUI } from '@/hooks/useUI';
import { useRevitStatus } from '@/hooks/useRevitStatus';

function isSameScript(s1: Script | null | undefined, s2: Script | null | undefined): boolean {
  if (!s1 || !s2) return false;
  if (s1.id === s2.id) return true;
  const p1 = (s1.absolutePath || s1.id).replace(/\\/g, '/').toLowerCase();
  const p2 = (s2.absolutePath || s2.id).replace(/\\/g, '/').toLowerCase();
  return p1 === p2;
}
import api from '@/api/axios';

// Hooks
import { useParameterCache } from '../hooks/execution/useParameterCache';
import { usePresetManagement } from '../hooks/execution/usePresetManagement';
import { useScriptOperations } from '../hooks/execution/useScriptOperations';
import { useExecutionRunner } from '../hooks/execution/useExecutionRunner';
import { useScriptSelection } from '../hooks/execution/useScriptSelection';
import { useParameterComputations } from '../hooks/execution/useParameterComputations';

export const ScriptExecutionProvider = ({ children }: { children: React.ReactNode }) => {
  const { showNotification } = useNotifications();
  const {
    scripts,
    setScripts,
    addRecentScript,
    fetchScriptMetadata,
    reloadScript,
    combinedScriptContent,
    setCombinedScriptContent,
    updateScriptLastRunTime,
    updateScriptModificationTime,
    selectedFolder,
    loadScriptsForFolder: loadScriptsFromPath,
    activeSyncSessions,
    editScript: editScriptFromContext
  } = useScripts();
  const { isAuthenticated, activeTeam, user, cloudToken, isEnterprise } = useAuth();
  const { activeScriptSource, setAgentSelectedScriptPath, setActiveInspectorTab, threadId } = useUI();
  const { revitStatus } = useRevitStatus();

  // 1. Selection State
  const {
    selectedScript,
    setSelectedScriptState,
    selectedScriptRef,
    setPersistedScriptId
  } = useScriptSelection();

  // 2. Parameter Caching
  const {
    userEditedScriptParameters,
    setUserEditedScriptParameters,
    userEditedParametersRef,
    activePresets,
    setActivePresets,
    defaultDraftParameters,
    updateUserEditedParameters,
    clearParameterCache
  } = useParameterCache(setScripts, setSelectedScriptState);

  // 3. Preset Management
  const {
    presets,
    setPresets,
    addPreset,
    updatePreset,
    deletePreset,
    renamePreset
  } = usePresetManagement(selectedScript, isAuthenticated);

  // 4. Script Operations
  const {
    renameScript,
    buildTool,
    editScript,
    fetchScriptContent
  } = useScriptOperations(
    isAuthenticated,
    cloudToken,
    selectedFolder,
    loadScriptsFromPath,
    setCombinedScriptContent,
    setSelectedScriptState,
    updateScriptModificationTime,
    editScriptFromContext
  );

  // 5. Execution Logic
  const {
    runningScriptPath,
    executionResult,
    setExecutionResult,
    runScript
  } = useExecutionRunner(threadId, addRecentScript, updateScriptLastRunTime, isEnterprise);

  // 6. Parameter Computations
  const {
    isComputingOptions,
    computeParameterOptions,
    pickObject
  } = useParameterComputations(
    revitStatus,
    userEditedScriptParameters,
    setUserEditedScriptParameters,
    setSelectedScriptState,
    selectedScript?.id
  );

  const lastKnownModifiedRef = useRef<Record<string, number>>({});
  const isRenamingRef = useRef(false);
  const loadingScriptPathRef = useRef<string | null>(null);

  // Reset logic when source/folder changes (Navigation)
  useEffect(() => {
    setSelectedScriptState(null);
    setPersistedScriptId(null);
    setCombinedScriptContent(null);
    setAgentSelectedScriptPath(null);
  }, [activeScriptSource, selectedFolder, setPersistedScriptId, setCombinedScriptContent, setSelectedScriptState, setAgentSelectedScriptPath]);

  // Reset logic when user identity changes (Security)
  useEffect(() => {
    setSelectedScriptState(null);
    setPersistedScriptId(null);
    setCombinedScriptContent(null);
    setAgentSelectedScriptPath(null);
  }, [user?.id, setPersistedScriptId, setCombinedScriptContent, setSelectedScriptState, setAgentSelectedScriptPath]);

  const setActivePreset = useCallback((scriptId: string, presetName: string) => {
    setActivePresets(prev => ({ ...prev, [scriptId]: presetName }));
  }, [setActivePresets]);

  const setSelectedScript = useCallback(async (script: Script | null, source: 'user' | 'agent' | 'agent_executed_full_output' | 'refresh' | 'hard_reset' | 'replace' = 'user') => {
    if (!script) {
      setSelectedScriptState(null);
      setCombinedScriptContent(null);
      setPresets([]);
      setAgentSelectedScriptPath(null);
      loadingScriptPathRef.current = null;
      return;
    }

    const scriptPath = script.absolutePath || script.id;

    // V6 ATOMIC LOCK: Prevent redundant overlapping selection requests for the same script.
    if (loadingScriptPathRef.current === scriptPath) {
      return;
    }

    const currentSelected = selectedScriptRef.current;

    // V5 ROBUST COMPARISON: uses shared isSameScript below

    if (source !== 'refresh' && source !== 'hard_reset' && source !== 'replace' && currentSelected && isSameScript(script, currentSelected)) {
      if (source === 'agent') setAgentSelectedScriptPath(script.absolutePath);
      return;
    }

    if (source === 'replace') {
      clearParameterCache(script.id);
      updateScriptModificationTime(script.id);
    }

    if (source === 'user' && selectedScriptRef.current && isSameScript(script, selectedScriptRef.current) && selectedScriptRef.current.parameters?.length > 0) {
      return;
    }

    if (source === 'user' || source === 'agent' || source === 'replace') {
      setCombinedScriptContent("// Loading script context...");
      setPresets([]);
    }

    loadingScriptPathRef.current = scriptPath;

    try {
      let paramsResult: { parameters: RawScriptParameterData[], error?: string } = { parameters: [] };
      if (script.absolutePath) {
        paramsResult = await api.post("/api/get-script-parameters", { scriptPath: script.absolutePath }).then(r => r.data).catch(e => ({ error: e.message }));
      }

      const contentResult = await fetchScriptContent(script);
      fetchScriptMetadata(script.id);

      let freshParameters: ScriptParameter[] = [];
      if (paramsResult.parameters) {
        freshParameters = paramsResult.parameters.map((p: RawScriptParameterData) => {
          let value: ScriptParameter['value'] = p.defaultValueJson;
          try {
            // V5 PRECISION FIX: Preserve trailing zeros for double/number
            const isDouble = p.type === 'number' || p.numericType === 'double';
            if (isDouble && p.defaultValueJson.includes('.')) {
              value = p.defaultValueJson.replace(/"/g, '');
            } else {
              value = JSON.parse(p.defaultValueJson);
            }
          } catch { /* ignore parse errors for non-JSON strings */ }
          if (p.type === 'boolean' && typeof value === 'string') value = value.toLowerCase() === 'true';
          return { ...p, type: p.type as ScriptParameter['type'], value, defaultValue: value };
        });
      }

      const cachedParams = (source !== 'hard_reset') ? (userEditedParametersRef.current[script.id] || []) : [];
      let finalParameters: ScriptParameter[] = freshParameters;

      if (cachedParams.length > 0 && source !== 'hard_reset') {
        finalParameters = freshParameters.map(fresh => {
          const cached = cachedParams.find(c => c.name === fresh.name);
          if (cached) {
            const isFollowingDefault = cached.value === cached.defaultValue;
            const valueToUse = isFollowingDefault ? fresh.defaultValue : cached.value;
            const resolvedOptions = (fresh.options && fresh.options.length > 0) ? fresh.options : (cached.options || []);
            return {
              ...fresh,
              value: valueToUse,
              defaultValue: fresh.defaultValue,
              options: resolvedOptions,
              computedInDocument: cached.computedInDocument
            };
          }
          return fresh;
        });
      }

      updateUserEditedParameters(script.id, finalParameters);
      if (contentResult) setCombinedScriptContent(contentResult);
      setSelectedScriptState({ ...script, parameters: finalParameters });

      // Ensure Parameters tab is active on manual selection
      if (source === 'user') {
        setActiveInspectorTab('parameters');
      }

      if (source !== 'refresh') {
        if (finalParameters.length > 0) {
          showNotification(`Loaded ${finalParameters.length} parameters.`, "success");
        } else {
          showNotification("Script loaded (no parameters).", "info");
        }
      }
    } catch (err) {
      if (source !== 'refresh') {
        showNotification("Error loading script.", "error");
      }
    } finally {
      if (loadingScriptPathRef.current === scriptPath) {
        loadingScriptPathRef.current = null;
      }
    }
  }, [fetchScriptContent, fetchScriptMetadata, setCombinedScriptContent, setPresets, setAgentSelectedScriptPath, updateUserEditedParameters, clearParameterCache, setSelectedScriptState, showNotification, selectedScriptRef, setActiveInspectorTab, updateScriptModificationTime, userEditedParametersRef]);

  // Sync session changes (Automated refresh when editing in IDE)
  useEffect(() => {
    if (!selectedScript?.absolutePath || !activeSyncSessions) return;

    const normalizedSelected = selectedScript.absolutePath.replace(/\\/g, '/').toLowerCase();
    // Find the sync session whose folder contains this script
    const sessionEntry = Object.entries(activeSyncSessions).find(([path]) => {
      const normalizedPath = path.replace(/\\/g, '/').toLowerCase();
      return normalizedSelected.startsWith(normalizedPath + "/");
    });

    if (sessionEntry) {
      const [_, data] = sessionEntry;
      const lastModified = data.last_modified;
      if (lastModified) {
        const lastSeen = lastKnownModifiedRef.current[normalizedSelected] || 0;
        if (lastModified > lastSeen) {
          lastKnownModifiedRef.current[normalizedSelected] = lastModified;

          reloadScript(selectedScript).then(() => {
            setSelectedScript(selectedScript, 'refresh');
          }).catch((err: unknown) => console.error("[Sync] Refresh failed:", err));
        }
      }
    }
  }, [activeSyncSessions, selectedScript, reloadScript, setSelectedScript]);

  // V5: SMART EXISTENCE GUARD
  useEffect(() => {
    if (selectedScript) {
      // V5 FIX: If we are currently renaming, ignore existence checks to avoid premature deselection
      if (isRenamingRef.current) return;

      const globalScript = scripts.find(s => isSameScript(s, selectedScript));

      if (!globalScript && scripts.length > 0) {
        const scriptPath = (selectedScript.absolutePath || "").replace(/\\/g, '/').toLowerCase();
        const galleryPath = (selectedFolder || "").replace(/\\/g, '/').toLowerCase();

        if (galleryPath && scriptPath.startsWith(galleryPath)) {
          setSelectedScriptState(null);
          return;
        }
      }

      if (globalScript && (
        globalScript.metadata.lastRun !== selectedScript.metadata.lastRun ||
        globalScript.metadata.dateModified !== selectedScript.metadata.dateModified ||
        globalScript.metadata.dateCreated !== selectedScript.metadata.dateCreated
      )) {
        setSelectedScriptState(prev => prev ? {
          ...prev,
          metadata: {
            ...prev.metadata,
            lastRun: globalScript.metadata.lastRun,
            dateModified: globalScript.metadata.dateModified,
            dateCreated: globalScript.metadata.dateCreated
          }
        } : globalScript);
      }
    }
  }, [scripts, selectedScript, selectedFolder, setSelectedScriptState]);

  const resetScriptParameters = useCallback(async (scriptId: string) => {
    clearParameterCache(scriptId);
    showNotification("Parameters reset to defaults.", "info");
    const scriptToReset = selectedScriptRef.current;
    if (scriptToReset && scriptToReset.id === scriptId) await setSelectedScript(scriptToReset, 'hard_reset');
  }, [clearParameterCache, setSelectedScript, showNotification, selectedScriptRef]);

  const clearExecutionResult = useCallback(() => {
    setExecutionResult(null);
  }, [setExecutionResult]);

  const handleRunScript = useCallback(async (script: Script, parameters?: ScriptParameter[], shouldUpdateGlobalState: boolean = true) => {
    // V6 ROBUST SELECTION SYNC: If running a script that isn't selected (e.g. from gallery Card),
    // we MUST ensure selectedScript is synced first so Console markers work correctly.
    if (selectedScriptRef.current?.id !== script.id) {
      await setSelectedScript(script);
    }
    
    const finalParameters = parameters || userEditedParametersRef.current[script.id] || script.parameters || [];
    return runScript(script, finalParameters, shouldUpdateGlobalState);
  }, [runScript, setSelectedScript, selectedScriptRef, userEditedParametersRef]);

  const handleRenameScript = useCallback(async (script: Script, newName: string) => {
    // 1. Lock the identity guard
    isRenamingRef.current = true;

    try {
      const result = await renameScript(script, newName);
      if (result.success && result.newPath && selectedFolder) {
        // 2. Refresh the global list immediately
        const reloadedScripts = await loadScriptsFromPath(selectedFolder, true);

        // 3. Find and re-select the new identity in the fresh list
        if (reloadedScripts) {
          const normalizedNewPath = result.newPath.replace(/\\/g, '/').toLowerCase();
          const newScript = reloadedScripts.find(s =>
            (s.absolutePath || '').replace(/\\/g, '/').toLowerCase() === normalizedNewPath
          ) || reloadedScripts.find(s =>
            (s.metadata?.displayName || s.name || '').toLowerCase() === newName.toLowerCase()
          );
          if (newScript) {
            await setSelectedScript(newScript, 'replace');
          }
        }
        return result;
      }
      return result;
    } finally {
      // 4. Unlock after all state updates have settled
      isRenamingRef.current = false;
    }
  }, [renameScript, setSelectedScript, selectedFolder, loadScriptsFromPath]);

  const contextValue = useMemo(() => ({
    selectedScript, setSelectedScript, runningScriptPath, executionResult, setExecutionResult, runScript: handleRunScript, clearExecutionResult, userEditedScriptParameters, updateUserEditedParameters, defaultDraftParameters, activePresets, setActivePreset, presets, addPreset, updatePreset, deletePreset, renamePreset, computeParameterOptions, pickObject, isComputingOptions, combinedScriptContent, editScript, renameScript: handleRenameScript, resetScriptParameters, buildTool,
  }), [selectedScript, setSelectedScript, runningScriptPath, executionResult, setExecutionResult, handleRunScript, clearExecutionResult, userEditedScriptParameters, updateUserEditedParameters, defaultDraftParameters, activePresets, setActivePreset, presets, addPreset, updatePreset, deletePreset, renamePreset, computeParameterOptions, pickObject, isComputingOptions, combinedScriptContent, editScript, handleRenameScript, resetScriptParameters, buildTool]);

  return <ScriptExecutionContext.Provider value={contextValue}>{children}</ScriptExecutionContext.Provider>;
};
