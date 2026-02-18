import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ScriptExecutionContext, ScriptExecutionContextProps } from './ScriptExecutionContext';
export { ScriptExecutionContext };
export type { ScriptExecutionContextProps };
import type { Script, ScriptParameter, RawScriptParameterData } from '@/types/scriptModel';
import type { ExecutionResult, ParameterPreset } from '@/types/common';
import { useNotifications } from '@/hooks/useNotifications';
import { useScripts } from '../hooks/useScripts';
import { useAuth } from '@/features/auth';
import { useUI } from '@/hooks/useUI';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import api from '@/api/axios';
import { getFolderNameFromPath } from '@/utils/pathHelpers';
import { TeamScriptSource } from '@/types';
import useLocalStorage from '@/hooks/useLocalStorage';


// Helper function for robust value comparison
const areValuesEqual = (val1: unknown, val2: unknown, type?: string): boolean => {
  if (val1 === val2) return true;
  if ((val1 === null || val1 === undefined) && (val2 === null || val2 === undefined)) return true;

  if (type === 'boolean') {
    const b1 = typeof val1 === 'string' ? val1.toLowerCase() === 'true' : !!val1;
    const b2 = typeof val2 === 'string' ? val2.toLowerCase() === 'true' : !!val2;
    return b1 === b2;
  }

  if (type === 'number') {
    const EPSILON = 0.000001;
    const n1 = typeof val1 === 'string' ? parseFloat(val1) : val1 as number;
    const n2 = typeof val2 === 'string' ? parseFloat(val2) : val2 as number;
    return Math.abs((n1 || 0) - (n2 || 0)) < EPSILON;
  }

  if (Array.isArray(val1) || Array.isArray(val2)) {
    const toArr = (v: unknown): unknown[] => {
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') {
        const trimmed = v.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          try {
            return JSON.parse(trimmed) as unknown[];
          } catch (e) {
            return [];
          }
        }
      }
      return [];
    };

    const arr1 = toArr(val1);
    const arr2 = toArr(val2);

    if (arr1.length !== arr2.length) return false;
    const sorted1 = [...arr1].sort();
    const sorted2 = [...arr2].sort();
    return sorted1.every((val, index) => val === sorted2[index]);
  }

  return String(val1) === String(val2);
};

// Helper function for deep comparison of parameters
const areParametersEqual = (params1: ScriptParameter[], params2: ScriptParameter[]): boolean => {
  if (params1 === params2) return true;
  if (params1.length !== params2.length) return false;

  const sortedParams1 = [...params1].sort((a, b) => a.name.localeCompare(b.name));
  const sortedParams2 = [...params2].sort((a, b) => a.name.localeCompare(b.name));

  for (let i = 0; i < sortedParams1.length; i++) {
    const p1 = sortedParams1[i];
    const p2 = sortedParams2[i];

    if (p1.name !== p2.name || p1.type !== p2.type) return false;

    const options1 = p1.options || [];
    const options2 = p2.options || [];
    if (options1.length !== options2.length) return false;
    if (options1.some((opt, idx) => opt !== options2[idx])) return false;

    if (!areValuesEqual(p1.value, p2.value, p1.type)) return false;
  }
  return true;
};

