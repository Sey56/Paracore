import { useState, useEffect, useCallback, useRef } from 'react';
import { ScriptExecutionContext } from './ScriptExecutionContext';
import type { Script, ScriptParameter, RawScriptParameterData } from '@/types/scriptModel';
import type { ExecutionResult, ParameterPreset } from '@/types/common';
import { useNotifications } from '@/hooks/useNotifications';
import { useScripts } from '@/hooks/useScripts';
import { useAuth } from '@/hooks/useAuth';
import { useUI } from '@/hooks/useUI';
import api from '@/api/axios';
import { getFolderNameFromPath } from '@/utils/pathHelpers';
import { Workspace } from '@/types';



// Helper function for deep comparison of parameters
const areParametersEqual = (params1: ScriptParameter[], params2: ScriptParameter[]): boolean => {
  if (params1.length !== params2.length) return false;
  const EPSILON = 0.000001; // Small tolerance for floating-point comparison

  // Sort parameters by name to ensure consistent comparison regardless of order
  const sortedParams1 = [...params1].sort((a, b) => a.name.localeCompare(b.name));
  const sortedParams2 = [...params2].sort((a, b) => a.name.localeCompare(b.name));

  for (let i = 0; i < sortedParams1.length; i++) {
    const p1 = sortedParams1[i];
    const p2 = sortedParams2[i];

    if (p1.name !== p2.name || p1.type !== p2.type) {
      return false;
    }

    // Normalize null and undefined to a consistent value (e.g., null) for comparison
    const val1 = p1.value === undefined ? null : p1.value;
    const val2 = p2.value === undefined ? null : p2.value;

    // Special handling for number types with tolerance
    if (p1.type === 'number' && typeof val1 === 'number' && typeof val2 === 'number') {
      if (Math.abs(val1 - val2) > EPSILON) {
        return false;
      }
    } else if (val1 !== val2) {
      // For other types, use strict equality after normalization
      return false;
    }
  }
  return true;
};

