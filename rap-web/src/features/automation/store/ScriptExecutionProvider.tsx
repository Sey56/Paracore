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
    setCombinedScriptContent,
    updateScriptLastRunTime,
    updateScriptModificationTime,
    selectedFolder,
    loadScriptsForFolder: loadScriptsFromPath,
    activeSyncSessions
  } = useScripts();
  const { isAuthenticated, activeTeam, user, cloudToken } = useAuth();
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
    updateScriptModificationTime
  );

  // 5. Execution Logic
  const {
    runningScriptPath,
    executionResult,
    setExecutionResult,
    runScript
  } = useExecutionRunner(threadId, addRecentScript, updateScriptLastRunTime);

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

  // Reset logic when source/team changes
  useEffect(() => {
    setSelectedScriptState(null);
    setPersistedScriptId(null);
    setCombinedScriptContent(null);
    setExecutionResult(null);
  }, [activeScriptSource, setPersistedScriptId, setCombinedScriptContent, setExecutionResult, setSelectedScriptState]);

  const lastTeamIdRef = useRef<number | null>(null);
  useEffect(() => {
    const currentTeamId = activeTeam?.team_id || null;
    if (lastTeamIdRef.current !== null && lastTeamIdRef.current !== currentTeamId) {
      setSelectedScriptState(null);
      setPersistedScriptId(null);
      setCombinedScriptContent(null);
      setExecutionResult(null);
      setAgentSelectedScriptPath(null);
    }
    lastTeamIdRef.current = currentTeamId;
  }, [activeTeam?.team_id, setCombinedScriptContent, setAgentSelectedScriptPath, setPersistedScriptId, setSelectedScriptState, setExecutionResult]);

  const setActivePreset = useCallback((scriptId: string, presetName: string) => {
    setActivePresets(prev => ({ ...prev, [scriptId]: presetName }));
  }, [setActivePresets]);

  const setSelectedScript = useCallback(async (script: Script | null, source: 'user' | 'agent' | 'agent_executed_full_output' | 'refresh' | 'hard_reset' | 'replace' = 'user') => {
    if (!script) {
      setSelectedScriptState(null);
      setCombinedScriptContent(null);
      setPresets([]);
      setAgentSelectedScriptPath(null);
      return;
    }

    const currentSelected = selectedScriptRef.current;
    if (source !== 'refresh' && source !== 'hard_reset' && source !== 'replace' && script.id === currentSelected?.id) {
      if (source === 'agent') setAgentSelectedScriptPath(script.absolutePath);
      return;
    }

    if (source === 'replace') {
      clearParameterCache(script.id);
      updateScriptModificationTime(script.id);
    }

    if (source === 'user' && selectedScriptRef.current?.id === script.id && selectedScriptRef.current.parameters?.length > 0) {
      return;
    }

    if (source !== 'refresh' && source !== 'hard_reset') {
      setCombinedScriptContent("// Loading script context...");
      setPresets([]);
    }

    try {
      let paramsResult: any = { parameters: [] };
      if (script.absolutePath) {
        paramsResult = await api.post("/api/get-script-parameters", { scriptPath: script.absolutePath }).then(r => r.data).catch(e => ({ error: e.message }));
      }

      const contentResult = await fetchScriptContent(script);
      fetchScriptMetadata(script.id);

      let freshParameters: ScriptParameter[] = [];
      if (paramsResult.parameters) {
        freshParameters = paramsResult.parameters.map((p: RawScriptParameterData) => {
          let value: any = p.defaultValueJson;
          try { value = JSON.parse(p.defaultValueJson); } catch { }
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
            // V5: Intelligent Merging
            // If the user's current value matches the OLD default, it means they are "following" the script.
            // In that case, we should adopt the NEW default from the fresh parse.
            // If they have diverged (value !== defaultValue), we preserve their manual entry.
            const isFollowingDefault = cached.value === cached.defaultValue;
            const valueToUse = isFollowingDefault ? fresh.defaultValue : cached.value;

            const resolvedOptions = (fresh.options && fresh.options.length > 0) ? fresh.options : (cached.options || []);
            return {
              ...fresh,
              value: valueToUse,
              defaultValue: fresh.defaultValue, // Always update the baseline default
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
    }
  }, [fetchScriptContent, fetchScriptMetadata, setCombinedScriptContent, setPresets, setAgentSelectedScriptPath, updateUserEditedParameters, clearParameterCache, setSelectedScriptState, showNotification]);

  // Sync session changes
  useEffect(() => {
    if (selectedScript && selectedScript.absolutePath) {
      const normalizedPath = selectedScript.absolutePath.toLowerCase().replace(/\\/g, '/');
      const sessionData = activeSyncSessions[normalizedPath];

      if (sessionData && sessionData.last_modified) {
        const lastSeen = lastKnownModifiedRef.current[normalizedPath] || 0;
        if (sessionData.last_modified > lastSeen) {
          updateScriptModificationTime(selectedScript.id);
          lastKnownModifiedRef.current[normalizedPath] = sessionData.last_modified;
          // Trigger a refresh after sync
          setSelectedScript(selectedScript, 'refresh');
        }
      }
    }
  }, [activeSyncSessions, selectedScript, updateScriptModificationTime, setSelectedScript]);

  // Sync selectedScript with global scripts state to ensure metadata updates (like Last Run) are reflected in the Inspector
  useEffect(() => {
    if (selectedScript) {
      const globalScript = scripts.find(s => s.id === selectedScript.id);
      if (globalScript && (
        globalScript.metadata.lastRun !== selectedScript.metadata.lastRun ||
        globalScript.metadata.dateModified !== selectedScript.metadata.dateModified ||
        globalScript.metadata.dateCreated !== selectedScript.metadata.dateCreated
      )) {
        setSelectedScriptState(globalScript);
      }
    }
  }, [scripts, selectedScript, setSelectedScriptState]);

  const resetScriptParameters = useCallback(async (scriptId: string) => {
    clearParameterCache(scriptId);
    showNotification("Parameters reset to defaults.", "info");
    const scriptToReset = selectedScriptRef.current;
    if (scriptToReset && scriptToReset.id === scriptId) await setSelectedScript(scriptToReset, 'hard_reset');
  }, [clearParameterCache, setSelectedScript, showNotification]);

  const clearExecutionResult = useCallback(() => {
    setExecutionResult(null);
  }, [setExecutionResult]);

  const handleRunScript = useCallback(async (script: Script, parameters?: ScriptParameter[], shouldUpdateGlobalState: boolean = true) => {
    const finalParameters = parameters || userEditedParametersRef.current[script.id] || script.parameters || [];
    return runScript(script, finalParameters, shouldUpdateGlobalState);
  }, [runScript]);

  const contextValue = useMemo(() => ({
    selectedScript, setSelectedScript, runningScriptPath, executionResult, setExecutionResult, runScript: handleRunScript, clearExecutionResult, userEditedScriptParameters, updateUserEditedParameters, defaultDraftParameters, activePresets, setActivePreset, presets, addPreset, updatePreset, deletePreset, renamePreset, computeParameterOptions, pickObject, isComputingOptions, editScript, renameScript, resetScriptParameters, buildTool,
  }), [selectedScript, setSelectedScript, runningScriptPath, executionResult, setExecutionResult, handleRunScript, clearExecutionResult, userEditedScriptParameters, updateUserEditedParameters, defaultDraftParameters, activePresets, setActivePreset, presets, addPreset, updatePreset, deletePreset, renamePreset, computeParameterOptions, pickObject, isComputingOptions, editScript, renameScript, resetScriptParameters, buildTool]);

  return <ScriptExecutionContext.Provider value={contextValue}>{children}</ScriptExecutionContext.Provider>;
};