export const ScriptExecutionProvider = ({ children }: { children: React.ReactNode }) => {
  const { showNotification } = useNotifications();
  const {
    scripts: allScriptsFromScriptProvider,
    remoteScriptSources,
    selectedFolder,
    setScripts,
    addRecentScript,
    fetchScriptMetadata,
    setCombinedScriptContent,
    updateScriptLastRunTime,
    reloadScript,
    loadScriptsForFolder: loadScriptsFromPath,
    activeSyncSessions
  } = useScripts();
  const { isAuthenticated, activeTeam, user, cloudToken } = useAuth();
  const { activeScriptSource, setAgentSelectedScriptPath, messages, setActiveMainView, setActiveInspectorTab, threadId } = useUI();
  const { revitStatus, ParacoreConnected } = useRevitStatus();

  const currentTeamSources = activeTeam ? (remoteScriptSources[activeTeam.team_id] || []) : [];

  const [selectedScript, setSelectedScriptState] = useState<Script | null>(null);
  const [persistedScriptId, setPersistedScriptId] = useLocalStorage<string | null>('rap_activeSelectedScriptId', null);
  const selectedScriptRef = useRef<Script | null>(null);
  const lastExplicitParameterFetchTimeRef = useRef<number>(0);
  const lastKnownModifiedRef = useRef<Record<string, number>>({});


  // Auto-Recovery Effect REMOVED per user request
  // We no longer restore selection after refresh to prevent confusion across sources.

  // Keep ref in sync and update persistence
  useEffect(() => {
    selectedScriptRef.current = selectedScript;
    // We still save it to local storage just in case we need it for something else, 
    // or if we decide to re-enable recovery later, but for now it won't be used to auto-select.
    if (selectedScript) {
      setPersistedScriptId(selectedScript.id);
    }
  }, [selectedScript, setPersistedScriptId]);

  useEffect(() => {
    if (selectedScript && selectedScript.absolutePath) {
      const normalizedPath = selectedScript.absolutePath.toLowerCase().replace(/\\/g, '/');
      const sessionData = activeSyncSessions[normalizedPath];

      if (sessionData && sessionData.last_modified) {
        const lastSeen = lastKnownModifiedRef.current[normalizedPath] || 0;
        if (sessionData.last_modified > lastSeen) {
          setSelectedScript(selectedScript, 'refresh');
          lastKnownModifiedRef.current[normalizedPath] = sessionData.last_modified;
        }
      }
    }
  }, [activeSyncSessions, selectedScript]);

  // Persistence for user-edited parameters across sessions
  const [userEditedScriptParameters, setUserEditedScriptParameters] = useLocalStorage<Record<string, ScriptParameter[]>>('rap_userEditedScriptParameters', {});
  const userEditedParametersRef = useRef(userEditedScriptParameters);

  useEffect(() => {
    userEditedParametersRef.current = userEditedScriptParameters;
  }, [userEditedScriptParameters]);

  const [activePresets, setActivePresets] = useLocalStorage<Record<string, string>>('rap_activePresets', {});

  const [defaultDraftParameters, setDefaultDraftParameters] = useLocalStorage<Record<string, ScriptParameter[]>>('rap_defaultDraftParameters', {});
  const defaultDraftParametersRef = useRef(defaultDraftParameters);

  useEffect(() => {
    defaultDraftParametersRef.current = defaultDraftParameters;
  }, [defaultDraftParameters]);

  const [runningScriptPath, setRunningScriptPath] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [presets, setPresets] = useState<ParameterPreset[]>([]);
  const [isComputingOptions, setIsComputingOptions] = useState<Record<string, boolean>>({});

  // Clear selection when the active script source changes
  // Moved here to be after state declarations
  useEffect(() => {
    // We check if the source actually changed identity/path
    // This ensures that when the user clicks a different folder/team in sidebar, we reset.
    console.log("[ScriptExecutionProvider] Source changed. Resetting selection.");
    setSelectedScriptState(null);
    setPersistedScriptId(null);
    setCombinedScriptContent(null);
    setExecutionResult(null);
  }, [activeScriptSource, setPersistedScriptId, setCombinedScriptContent, setExecutionResult]);

  const clearExecutionResult = useCallback(() => {
    setExecutionResult(null);
  }, []);

  const updateUserEditedParameters = useCallback((scriptId: string, parameters: ScriptParameter[], isPresetLoad: boolean = false) => {
    userEditedParametersRef.current = {
      ...userEditedParametersRef.current,
      [scriptId]: parameters
    };

    setUserEditedScriptParameters(prev => ({
      ...prev,
      [scriptId]: parameters,
    }));

    if (!isPresetLoad) {
      const currentPreset = activePresets[scriptId] || "<Default Parameters>";
      if (currentPreset === "<Default Parameters>") {
        defaultDraftParametersRef.current = {
          ...defaultDraftParametersRef.current,
          [scriptId]: parameters
        };
        setDefaultDraftParameters(prev => ({
          ...prev,
          [scriptId]: parameters,
        }));
      }
    }

    if (selectedScriptRef.current?.id === scriptId) {
      setSelectedScriptState(prev => prev ? { ...prev, parameters } : null);
    }

    setScripts(prev => prev.map(s => {
      if (s.id !== scriptId) return s;
      return { ...s, parameters };
    }));
  }, [setUserEditedScriptParameters, setActivePresets, setDefaultDraftParameters, activePresets, setScripts]);

  const lastTeamIdRef = useRef<number | null>(null);

  useEffect(() => {
    const currentTeamId = activeTeam?.team_id || null;
    if (lastTeamIdRef.current !== null && lastTeamIdRef.current !== currentTeamId) {
      console.log("[ScriptExecutionProvider] Team changed. Resetting inspector.");
      setSelectedScriptState(null);
      setPersistedScriptId(null);
      setCombinedScriptContent(null);
      setExecutionResult(null);
      setAgentSelectedScriptPath(null);
    }
    lastTeamIdRef.current = currentTeamId;
  }, [activeTeam?.team_id, setCombinedScriptContent, setAgentSelectedScriptPath, setPersistedScriptId]);

  const renameScript = useCallback(async (script: Script, newName: string) => {
    if (!script || !isAuthenticated) return { success: false, message: "Authentication required." };
    try {
      const response = await api.post("/api/rename-script", { oldPath: script.absolutePath, newName: newName });
      if (response.data.success) {
        showNotification(`Script renamed successfully.`, "success");
        if (selectedFolder) loadScriptsFromPath(selectedFolder, true);
        if (selectedScriptRef.current?.id === script.id) {
          setSelectedScriptState(null);
          setCombinedScriptContent(null);
        }
        return { success: true, message: "Script renamed successfully." };
      } else throw new Error(response.data.message);
    } catch (error: any) {
      showNotification(error.message || "Failed to rename script.", "error");
      return { success: false, message: error.message };
    }
  }, [isAuthenticated, selectedFolder, loadScriptsFromPath, showNotification, setCombinedScriptContent]);

  const buildTool = useCallback(async (script: Script) => {
    if (!script || !script.absolutePath) return { success: false, message: "Invalid path." };
    try {
      showNotification(`Forging automation unit...`, "info");
      const response = await api.post("/api/scripts/build-tool", { scriptPath: script.absolutePath });
      if (response.data.is_success) {
        showNotification(response.data.message, "success");
        if (selectedFolder) loadScriptsFromPath(selectedFolder, true);
        return { success: true, message: response.data.message };
      } else throw new Error(response.data.detail);
    } catch (error: any) {
      showNotification(error.message || "Failed to compile script.", "error");
      return { success: false, message: error.message };
    }
  }, [showNotification, selectedFolder, loadScriptsFromPath]);

  const editScript = useCallback(async (script: Script) => {
    if (!script || !user) return;
    try {
      const response = await fetch("http://localhost:8000/api/edit-script", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cloudToken}` },
        body: JSON.stringify({ scriptPath: script.absolutePath }),
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      showNotification(`Opening project in VS Code...`, "success");
    } catch (error) {
      console.error("[EditScript] Error:", error);
      showNotification("Failed to open script in VSCode.", "error");
    }
  }, [user, cloudToken, showNotification]);

  const setActivePreset = useCallback((scriptId: string, presetName: string) => {
    setActivePresets(prev => ({ ...prev, [scriptId]: presetName }));
  }, [setActivePresets]);

  const fetchScriptContent = useCallback(async (script: Script) => {
    if (!script?.absolutePath) return null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await api.get(`/api/script-content?scriptPath=${encodeURIComponent(script.absolutePath)}`);
        return response.data.sourceCode;
      } catch (error) {
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 300));
        else return null;
      }
    }
    return null;
  }, []);

  const savePresets = async (newPresets: ParameterPreset[]) => {
    if (selectedScript && selectedScript.absolutePath) {
      const normalizedPath = selectedScript.absolutePath.replace(/\\/g, '/');
      try {
        await api.post("/api/presets", { scriptPath: normalizedPath, presets: newPresets });
        showNotification("Presets saved successfully.", "success");
      } catch (error) {
        showNotification("Failed to save presets.", "error");
      }
    }
  };

  const notifiedPresetsScriptIdRef = useRef<string | null>(null);

  useEffect(() => {
    const fetchPresets = async () => {
      if (!selectedScript || !selectedScript.absolutePath) {
        setPresets([]);
        notifiedPresetsScriptIdRef.current = null;
        return;
      }

      // Guard: Only fetch if we haven't notified for THIS specific script selection yet
      if (notifiedPresetsScriptIdRef.current === selectedScript.id) {
        return;
      }

      const normalizedPath = selectedScript.absolutePath.replace(/\\/g, '/');

      try {
        const response = await api.get(`/api/presets?scriptPath=${encodeURIComponent(normalizedPath)}`);
        const data = response.data;

        if (data.error) throw new Error(data.error);
        if (!Array.isArray(data)) throw new Error("Invalid data format");

        const initializedPresets = data.map((preset: ParameterPreset) => ({
          ...preset,
          parameters: Array.isArray(preset.parameters) ? preset.parameters.map(p => {
            let processedValue: any = (p.value ?? p.defaultValue) ?? "";
            if (p.type === 'number' && typeof processedValue === 'string') {
              processedValue = parseFloat(processedValue);
              if (isNaN(processedValue)) processedValue = 0;
            } else if (p.type === 'boolean' && typeof processedValue === 'string') {
              processedValue = processedValue.toLowerCase() === 'true';
            }
            return { ...p, value: processedValue };
          }) : []
        }));

        setPresets(initializedPresets);
        notifiedPresetsScriptIdRef.current = selectedScript.id;

        if (initializedPresets.length > 0) {
          showNotification(`Loaded ${initializedPresets.length} presets for ${selectedScript.name}.`, "success");
        }
      } catch (_) {
        console.error("[Presets] Failed to fetch:", _);
        setPresets([]);
      }
    };

    if (isAuthenticated) {
      fetchPresets();
    }
  }, [selectedScript?.id, showNotification, isAuthenticated]);

  const addPreset = useCallback((preset: ParameterPreset) => {
    if (presets.some((p) => p.name === preset.name)) {
      showNotification("A preset with this name already exists.", "warning");
      return { success: false, message: "A preset with this name already exists." };
    }

    const existingWithSameValues = presets.find((p) => areParametersEqual(p.parameters, preset.parameters));
    if (existingWithSameValues) {
      showNotification(`A preset with identical values already exists: ${existingWithSameValues.name}`, "warning");
      return { success: false, message: `Identical values already exist in preset: ${existingWithSameValues.name}` };
    }

    const newPresets = [...presets, preset];
    setPresets(newPresets);
    savePresets(newPresets);
    return { success: true, message: "Preset saved." };
  }, [presets, showNotification, selectedScript, savePresets]);

  const updatePreset = useCallback((name: string, preset: ParameterPreset) => {
    const existingWithSameValues = presets.find((p) => p.name !== name && areParametersEqual(p.parameters, preset.parameters));
    if (existingWithSameValues) {
      showNotification(`Another preset with identical values already exists: ${existingWithSameValues.name}`, "warning");
      return { success: false, message: `Identical values already exist in preset: ${existingWithSameValues.name}` };
    }

    const newPresets = presets.map((p) => (p.name === name ? preset : p));
    setPresets(newPresets);
    savePresets(newPresets);
    return { success: true, message: "Preset updated." };
  }, [presets, showNotification, selectedScript, savePresets]);

  const deletePreset = useCallback((name: string) => {
    const newPresets = presets.filter((p) => p.name !== name);
    setPresets(newPresets);
    savePresets(newPresets);
    return { success: true, message: "Preset deleted." };
  }, [presets, showNotification, selectedScript]);

  const renamePreset = useCallback((oldName: string, newName: string) => {
    const newPresets = presets.map((p) => (p.name === oldName ? { ...p, name: newName } : p));
    setPresets(newPresets);
    savePresets(newPresets);
    return { success: true, message: "Preset renamed." };
  }, [presets, showNotification, selectedScript]);

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
      delete userEditedParametersRef.current[script.id];
      delete defaultDraftParametersRef.current[script.id];
      setUserEditedScriptParameters(prev => { const next = { ...prev }; delete next[script.id]; return next; });
      setDefaultDraftParameters(prev => { const next = { ...prev }; delete next[script.id]; return next; });
    }

    // On user selection, check if we already have it in state/ref to avoid flicker
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

      // --- ELITE SMART MERGE LOGIC ---
      // We ALWAYS favor cached parameters unless it's a 'hard_reset'
      const cachedParams = (source !== 'hard_reset') ? (userEditedParametersRef.current[script.id] || []) : [];
      let finalParameters: ScriptParameter[] = freshParameters;

      if (cachedParams.length > 0 && source !== 'hard_reset') {
        console.log(`[ScriptExecutionProvider] Merging fresh metadata with cached values for ${script.name}`);
        finalParameters = freshParameters.map(fresh => {
          const cached = cachedParams.find(c => c.name === fresh.name);
          if (cached) {
            // Determine if we should keep the cached value
            // If it's a computed param, we MUST keep options and the current value
            const resolvedOptions = (fresh.options && fresh.options.length > 0) ? fresh.options : (cached.options || []);

            return {
              ...fresh,
              value: cached.value, // Keep user entered value
              options: resolvedOptions, // Keep computed options
              computedInDocument: cached.computedInDocument // Keep document info
            };
          }
          return fresh;
        });
      }

      updateUserEditedParameters(script.id, finalParameters);
      if (contentResult) setCombinedScriptContent(contentResult);
      setSelectedScriptState({ ...script, parameters: finalParameters });

      // V4: Only show notification for explicit user/agent actions, not silent refreshes
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
  }, [fetchScriptContent, fetchScriptMetadata, setCombinedScriptContent, setScripts, showNotification, setAgentSelectedScriptPath, updateUserEditedParameters, setUserEditedScriptParameters, setDefaultDraftParameters]);

  const computeParameterOptions = useCallback(async (script: Script, parameterName: string, shouldUpdateGlobalState: boolean = true) => {
    setIsComputingOptions(prev => ({ ...prev, [parameterName]: true }));
    try {
      const currentParamsArray = userEditedScriptParameters[script.id] || script.parameters || [];
      const flatParams = currentParamsArray.reduce((acc, p) => { acc[p.name] = p.value; return acc; }, {} as Record<string, any>);

      const response = await api.post("/api/compute-parameter-options", {
        scriptPath: script.absolutePath, parameterName: parameterName, parameters: flatParams
      });

      const { options, is_success, error_message, min, max, step } = response.data;

      if (is_success) {
        const isRangeUpdate = (typeof min === 'number') || (typeof max === 'number');
        lastExplicitParameterFetchTimeRef.current = Date.now();

        const updateParamMetadata = (p: ScriptParameter) => {
          if (p.name !== parameterName) return p;
          const docType = revitStatus?.document || "Unknown Document"; // FIX: Use .document
          if (isRangeUpdate) return { ...p, min: min ?? p.min, max: max ?? p.max, step: step ?? p.step, computedInDocument: docType };
          return { ...p, options: options, computedInDocument: docType };
        };

        const updateParamValueAndReset = (p: ScriptParameter): ScriptParameter => {
          if (p.name !== parameterName || isRangeUpdate) return p;

          let defVal = p.defaultValue !== undefined ? p.defaultValue : "";

          // V4: Enhanced hydration for Multi-Select (Lists)
          if (Array.isArray(defVal)) {
            // Keep only default items that still exist in the new options
            const validDefaults = defVal.filter(item => options?.includes(String(item)));
            return { ...p, value: validDefaults as any }; // Explicit cast to bypass mixed-array inference
          }

          // Standard single-value logic
          if (options && options.length > 0 && !options.includes(String(defVal))) {
            defVal = options[0];
          }
          return { ...p, value: defVal };
        };
        if (shouldUpdateGlobalState) {
          setUserEditedScriptParameters(prev => {
            const params = prev[script.id] || script.parameters || [];
            const updatedParams = params.map(p => updateParamValueAndReset(updateParamMetadata(p)));
            return { ...prev, [script.id]: updatedParams };
          });
        }

        if (selectedScript?.id === script.id) {
          setSelectedScriptState(prev => {
            if (!prev) return null;
            const updatedParams = (prev.parameters || []).map(p => updateParamValueAndReset(updateParamMetadata(p)));
            return { ...prev, parameters: updatedParams };
          });
        }
        showNotification(isRangeUpdate ? "Range updated" : `Computed ${options.length} options`, "success");
      } else {
        showNotification(error_message || "Failed to compute options.", "error");
      }
      return response.data;
    } catch (err: any) {
      showNotification(err.message || "Failed to compute options.", "error");
      return { is_success: false };
    } finally {
      setIsComputingOptions(prev => ({ ...prev, [parameterName]: false }));
    }
  }, [userEditedScriptParameters, revitStatus, setUserEditedScriptParameters, showNotification, selectedScript, setScripts]);

  const pickObject = useCallback(async (script: Script, paramName: string, selectionType: string) => {
    setIsComputingOptions(prev => ({ ...prev, [paramName]: true }));
    try {
      const currentParams = userEditedScriptParameters[script.id] || script.parameters || [];
      const param = currentParams.find(p => p.name === paramName);
      const response = await api.post("/api/pick-object", { selection_type: selectionType, category_filter: param?.revitElementCategory });
      const { value, is_success } = response.data;

      if (is_success) {
        setUserEditedScriptParameters(prev => {
          const params = prev[script.id] || script.parameters || [];
          const updatedParams = params.map(p => p.name === paramName ? { ...p, value: value, computedInDocument: revitStatus?.document || "Unknown" } : p);
          return { ...prev, [script.id]: updatedParams };
        });
        if (selectedScriptRef.current?.id === script.id) {
          setSelectedScriptState(prev => prev ? { ...prev, parameters: (prev.parameters || []).map(p => p.name === paramName ? { ...p, value: value, computedInDocument: revitStatus?.document || "Unknown" } : p) } : null);
        }
        showNotification("Selection successful!", "success");
      }
      return response.data;
    } catch (err: any) {
      showNotification("Selection failed.", "error");
      return { is_success: false };
    } finally {
      setIsComputingOptions(prev => ({ ...prev, [paramName]: false }));
    }
  }, [userEditedScriptParameters, revitStatus, setUserEditedScriptParameters, showNotification]);

  const resetScriptParameters = useCallback(async (scriptId: string) => {
    delete userEditedParametersRef.current[scriptId];
    delete defaultDraftParametersRef.current[scriptId];
    setUserEditedScriptParameters(prev => { const next = { ...prev }; delete next[scriptId]; return next; });
    setDefaultDraftParameters(prev => { const next = { ...prev }; delete next[scriptId]; return next; });
    showNotification("Parameters reset to defaults.", "info");
    const scriptToReset = selectedScriptRef.current;
    if (scriptToReset && scriptToReset.id === scriptId) await setSelectedScript(scriptToReset, 'hard_reset');
  }, [setUserEditedScriptParameters, setDefaultDraftParameters, setSelectedScript, showNotification]);

  const runScript = async (script: Script, parameters?: ScriptParameter[], shouldUpdateGlobalState: boolean = true) => {
    if (runningScriptPath) { showNotification("A script is already running.", "warning"); return; }
    addRecentScript(script.id);
    updateScriptLastRunTime(script.id);
    setRunningScriptPath(script.id);
    if (shouldUpdateGlobalState) setExecutionResult(null);
    showNotification(`Running script: ${script.name}...`, "info");

    const finalParameters = parameters || userEditedParametersRef.current[script.id] || script.parameters || [];
    try {
      const response = await api.post("/run-script", { path: script.absolutePath, parameters: JSON.stringify(finalParameters), thread_id: threadId });
      const result = response.data;
      const frontendExecutionResult = { output: result.output || '', isSuccess: result.is_success, error: !result.is_success ? (result.error_message || null) : null, structuredOutput: result.structured_output, internalData: result.internal_data, timestamp: Date.now() };
      if (shouldUpdateGlobalState) setExecutionResult(frontendExecutionResult);
      showNotification(result.is_success ? `Executed successfully.` : "Execution failed", result.is_success ? "success" : "error");
      return frontendExecutionResult;
    } catch (error: any) {
      const msg = error.response?.data?.detail || error.message;
      showNotification(`Failed to execute: ${msg}`, "error");
      const errRes = { output: "", isSuccess: false, error: msg };
      if (shouldUpdateGlobalState) setExecutionResult(errRes);
      return errRes;
    } finally { setRunningScriptPath(null); }
  };

  const contextValue = useMemo(() => ({
    selectedScript, setSelectedScript, runningScriptPath, executionResult, setExecutionResult, runScript, clearExecutionResult, userEditedScriptParameters, updateUserEditedParameters, defaultDraftParameters, activePresets, setActivePreset, presets, addPreset, updatePreset, deletePreset, renamePreset, computeParameterOptions, pickObject, isComputingOptions, editScript, renameScript, resetScriptParameters, buildTool,
  }), [selectedScript, setSelectedScript, runningScriptPath, executionResult, setExecutionResult, runScript, clearExecutionResult, userEditedScriptParameters, updateUserEditedParameters, defaultDraftParameters, activePresets, setActivePreset, presets, addPreset, updatePreset, deletePreset, renamePreset, computeParameterOptions, pickObject, isComputingOptions, editScript, renameScript, resetScriptParameters, buildTool]);

  return <ScriptExecutionContext.Provider value={contextValue}>{children}</ScriptExecutionContext.Provider>;
};