export const ScriptExecutionProvider = ({ children }: { children: React.ReactNode }) => {
  const { showNotification } = useNotifications();
  const { setScripts, addRecentScript, fetchScriptMetadata, setCombinedScriptContent, updateScriptLastRunTime } = useScripts();
  const { scripts: allScriptsFromScriptProvider, teamWorkspaces } = useScripts(); // Get all scripts and teamWorkspaces from ScriptProvider
  const { isAuthenticated, activeTeam } = useAuth();
  const { activeScriptSource, setAgentSelectedScriptPath, messages, setActiveMainView, setActiveInspectorTab, threadId } = useUI();

  const currentTeamWorkspaces = activeTeam ? (teamWorkspaces[activeTeam.team_id] || []) : [];

  const [selectedScript, setSelectedScriptState] = useState<Script | null>(null);
  const [runningScriptPath, setRunningScriptPath] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [userEditedScriptParameters, setUserEditedScriptParameters] = useState<Record<string, ScriptParameter[]>>({});
  const [presets, setPresets] = useState<ParameterPreset[]>([]);
  const [isComputingOptions, setIsComputingOptions] = useState<Record<string, boolean>>({});

  const lastProcessedToolMessageIdRef = useRef<string | null>(null);

  const clearExecutionResult = useCallback(() => {
    setExecutionResult(null);
  }, []);

  const updateUserEditedParameters = useCallback((scriptId: string, parameters: ScriptParameter[]) => {
    setUserEditedScriptParameters(prev => ({
      ...prev,
      [scriptId]: parameters,
    }));
  }, []);

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
    console.log("New presets list after rename:", newPresets); // <--- ADDED FOR DEBUGGING
    setPresets(newPresets);
    savePresets(newPresets);
    return { success: true, message: "Preset renamed." };
  };

  const setSelectedScript = useCallback(async (script: Script | null, source: 'user' | 'agent' | 'agent_executed_full_output' = 'user') => {
    console.log(`[setSelectedScript] Called with script:`, script, `source:`, source);
    if (!script) {
      setSelectedScriptState(null);
      setCombinedScriptContent(null);
      setPresets([]);
      setAgentSelectedScriptPath(null); // Clear agent selected path
      console.log("[setSelectedScript] Script is null, clearing selection.");
      return;
    }

    if (script.id === selectedScript?.id) {
      if (source === 'agent') {
        // If agent selects the same script, ensure agentSelectedScriptPath is set
        setAgentSelectedScriptPath(script.absolutePath);
      }
      console.log("[setSelectedScript] Same script selected, avoiding re-fetch.");
      return; // Avoid re-fetching if the same script is clicked again
    }

    if (source === 'agent') {
      console.log("[setSelectedScript] Source is 'agent', processing agent selection.");
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
        console.log("[setSelectedScript] API results - paramsResult:", paramsResult);
        console.log("[DEBUG] Raw parameters from API:", paramsResult.parameters);

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
            console.log(`[DEBUG] Mapped parameter '${p.name}': inputType='${newParamObject.inputType}'`);
            return newParamObject;
          });
        }
        const updatedScript = { ...script, parameters: finalParameters };
        console.log("[setSelectedScript] Updated script with parameters:", updatedScript);
        updateUserEditedParameters(script.id, finalParameters);
        setCombinedScriptContent(contentResult || "// Failed to load script content.");
        setScripts((prev: Script[]) => prev.map((s: Script) => s.id === updatedScript.id ? updatedScript : s));
        setSelectedScriptState(updatedScript);
        console.log("[setSelectedScript] Script state updated successfully.");

      } catch (err) {
        console.error("[RAP] Critical error in setSelectedScript (agent source):", err);
        showNotification("An unexpected error occurred while loading the script.", "error");
        setSelectedScriptState(script);
        setCombinedScriptContent("// Error loading script. Please try again.");
      }
      return;
    }

    if (source === 'agent_executed_full_output') {
      console.log("[setSelectedScript] Source is 'agent_executed_full_output', processing agent selection for full output.");
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
    // --- NEW LOGIC: Check for cached parameters first ---
    const cachedParameters = userEditedScriptParameters[script.id];
    if (cachedParameters) {
      const updatedScript = { ...script, parameters: cachedParameters };
      setSelectedScriptState(updatedScript);
      // Still fetch content in the background
      fetchScriptContent(updatedScript).then(content => {
        setCombinedScriptContent(content || "// Failed to load script content.");
      });
      fetchScriptMetadata(script.id); // Fire and forget metadata update
      console.log("[setSelectedScript] Using cached parameters for user selection.");
      return; // Exit early, we are using the cached parameters
    }

    // If no cached params, proceed with fetching...
    setCombinedScriptContent("// Loading script content...");
    setPresets([]);
    setExecutionResult(null);

    try {
      const promises = [];

      // --- Parameters Promise (only runs if not cached) ---
      promises.push(
        api.post("/api/get-script-parameters", { scriptPath: script.absolutePath, type: script.type })
          .then(response => response.data)
          .catch(err => ({ error: `Failed to fetch parameters: ${err.message}` }))
      );

      // --- Content Promise ---
      promises.push(fetchScriptContent(script));

      // --- Metadata Promise (fire and forget, doesn't block) ---
      fetchScriptMetadata(script.id);

      const [paramsResult, contentResult] = await Promise.all(promises);
      console.log("[setSelectedScript] API results (user source) - paramsResult:", paramsResult);
      console.log("[DEBUG] Raw parameters from API (user):", paramsResult.parameters);

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
          console.log(`[DEBUG] Mapped parameter '${p.name}': inputType='${newParamObject.inputType}'`);
          return newParamObject;
        });
      }

      const updatedScript = { ...script, parameters: finalParameters };
      console.log("[setSelectedScript] Updated script with parameters (user source):", updatedScript);

      // --- NEW LOGIC: Store the newly fetched parameters in our cache ---
      updateUserEditedParameters(script.id, finalParameters);

      // Final state updates
      setCombinedScriptContent(contentResult || "// Failed to load script content.");
      setScripts((prev: Script[]) => prev.map((s: Script) => s.id === updatedScript.id ? updatedScript : s));
      setSelectedScriptState(updatedScript);
      console.log("[setSelectedScript] Script state updated successfully (user source).");

    } catch (err) {
      console.error("[RAP] Critical error in setSelectedScript:", err);
      showNotification("An unexpected error occurred while loading the script.", "error");
      // Reset to a stable state
      setSelectedScriptState(script); // Keep the initial script selected
      setCombinedScriptContent("// Error loading script. Please try again.");
    }
  }, [selectedScript, userEditedScriptParameters, fetchScriptContent, fetchScriptMetadata, setCombinedScriptContent, setScripts, showNotification, setAgentSelectedScriptPath, updateUserEditedParameters]);

  // Effect to keep selectedScript in sync with allScriptsFromScriptProvider
  useEffect(() => {
    if (selectedScript && allScriptsFromScriptProvider.length > 0) {
      const updatedScript = allScriptsFromScriptProvider.find(s => s.id === selectedScript.id);
      if (updatedScript && updatedScript.isFavorite !== selectedScript.isFavorite) {
        setSelectedScriptState(updatedScript);
      }
    }
  }, [allScriptsFromScriptProvider, selectedScript]);



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
      if (notifiedPresetsScriptIdRef.current === selectedScript.id) {
        return;
      }

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
        if (initializedPresets.length > 0) {
          showNotification(`Loaded ${initializedPresets.length} presets for ${selectedScript.name}.`, "success");
        }
        notifiedPresetsScriptIdRef.current = selectedScript.id;
      } catch (_) {
        showNotification("Failed to fetch presets.", "error");
        setPresets([]);
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
      }
    }

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
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unknown error occurred.";
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

      const { options, is_success, error_message } = response.data;

      if (is_success) {
        showNotification(`Computed ${options.length} options for ${parameterName}`, "success");

        const updateParamWithOptions = (p: ScriptParameter) => {
          if (p.name !== parameterName) return p;

          // Auto-select logic:
          // If we have options, and the current value is either empty or not in the new options list,
          // auto-select the first option to ensure a valid state.
          let newValue = p.value;
          if (options.length > 0) {
            const currentValueStr = String(p.value || "");
            if (!currentValueStr || !options.includes(currentValueStr)) {
              newValue = options[0];
              // console.log(`[ScriptExecutionProvider] Auto-selecting first option for ${p.name}: ${newValue}`);
            }
          }

          return { ...p, options: options, value: newValue };
        };

        // Update the parameter with the new options AND potentially new value
        setUserEditedScriptParameters(prev => {
          const params = prev[script.id];
          if (!params) return prev;

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
  }, [selectedScript, showNotification]);

  const contextValue = {
    selectedScript,
    setSelectedScript,
    runningScriptPath,
    executionResult,
    setExecutionResult, // Expose the setter
    runScript,
    clearExecutionResult,
    userEditedScriptParameters,
    updateUserEditedParameters,
    presets,
    addPreset,
    updatePreset,
    deletePreset,
    renamePreset,
    computeParameterOptions,
    isComputingOptions,
  };

  return (
    <ScriptExecutionContext.Provider value={contextValue}>
      {children}
    </ScriptExecutionContext.Provider>
  );
};
