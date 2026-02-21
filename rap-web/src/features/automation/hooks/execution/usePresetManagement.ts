import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';
import { Script } from '@/types/scriptModel';
import { ParameterPreset } from '@/types/common';
import { areParametersEqual } from '../../utils/parameterUtils';

export const usePresetManagement = (selectedScript: Script | null, isAuthenticated: boolean) => {
  const { showNotification } = useNotifications();
  const [presets, setPresets] = useState<ParameterPreset[]>([]);
  const notifiedPresetsScriptIdRef = useRef<string | null>(null);

  const savePresets = useCallback(async (scriptPath: string, newPresets: ParameterPreset[]) => {
    const normalizedPath = scriptPath.replace(/\\/g, '/');
    try {
      await api.post("/api/presets", { scriptPath: normalizedPath, presets: newPresets });
      showNotification("Presets saved successfully.", "success");
    } catch (error) {
      showNotification("Failed to save presets.", "error");
    }
  }, [showNotification]);

  useEffect(() => {
    const fetchPresets = async () => {
      if (!selectedScript || !selectedScript.absolutePath) {
        setPresets([]);
        notifiedPresetsScriptIdRef.current = null;
        return;
      }

      if (notifiedPresetsScriptIdRef.current === selectedScript.id) return;

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
  }, [selectedScript, isAuthenticated, showNotification]);

  const addPreset = useCallback((preset: ParameterPreset) => {
    if (!selectedScript?.absolutePath) return { success: false, message: "No script selected." };
    
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
    savePresets(selectedScript.absolutePath, newPresets);
    return { success: true, message: "Preset saved." };
  }, [presets, selectedScript, showNotification, savePresets]);

  const updatePreset = useCallback((name: string, preset: ParameterPreset) => {
    if (!selectedScript?.absolutePath) return { success: false, message: "No script selected." };

    const existingWithSameValues = presets.find((p) => p.name !== name && areParametersEqual(p.parameters, preset.parameters));
    if (existingWithSameValues) {
      showNotification(`Another preset with identical values already exists: ${existingWithSameValues.name}`, "warning");
      return { success: false, message: `Identical values already exist in preset: ${existingWithSameValues.name}` };
    }

    const newPresets = presets.map((p) => (p.name === name ? preset : p));
    setPresets(newPresets);
    savePresets(selectedScript.absolutePath, newPresets);
    return { success: true, message: "Preset updated." };
  }, [presets, selectedScript, showNotification, savePresets]);

  const deletePreset = useCallback((name: string) => {
    if (!selectedScript?.absolutePath) return { success: false, message: "No script selected." };
    const newPresets = presets.filter((p) => p.name !== name);
    setPresets(newPresets);
    savePresets(selectedScript.absolutePath, newPresets);
    return { success: true, message: "Preset deleted." };
  }, [presets, selectedScript, savePresets]);

  const renamePreset = useCallback((oldName: string, newName: string) => {
    if (!selectedScript?.absolutePath) return { success: false, message: "No script selected." };
    const newPresets = presets.map((p) => (p.name === oldName ? { ...p, name: newName } : p));
    setPresets(newPresets);
    savePresets(selectedScript.absolutePath, newPresets);
    return { success: true, message: "Preset renamed." };
  }, [presets, selectedScript, savePresets]);

  return {
    presets,
    setPresets,
    addPreset,
    updatePreset,
    deletePreset,
    renamePreset
  };
};
