import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { ScriptExecutionContext } from './ScriptExecutionContext';
import type { Script, ScriptParameter, RawScriptParameterData } from '@/types/scriptModel';
import type { ExecutionResult, ParameterPreset } from '@/types/common';
import { useNotifications } from '@/hooks/useNotifications';
import { useScripts } from '@/hooks/useScripts';
import { useAuth } from '@/hooks/useAuth';
import { useUI } from '@/hooks/useUI';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import api from '@/api/axios';
import { getFolderNameFromPath } from '@/utils/pathHelpers';
import { Workspace } from '@/types';
import useLocalStorage from '@/hooks/useLocalStorage';


// Helper function for robust value comparison
const areValuesEqual = (val1: any, val2: any, type?: string): boolean => {
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
    const toArr = (v: any) => {
      if (Array.isArray(v)) return v;
      if (typeof v === 'string') {
        const trimmed = v.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          try {
            return JSON.parse(trimmed);
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
  if (params1 === params2) return true; // Reference equality
  if (params1.length !== params2.length) return false;
  const EPSILON = 0.000001;

  const sortedParams1 = [...params1].sort((a, b) => a.name.localeCompare(b.name));
  const sortedParams2 = [...params2].sort((a, b) => a.name.localeCompare(b.name));

  for (let i = 0; i < sortedParams1.length; i++) {
    const p1 = sortedParams1[i];
    const p2 = sortedParams2[i];

    if (p1.name !== p2.name || p1.type !== p2.type) return false;

    // Check options equality
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
  const { setScripts, addRecentScript, fetchScriptMetadata, setCombinedScriptContent, updateScriptLastRunTime, reloadScript } = useScripts();
  const { scripts: allScriptsFromScriptProvider, teamWorkspaces, selectedFolder } = useScripts(); // Get all scripts and teamWorkspaces from ScriptProvider
  const { isAuthenticated, activeTeam } = useAuth();
  const { activeScriptSource, setAgentSelectedScriptPath, messages, setActiveMainView, setActiveInspectorTab, threadId } = useUI();

  const currentTeamWorkspaces = activeTeam ? (teamWorkspaces[activeTeam.team_id] || []) : [];

  const [selectedScript, setSelectedScriptState] = useState<Script | null>(null);
  const selectedScriptRef = useRef<Script | null>(null);
  const lastExplicitParameterFetchTimeRef = useRef<number>(0);

  // Keep ref in sync
  useEffect(() => {
    selectedScriptRef.current = selectedScript;
  }, [selectedScript]);

  // Persistence for user-edited parameters across sessions
  const [userEditedScriptParameters, setUserEditedScriptParameters] = useLocalStorage<Record<string, ScriptParameter[]>>('rap_userEditedScriptParameters', {});
  const userEditedParametersRef = useRef(userEditedScriptParameters);

  // Keep ref in sync
  useEffect(() => {
    userEditedParametersRef.current = userEditedScriptParameters;
  }, [userEditedScriptParameters]);

  // Track which preset is selected for each script
  const [activePresets, setActivePresets] = useLocalStorage<Record<string, string>>('rap_activePresets', {});

  // Isolated storage for the user's manual "draft" edits in the "<Default Parameters>" mode.
  // This prevents edits in titled presets from polluting the base defaults.
  const [defaultDraftParameters, setDefaultDraftParameters] = useLocalStorage<Record<string, ScriptParameter[]>>('rap_defaultDraftParameters', {});
  const defaultDraftParametersRef = useRef(defaultDraftParameters);

  useEffect(() => {
    defaultDraftParametersRef.current = defaultDraftParameters;
  }, [defaultDraftParameters]);

  const [runningScriptPath, setRunningScriptPath] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [presets, setPresets] = useState<ParameterPreset[]>([]);
  const [isComputingOptions, setIsComputingOptions] = useState<Record<string, boolean>>({});

  const lastProcessedToolMessageIdRef = useRef<string | null>(null);

  const clearExecutionResult = useCallback(() => {
    setExecutionResult(null);
  }, []);

  const updateUserEditedParameters = useCallback((scriptId: string, parameters: ScriptParameter[], isPresetLoad: boolean = false) => {
    setUserEditedScriptParameters(prev => ({
      ...prev,
      [scriptId]: parameters,
    }));

    // If we are in "<Default Parameters>" mode AND this is NOT a preset load, update the draft cache.
    // This prevents values from a just-loaded preset from leaking into the "Default" draft 
    // before the activePreset state has finished updating.
    if (!isPresetLoad) {
      const currentPreset = activePresets[scriptId] || "<Default Parameters>";
      if (currentPreset === "<Default Parameters>") {
        setDefaultDraftParameters(prev => ({
          ...prev,
          [scriptId]: parameters,
        }));
      }
    }

    // If the currently selected script's parameters were updated, sync the state
    if (selectedScriptRef.current?.id === scriptId) {
      setSelectedScriptState(prev => prev ? { ...prev, parameters } : null);
    }

    // CRITICAL: Update the global scripts list in ScriptProvider so background reloads preserve these values
    setScripts(prev => prev.map(s => {
      if (s.id !== scriptId) return s;
      return { ...s, parameters };
    }));
  }, [setUserEditedScriptParameters, setActivePresets, setDefaultDraftParameters, activePresets, setScripts]);

  // --- Source Change Detection ---

  // Effect to clear selected script when the script source (folder, workspace) changes.
  // This ensures the inspector is cleared when the gallery content changes.
  const lastSourceRef = useRef<{ type?: string; id?: string; path?: string } | null>(null);

  useEffect(() => {
    // Determine if the source has actually changed since the last effect run
    // Cast to any to safely compare properties across different union types
    const current = activeScriptSource as any;
    const previous = lastSourceRef.current as any;

    const hasSourceChanged = previous && (
      previous.type !== current?.type ||
      previous.id !== current?.id ||
      previous.path !== current?.path
    );

    if (hasSourceChanged) {
      console.log("[ScriptExecutionProvider] Script source changed. Clearing inspector selection.");
      setSelectedScriptState(null);
      setCombinedScriptContent(null);
      setExecutionResult(null);
    }

    lastSourceRef.current = activeScriptSource ? { ...activeScriptSource } : null;
  }, [activeScriptSource, setCombinedScriptContent]);

  // Effect to clear selection on team switch
  useEffect(() => {
    if (activeTeam?.team_id) {
      console.log("[ScriptExecutionProvider] Team changed. Clearing inspector selection.");
      setSelectedScriptState(null);
      setCombinedScriptContent(null);
      setExecutionResult(null);
    }
  }, [activeTeam?.team_id, setCombinedScriptContent]);

  const { user, cloudToken } = useAuth();
  const { revitStatus, ParacoreConnected } = useRevitStatus();

  const editScript = useCallback(async (script: Script) => {
    if (!script || !user || !ParacoreConnected) return;

    try {
      const response = await fetch("http://localhost:8000/api/edit-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cloudToken}`
        },
        body: JSON.stringify({ scriptPath: script.absolutePath, type: script.type }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      await response.json();
      showNotification(`Opening ${script.name} in VSCode...`, "success");
    } catch (error) {
      console.error("Failed to open script for editing:", error);
      showNotification("Failed to open script in VSCode.", "error");
    }
  }, [user, cloudToken, ParacoreConnected, showNotification]);

  const setActivePreset = useCallback((scriptId: string, presetName: string) => {
    setActivePresets(prev => ({
      ...prev,
      [scriptId]: presetName
    }));
  }, [setActivePresets]);

  const fetchScriptContent = useCallback(async (script: Script) => {
    if (!script.sourcePath) {
      setCombinedScriptContent('// No source path available for this script type.');
      return null;
    }
    try {
      const response = await api.get(`/api/script-content?scriptPath=${encodeURIComponent(script.sourcePath)}&type=${script.type}`);
      return response.data.sourceCode;
    } catch (_) {
      return null;
    }
  }, [setCombinedScriptContent]);

  const savePresets = async (newPresets: ParameterPreset[]) => {
    if (selectedScript && selectedScript.absolutePath) {
      try {
        await api.post("/api/presets", { scriptPath: selectedScript.absolutePath, presets: newPresets });
        showNotification("Presets saved successfully.", "success");
      } catch (error) {
        showNotification("Failed to save presets.", "error");
      }
    }
  };

  const addPreset = (preset: ParameterPreset) => {
    if (presets.some((p) => p.name === preset.name)) {
      showNotification("A preset with this name already exists.", "warning");
      return { success: false, message: "A preset with this name already exists." };
    }

    const existingPresetWithSameValues = presets.find((p) => areParametersEqual(p.parameters, preset.parameters));
    if (existingPresetWithSameValues) {
      showNotification(`A preset with identical parameter values already exists: ${existingPresetWithSameValues.name}`, "warning");
      return { success: false, message: `A preset with identical parameter values already exists: ${existingPresetWithSameValues.name}` };
    }

    const newPresets = [...presets, preset];
    setPresets(newPresets);
    savePresets(newPresets);
    return { success: true, message: "Preset saved." };
  };

  const updatePreset = (name: string, preset: ParameterPreset) => {
    // Check for name uniqueness if the name is being changed
    if (name !== preset.name && presets.some((p) => p.name === preset.name)) {
      showNotification("A preset with this name already exists.", "warning");
      return { success: false, message: "A preset with this name already exists." };
    }

    // Check for parameter value uniqueness against other presets
    const existingPresetWithSameValues = presets.find(
      (p) => p.name !== name && areParametersEqual(p.parameters, preset.parameters)
    );
    if (existingPresetWithSameValues) {
      showNotification(`A preset with identical parameter values already exists: ${existingPresetWithSameValues.name}`, "warning");
      return { success: false, message: `A preset with identical parameter values already exists: ${existingPresetWithSameValues.name}` };
    }

    const newPresets = presets.map((p) => (p.name === name ? preset : p));
    setPresets(newPresets);
    savePresets(newPresets);
    return { success: true, message: "Preset updated." };
  };

  const deletePreset = (name: string) => {
    const newPresets = presets.filter((p) => p.name !== name);
    setPresets(newPresets);
    savePresets(newPresets);
    return { success: true, message: "Preset deleted successfully!" };
  };

  const renamePreset = (oldName: string, newName: string) => {
    if (oldName === newName) {
      return { success: false, message: "Preset name is the same. No rename performed." };
    }
    if (presets.some((p) => p.name === newName && p.name !== oldName)) {
      showNotification("A preset with this name already exists.", "warning");
      return { success: false, message: "A preset with this name already exists." };
    }
    const newPresets = presets.map((p) => (p.name === oldName ? { ...p, name: newName } : p));
    setPresets(newPresets);
    savePresets(newPresets);
    return { success: true, message: "Preset renamed." };
  };

  const setSelectedScript = useCallback(async (script: Script | null, source: 'user' | 'agent' | 'agent_executed_full_output' | 'refresh' | 'hard_reset' = 'user') => {
    if (!script) {
      setSelectedScriptState(null);
      setCombinedScriptContent(null);
      setPresets([]);
      setAgentSelectedScriptPath(null);
      return;
    }

    const currentSelected = selectedScriptRef.current;
    if (source !== 'refresh' && script.id === currentSelected?.id) {
      if (source === 'agent') {
        setAgentSelectedScriptPath(script.absolutePath);
      }
      return;
    }

    if (source === 'agent') {
      // If the agent is setting the script, we already have the full script object
      // and its metadata. We just need to fetch parameters and content.
      setSelectedScriptState(script);
      setAgentSelectedScriptPath(script.absolutePath); // Set agent selected path
      setCombinedScriptContent("// Loading script content...");
      setPresets([]);
      setExecutionResult(null);

      try {
        const promises = [];
        promises.push(
          api.post("/api/get-script-parameters", { scriptPath: script.absolutePath, type: script.type })
            .then(response => response.data)
            .catch(err => ({ error: `Failed to fetch parameters: ${err.message}` }))
        );
        promises.push(fetchScriptContent(script));

        const [paramsResult, contentResult] = await Promise.all(promises);

        let finalParameters: ScriptParameter[] = [];
        if (paramsResult.error) {
          showNotification(paramsResult.error, "error");
        } else if (paramsResult.parameters) {
          finalParameters = paramsResult.parameters.map((p: RawScriptParameterData) => {
            let value: string | number | boolean = p.defaultValueJson;
            try {
              value = JSON.parse(p.defaultValueJson);
            } catch { /* Ignore if not JSON */ }
            if (p.type === 'number' && typeof value === 'string') value = parseFloat(value) || 0;
            else if (p.type === 'boolean' && typeof value === 'string') value = value.toLowerCase() === 'true';

            const newParamObject: ScriptParameter = {
              ...p,
              type: p.type as ScriptParameter['type'],
              value: value,
              defaultValue: value
            };
            return newParamObject;
          });
        }
        const updatedScript = { ...script, parameters: finalParameters };
        updateUserEditedParameters(script.id, finalParameters);
        setCombinedScriptContent(contentResult || "// Failed to load script content.");
        setScripts((prev: Script[]) => prev.map((s: Script) => s.id === updatedScript.id ? updatedScript : s));
        lastExplicitParameterFetchTimeRef.current = Date.now();
        setSelectedScriptState(updatedScript);

      } catch (err) {
        console.error("[RAP] Critical error in setSelectedScript (agent source):", err);
        showNotification("An unexpected error occurred while loading the script.", "error");
        setSelectedScriptState(script);
        setCombinedScriptContent("// Error loading script. Please try again.");
      }
      return;
    }

    if (source === 'agent_executed_full_output') {
      lastExplicitParameterFetchTimeRef.current = Date.now();
      setSelectedScriptState(script);
      setAgentSelectedScriptPath(script.absolutePath); // Set agent selected path
      setCombinedScriptContent("// Loading script content...");
      setPresets([]);
      // Do not clear executionResult here, it will be set by the useEffect
      // We still need to fetch content for the code viewer
      fetchScriptContent(script).then(content => {
        setCombinedScriptContent(content || "// Failed to load script content.");
      });
      fetchScriptMetadata(script.id); // Fire and forget metadata update
      return;
    }

    // Original logic for user selection
    setAgentSelectedScriptPath(null); // Clear agent selected path for user interaction

    // --- NEW LOGIC: Check for cached parameters first (skip on refresh or hard_reset) ---
    const cachedParameters = (source !== 'refresh' && source !== 'hard_reset') ? userEditedParametersRef.current[script.id] : null;
    const hasCachedParameters = cachedParameters && cachedParameters.length > 0;

    if (hasCachedParameters) {
      const updatedScript = { ...script, parameters: cachedParameters };
      lastExplicitParameterFetchTimeRef.current = Date.now();
      setSelectedScriptState(updatedScript);
      // Still fetch content in the background
      fetchScriptContent(updatedScript).then(content => {
        setCombinedScriptContent(content || "// Failed to load script content.");
      });
      fetchScriptMetadata(script.id); // Fire and forget metadata update
      return; // Exit early, we are using the cached parameters
    }

    // If no cached params, proceed with fetching (unless it's a refresh sync that already has params)
    const canReusePassedParameters = source === 'refresh' && (script.parameters && script.parameters.length > 0);

    setCombinedScriptContent("// Loading script content...");
    setPresets([]);

    try {
      const promises = [];

      // --- Parameters Promise (only runs if not cached AND not reusable) ---
      if (!canReusePassedParameters) {
        promises.push(
          api.post("/api/get-script-parameters", { scriptPath: script.absolutePath, type: script.type })
            .then(response => response.data)
            .catch(err => ({ error: `Failed to fetch parameters: ${err.message}` }))
        );
      } else {
        // Reuse passed parameters
        promises.push(Promise.resolve({ parameters: script.parameters }));
      }

      // --- Content Promise ---
      promises.push(fetchScriptContent(script));

      // --- Metadata Promise (fire and forget, doesn't block) ---
      fetchScriptMetadata(script.id);

      const [paramsResult, contentResult] = await Promise.all(promises);

      let finalParameters: ScriptParameter[] = [];
      if (paramsResult.error) {
        showNotification(paramsResult.error, "error");
      } else if (paramsResult.parameters) {
        // If we reused passed parameters, they are already processed.
        // If we fetched from API, we need to map them.
        if (canReusePassedParameters) {
          console.log(`[ScriptExecutionProvider] Smart Merging parameters for ${script.name}`);
          const currentParams = userEditedParametersRef.current[script.id] || [];

          finalParameters = (paramsResult.parameters as ScriptParameter[]).map(newParam => {
            const existingParam = currentParams.find(p => p.name === newParam.name);

            if (existingParam) {
              // SMART MERGE LOGIC:
              // If the user's current value in the UI matches the OLD default, 
              // then we assume they haven't "intended" to override it forever,
              // and we update it to the NEW default from the code.
              // If the value is different (dirty), we keep the user's value.

              // SANITIZATION (Fix for dirty cache/ghost values):
              // If new param is MultiSelect, but existing value is a raw string (e.g. "Back Room 2") 
              // and NOT a valid JSON array, we MUST discard it.
              let isValidCache = true;
              if (newParam.multiSelect && typeof existingParam.value === 'string') {
                const trimmed = existingParam.value.trim();
                if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) {
                  isValidCache = false;
                  console.warn(`[ScriptExecutionProvider] Discarding invalid scalar cache for MultiSelect param ${newParam.name}:`, existingParam.value);
                }
              }

              const isValueAtOldDefault = areValuesEqual(existingParam.value, existingParam.defaultValue, existingParam.type);

              if (isValueAtOldDefault || !isValidCache) {
                // User hasn't touched it (it's at default), OR cache is invalid -> sync to new default
                return {
                  ...newParam,
                  value: newParam.defaultValue // Use the new default as the current value
                };
              } else {
                // User has explicitly overridden this value, preserve it.
                // But update metadata (min/max/options) from the new param.
                return {
                  ...newParam,
                  value: existingParam.value,
                  unit: newParam.unit,
                  selectionType: newParam.selectionType
                };
              }
            }

            // New parameter added to script
            return newParam;
          });
        } else {
          console.log(`[ScriptExecutionProvider] Mapping fresh parameters for ${script.name} from API.`);
          finalParameters = (paramsResult.parameters as RawScriptParameterData[]).map((p: RawScriptParameterData) => {
            let value: string | number | boolean = p.defaultValueJson;
            try {
              value = JSON.parse(p.defaultValueJson);
            } catch { /* Ignore if not JSON */ }
            if (p.type === 'number' && typeof value === 'string') value = parseFloat(value) || 0;
            else if (p.type === 'boolean' && typeof value === 'string') value = value.toLowerCase() === 'true';

            const newParamObject: ScriptParameter = {
              ...p,
              type: p.type as ScriptParameter['type'],
              value: value,
              defaultValue: value,
              unit: p.unit,
              selectionType: p.selectionType
            };
            return newParamObject;
          });
        }
      }

      const updatedScript = { ...script, parameters: finalParameters };

      // --- NEW LOGIC: Store the newly fetched parameters in our cache ---
      updateUserEditedParameters(script.id, finalParameters);

      // Final state updates
      setCombinedScriptContent(contentResult || "// Failed to load script content.");
      setScripts((prev: Script[]) => prev.map((s: Script) => s.id === updatedScript.id ? updatedScript : s));
      setSelectedScriptState(updatedScript);

    } catch (err) {
      console.error("[RAP] Critical error in setSelectedScript:", err);
      showNotification("An unexpected error occurred while loading the script.", "error");
      // Reset to a stable state
      setSelectedScriptState(script); // Keep the initial script selected
      setCombinedScriptContent("// Error loading script. Please try again.");
    }
  }, [fetchScriptContent, fetchScriptMetadata, setCombinedScriptContent, setScripts, showNotification, setAgentSelectedScriptPath, updateUserEditedParameters]); // userEditedScriptParameters REMOVED FROM DEPS

  // Effect to keep selectedScript in sync with allScriptsFromScriptProvider
  const lastSyncedProviderScriptRef = useRef<Script | null>(null);

  useEffect(() => {
    if (selectedScript) {
      const updatedScriptFromProvider = allScriptsFromScriptProvider.find(s => {
        const normalizedSid = s.id.replace(/\\/g, '/');
        const normalizedTargetId = selectedScript.id.replace(/\\/g, '/');
        return normalizedSid === normalizedTargetId;
      });

      if (!updatedScriptFromProvider) {
        if (selectedFolder && selectedScript.absolutePath?.replace(/\\/g, '/').startsWith(selectedFolder.replace(/\\/g, '/'))) {
          console.log(`[ScriptExecutionProvider] Selected script ${selectedScript.name} is missing from ${selectedFolder}. Clearing inspector.`);
          setSelectedScriptState(null);
          setCombinedScriptContent(null);
          setExecutionResult(null);
        }
        return;
      }

      // REFERENCE GUARD: Sync only if provider data changed
      const lastSynced = lastSyncedProviderScriptRef.current;

      // CRITICAL RACE CONDITION GUARD:
      // If we just explicitly fetched parameters (user selection or agent),
      // block background sync for 2 seconds to allow state to stabilize.
      const timeSinceFetch = Date.now() - lastExplicitParameterFetchTimeRef.current;
      if (timeSinceFetch < 2000) {
        return;
      }

      const isProviderDataNew = !lastSynced ||
        lastSynced !== updatedScriptFromProvider && (
          lastSynced.id !== updatedScriptFromProvider.id ||
          lastSynced.metadata?.dateModified !== updatedScriptFromProvider.metadata?.dateModified ||
          lastSynced.isFavorite !== updatedScriptFromProvider.isFavorite
        );

      if (!isProviderDataNew) {
        return;
      }

      lastSyncedProviderScriptRef.current = updatedScriptFromProvider;

      const hasContentChanged = updatedScriptFromProvider.metadata?.dateModified !== selectedScript.metadata?.dateModified;

      if (hasContentChanged) {
        console.log(`[ScriptExecutionProvider] Source code change detected for ${updatedScriptFromProvider.name}. Refreshing.`);
        setSelectedScript(updatedScriptFromProvider, 'refresh');
        return;
      }

      // Sync metadata/state without full reload (content unchanged)

      // 1. Update SelectedScript State (Preserving Parameters if provider is stale)
      let scriptToSet = updatedScriptFromProvider;
      const isProviderMissingParams = !updatedScriptFromProvider.parameters || updatedScriptFromProvider.parameters.length === 0;
      const weHaveParams = selectedScript.parameters && selectedScript.parameters.length > 0;
      const hasContentActuallyChanged = updatedScriptFromProvider.metadata?.dateModified !== selectedScript.metadata?.dateModified;

      if (isProviderMissingParams && weHaveParams && !hasContentActuallyChanged) {
        // Provider data is newer in terms of reference, but missing params that we just loaded.
        // And the code hasn't changed, so it's just a stale provider state.
        scriptToSet = { ...updatedScriptFromProvider, parameters: selectedScript.parameters };
      }
      setSelectedScriptState(scriptToSet);

      // 2. Sync User Edited Parameters Cache (Schema updates)
      setUserEditedScriptParameters(prev => {
        const currentEdits = prev[selectedScript.id];
        if (!currentEdits) return prev;

        const mergedParameters = (updatedScriptFromProvider.parameters || []).map(newParam => {
          const existingEdit = currentEdits.find(e => e.name === newParam.name);
          return existingEdit ? { ...newParam, value: existingEdit.value } : newParam;
        });

        return { ...prev, [selectedScript.id]: mergedParameters };
      });
    }
  }, [allScriptsFromScriptProvider, selectedScript, setSelectedScript, selectedFolder, setUserEditedScriptParameters]);

  // Effect to restore "Live Parameter Sync" on window focus
  const lastFocusTimeRef = useRef(0);

  useEffect(() => {
    const handleFocus = () => {
      const now = Date.now();
      // Safety Guard: Don't reload if we just did a reload less than 1s ago.
      // This prevents "Focus Flutter" loops.
      if (now - lastFocusTimeRef.current < 1000) {
        return;
      }

      if (selectedScript) {
        // console.debug(`[ScriptExecutionProvider] Focus detected. Reloading ${selectedScript.name}`);
        lastFocusTimeRef.current = now;
        reloadScript(selectedScript, { silent: true });
      }
    };

    window.addEventListener('focus', handleFocus);

    // Background polling for live sync (especially for 2nd monitor use cases)
    const pollInterval = setInterval(() => {
      if (selectedScript && document.visibilityState === 'visible') {
        // Only poll if tab is visible, but doesn't necessarily need focus
        // Polling is already slow (3s), so we don't need the same guard here.
        reloadScript(selectedScript, { silent: true });
      }
    }, 5000); // Increased polling to 5s for better stability

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(pollInterval);
    };
  }, [selectedScript, reloadScript]);



  const notifiedParamsScriptIdRef = useRef<string | null>(null);
  const notifiedPresetsScriptIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedScript) {
      notifiedParamsScriptIdRef.current = null;
      notifiedPresetsScriptIdRef.current = null;
    }
  }, [selectedScript]);

  useEffect(() => {
    if (selectedScript && selectedScript.parameters && selectedScript.parameters.length > 0) {
      if (notifiedParamsScriptIdRef.current !== selectedScript.id) {
        showNotification(`Loaded ${selectedScript.parameters.length} parameters for ${selectedScript.name}.`, "success");
        notifiedParamsScriptIdRef.current = selectedScript.id;
      }
    }
  }, [selectedScript, showNotification]);

  useEffect(() => {
    const fetchPresets = async () => {
      if (!selectedScript || !selectedScript.absolutePath) {
        setPresets([]);
        return;
      }

      // CRITICAL: Check and set immediately to prevent async re-entry
      if (notifiedPresetsScriptIdRef.current === selectedScript.id) {
        return;
      }
      notifiedPresetsScriptIdRef.current = selectedScript.id;

      try {
        const response = await api.get(`/api/presets?scriptPath=${encodeURIComponent(selectedScript.absolutePath)}`);
        const data = response.data;

        if (data.error) throw new Error(data.error);
        if (!Array.isArray(data)) throw new Error("Invalid data format");

        const initializedPresets = data.map((preset: ParameterPreset) => ({
          ...preset,
          parameters: Array.isArray(preset.parameters) ? preset.parameters.map(p => {
            let processedValue: string | number | boolean = (p.value ?? p.defaultValue) ?? "";
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

        // Double check script ID hasn't changed during the await
        if (selectedScriptRef.current?.id === selectedScript.id && initializedPresets.length > 0) {
          showNotification(`Loaded ${initializedPresets.length} presets for ${selectedScript.name}.`, "success");
        }
      } catch (_) {
        console.error("[Presets] Failed to fetch:", _);
        setPresets([]);
        // Do not reset the ref here, so we don't keep trying and failing/spamming
      }
    };

    if (isAuthenticated) {
      fetchPresets();
    }
  }, [selectedScript, showNotification, isAuthenticated]);

  // Clear selected script when user logs out
  useEffect(() => {
    if (!isAuthenticated && selectedScript) {
      console.log("[ScriptExecutionProvider] User logged out, clearing selected script");
      setSelectedScriptState(null);
      setAgentSelectedScriptPath(null);
    }
  }, [isAuthenticated, selectedScript, setAgentSelectedScriptPath]);

  const runScript = async (script: Script, parameters?: ScriptParameter[]) => {
    if (runningScriptPath) {
      showNotification("A script is already running. Please wait.", "warning");
      return;
    }

    addRecentScript(script.id);
    updateScriptLastRunTime(script.id);
    setRunningScriptPath(script.id);
    setExecutionResult(null);
    showNotification(`Running script: ${script.name}...`, "info");

    let sourceFolder: string | undefined;
    let sourceWorkspace: string | undefined;

    if (activeScriptSource?.type === 'local') {
      sourceFolder = getFolderNameFromPath(activeScriptSource.path);
    } else if (activeScriptSource?.type === 'workspace') {
      const workspace = currentTeamWorkspaces.find((ws: Workspace) => ws.id === Number(activeScriptSource.id));
      if (workspace) {
        sourceWorkspace = `${workspace.name}${workspace.isOrphaned ? ' (orphaned)' : ''}:${workspace.repo_url}`;
        // If we are in a workspace, we might want to hint the backend about the root path
        // but currently the backend resolves from the DB or file system.
      }
    }

    // DEBUG: Ensure parameters are what we expect
    console.log(`[ScriptExecutionProvider] Running ${script.name} with params:`, parameters);

    const body = {
      path: script.absolutePath || "",
      type: script.type,
      parameters: parameters ? JSON.stringify(parameters) : undefined,
      source_folder: sourceFolder, // New field
      source_workspace: sourceWorkspace, // New field
      thread_id: threadId, // Add thread_id for working set injection
    };

    try {
      const response = await api.post("/run-script", body);
      const result = response.data;

      // --- AGENT-DEBUG: Log the received summary ---
      console.log("[ScriptExecutionProvider] Received result from /run-script:", result);
      // --- END-AGENT-DEBUG ---

      const frontendExecutionResult: ExecutionResult = {
        output: result.output || '',
        isSuccess: result.is_success,
        error: !result.is_success ? (result.error_message || (result.error_details && result.error_details.join('\n')) || null) : null,
        structuredOutput: result.structured_output,
        internalData: result.internal_data, // Add the new internal data field
      };
      setExecutionResult(frontendExecutionResult);

      if (!frontendExecutionResult.isSuccess) {
        showNotification("Code execution failed", "error");
      } else {
        showNotification(`Script '${script.name}' executed successfully.`, "success");
      }
    } catch (err: any) {
      // Check for Axios error response
      let message = err.response?.data?.detail || (err instanceof Error ? err.message : "An unknown error occurred.");

      // If detail is an object (common in FastAPI validation errors), stringify it or extract message
      if (typeof message === 'object') {
        message = JSON.stringify(message);
      }

      if (err.response?.status === 404) {
        message = `Script not found. It may have been deleted or moved. Try refreshing the gallery. (${message})`;
      }

      showNotification(`Failed to execute script: ${message}`, "error");
      setExecutionResult({ output: "", isSuccess: false, error: message });
    } finally {
      setRunningScriptPath(null);
    }
  };

  const computeParameterOptions = useCallback(async (script: Script, parameterName: string) => {
    setIsComputingOptions(prev => ({ ...prev, [parameterName]: true }));
    try {
      const response = await api.post("/api/compute-parameter-options", {
        scriptPath: script.absolutePath,
        type: script.type,
        parameterName: parameterName
      });

      const { options, is_success, error_message, min, max, step } = response.data;

      if (is_success) {

        // --- NEW LOGIC: Handle Range vs Options ---
        // Fix: Backend returns null, which is !== undefined. Must check type or null explicitly.
        const isRangeUpdate = (typeof min === 'number') || (typeof max === 'number');

        // CRITICAL: Treat compute as an explicit fetch to block background sync for 2s
        lastExplicitParameterFetchTimeRef.current = Date.now();

        if (isRangeUpdate) {
          const fmt = (n: any) => typeof n === 'number' ? n.toFixed(2) : n;
          showNotification(`Range updated: ${fmt(min)} to ${fmt(max)} (Step: ${fmt(step)})`, "success");
        } else {
          showNotification(`Computed ${options.length} options for ${parameterName}`, "success");
        }

        const updateParamWithOptions = (p: ScriptParameter) => {
          if (p.name !== parameterName) return p;

          let newValue = p.value;

          // Case 1: Range Update
          if (isRangeUpdate) {
            return {
              ...p,
              min: min ?? p.min,
              max: max ?? p.max,
              step: step ?? p.step
            };
          }

          // Case 2: List Options Update (including empty lists)
          if (!isRangeUpdate) {
            let nextValue = p.value;
            // If the new list is empty, or the current value isn't in the new list, reset value.
            // Exception: If the current value is empty/null, keep it empty.
            if (options.length === 0) {
              nextValue = "";
            } else {

              // Fix: For MultiSelect, do NOT auto-select the first option.
              // Users should explicitly select items.
              if (p.multiSelect) {
                // Keep current value if valid? Or just keep it as is.
                // If options changed, maybe current selection is invalid?
                // For now, let's just NOT force a value.
                nextValue = p.value || []; // Ensure array
              } else {
                // Single Select: Auto-select first option if current is invalid/empty
                const currentValueStr = String(p.value || "");
                if (!currentValueStr || !options.includes(currentValueStr)) {
                  nextValue = options[0];
                }
              }
            }

            return { ...p, options: options, value: nextValue };
          }

          return { ...p, options: options, value: newValue };
        };

        // Update the parameter with the new options AND potentially new value
        setUserEditedScriptParameters(prev => {
          // IMPORTANT: If we don't have cached parameters yet, we must start from the script's defaults
          const params = prev[script.id] || script.parameters || [];

          const updatedParams = params.map(updateParamWithOptions);

          return {
            ...prev,
            [script.id]: updatedParams
          };
        });

        // Also update selectedScript if it's the same script
        if (selectedScript?.id === script.id) {
          setSelectedScriptState(prev => {
            if (!prev) return null;
            const updatedParams = (prev.parameters || []).map(updateParamWithOptions);
            return { ...prev, parameters: updatedParams };
          });
        }

        // CRITICAL: Update the global scripts list in ScriptProvider so background reloads preserve these options
        setScripts(prev => prev.map(s => {
          if (s.id !== script.id) return s;
          const updatedParams = (s.parameters || []).map(updateParamWithOptions);
          return { ...s, parameters: updatedParams };
        }));
      } else {
        showNotification(error_message || "Failed to compute options.", "error");
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        showNotification(err.message || "Failed to compute options.", "error");
      } else {
        showNotification("Failed to compute options.", "error");
      }
    } finally {
      setIsComputingOptions(prev => ({ ...prev, [parameterName]: false }));
    }
  }, [selectedScript, showNotification, setUserEditedScriptParameters, setScripts]);

  const pickObject = useCallback(async (script: Script, paramName: string, selectionType: string) => {
    setIsComputingOptions(prev => ({ ...prev, [paramName]: true })); // Use computing state for spinner
    try {
      // Find the parameter to get potential filters
      const currentParams = userEditedScriptParameters[script.id] || script.parameters || [];
      const param = currentParams.find(p => p.name === paramName);
      const categoryFilter = param?.revitElementCategory;

      showNotification(`Please select a ${selectionType} in Revit...`, "info");
      const response = await api.post("/api/pick-object", {
        selection_type: selectionType,
        category_filter: categoryFilter
      });

      const { value, is_success, cancelled, error_message } = response.data;

      if (is_success) {
        showNotification("Selection successful!", "success");
        // Update parameter value
        setUserEditedScriptParameters(prev => {
          const params = prev[script.id] || script.parameters || [];
          const updatedParams = params.map(p => {
            if (p.name === paramName) {
              return { ...p, value: value };
            }
            return p;
          });
          return { ...prev, [script.id]: updatedParams };
        });

        // Sync selected script state
        if (selectedScriptRef.current?.id === script.id) {
          setSelectedScriptState(prev => {
            if (!prev) return null;
            const updatedParams = (prev.parameters || []).map(p =>
              p.name === paramName ? { ...p, value: value } : p
            );
            return { ...prev, parameters: updatedParams };
          });
        }

      } else if (cancelled) {
        showNotification("Selection cancelled.", "info");
      } else {
        showNotification(error_message || "Selection failed.", "error");
      }
    } catch (err: any) {
      showNotification(err.message || "Failed to pick object.", "error");
    } finally {
      setIsComputingOptions(prev => ({ ...prev, [paramName]: false }));
    }
  }, [showNotification, setUserEditedScriptParameters]);

  const contextValue = useMemo(() => ({
    selectedScript,
    setSelectedScript,
    runningScriptPath,
    executionResult,
    setExecutionResult, // Expose the setter
    runScript,
    clearExecutionResult,
    userEditedScriptParameters,
    updateUserEditedParameters,
    defaultDraftParameters,
    activePresets,
    setActivePreset,
    presets,
    addPreset,
    updatePreset,
    deletePreset,
    renamePreset,
    computeParameterOptions,
    pickObject, // Add pickObject
    isComputingOptions,
    editScript,
  }), [
    selectedScript,
    setSelectedScript,
    runningScriptPath,
    executionResult,
    setExecutionResult,
    runScript,
    clearExecutionResult,
    userEditedScriptParameters,
    updateUserEditedParameters,
    defaultDraftParameters,
    activePresets,
    setActivePreset,
    presets,
    addPreset,
    updatePreset,
    deletePreset,
    renamePreset,
    computeParameterOptions,
    pickObject, // Add pickObject
    isComputingOptions,
    editScript,
  ]);

  return (
    <ScriptExecutionContext.Provider value={contextValue}>
      {children}
    </ScriptExecutionContext.Provider>
  );
};
