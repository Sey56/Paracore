import { useState, useCallback, useRef } from 'react';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';
import { Script, ScriptParameter } from '@/types/scriptModel';

export const useParameterComputations = (
  revitStatus: { document: string | null },
  userEditedScriptParameters: Record<string, ScriptParameter[]>,
  setUserEditedScriptParameters: React.Dispatch<React.SetStateAction<Record<string, ScriptParameter[]>>>,
  setSelectedScriptState: React.Dispatch<React.SetStateAction<Script | null>>,
  selectedScriptId: string | undefined
) => {
  const { showNotification } = useNotifications();
  const [isComputingOptions, setIsComputingOptions] = useState<Record<string, boolean>>({});
  const lastExplicitParameterFetchTimeRef = useRef<number>(0);

  const computeParameterOptions = useCallback(async (script: Script, parameterName: string, shouldUpdateGlobalState: boolean = true) => {
    setIsComputingOptions(prev => ({ ...prev, [parameterName]: true }));
    try {
      const currentParamsArray = userEditedScriptParameters[script.id] || script.parameters || [];
      const flatParams = currentParamsArray.reduce((acc, p) => { acc[p.name] = p.value; return acc; }, {} as Record<string, unknown>);

      const response = await api.post("/api/compute-parameter-options", {
        scriptPath: script.absolutePath, parameterName: parameterName, parameters: flatParams
      });

      const { options, is_success, error_message, min, max, step } = response.data;

      if (is_success) {
        const isRangeUpdate = (typeof min === 'number') || (typeof max === 'number');
        lastExplicitParameterFetchTimeRef.current = Date.now();

        const updateParamMetadata = (p: ScriptParameter) => {
          if (p.name !== parameterName) return p;
          const docType = revitStatus?.document || "Unknown Document";
          if (isRangeUpdate) return { ...p, min: min ?? p.min, max: max ?? p.max, step: step ?? p.step, computedInDocument: docType };
          return { ...p, options: options, computedInDocument: docType };
        };

        const updateParamValueAndReset = (p: ScriptParameter): ScriptParameter => {
          if (p.name !== parameterName || isRangeUpdate) return p;
          let defVal = p.defaultValue !== undefined ? p.defaultValue : "";
          if (Array.isArray(defVal)) {
            const validDefaults = defVal.filter(item => options?.includes(String(item)));
            return { ...p, value: validDefaults as string[] };
          }
          if (options && options.length > 0 && !options.includes(String(defVal))) {
            defVal = options[0];
          }
          return { ...p, value: defVal };
        };

        if (shouldUpdateGlobalState) {
          setUserEditedScriptParameters((prev: Record<string, ScriptParameter[]>) => {
            const params: ScriptParameter[] = prev[script.id] || script.parameters || [];
            const updatedParams = params.map((p: ScriptParameter) => updateParamValueAndReset(updateParamMetadata(p)));
            return { ...prev, [script.id]: updatedParams };
          });
        }

        if (selectedScriptId === script.id) {
          setSelectedScriptState((prev: Script | null) => {
            if (!prev) return null;
            const updatedParams = (prev.parameters || []).map((p: ScriptParameter) => updateParamValueAndReset(updateParamMetadata(p)));
            return { ...prev, parameters: updatedParams };
          });
        }
        showNotification(isRangeUpdate ? "Range updated" : `Computed ${options.length} options`, "success");
      } else {
        showNotification(error_message || "Failed to compute options.", "error");
      }
      return response.data;
    } catch (err: unknown) {
      showNotification((err as Error).message || "Failed to compute options.", "error");
      return { is_success: false };
    } finally {
      setIsComputingOptions(prev => ({ ...prev, [parameterName]: false }));
    }
  }, [userEditedScriptParameters, revitStatus, setUserEditedScriptParameters, showNotification, selectedScriptId, setSelectedScriptState]);

  const pickObject = useCallback(async (script: Script, paramName: string, selectionType: string) => {
    setIsComputingOptions(prev => ({ ...prev, [paramName]: true }));
    try {
      const currentParams = userEditedScriptParameters[script.id] || script.parameters || [];
      const param = currentParams.find(p => p.name === paramName);
      const response = await api.post("/api/pick-object", { selection_type: selectionType, category_filter: param?.revitElementCategory || param?.revitElementType });
      const { value, is_success } = response.data;

      if (is_success) {
        const docName = revitStatus?.document || "Unknown";
        setUserEditedScriptParameters((prev: Record<string, ScriptParameter[]>) => {
          const params: ScriptParameter[] = prev[script.id] || script.parameters || [];
          const updatedParams = params.map((p: ScriptParameter) => p.name === paramName ? { ...p, value: value, computedInDocument: docName } : p);
          return { ...prev, [script.id]: updatedParams };
        });
        if (selectedScriptId === script.id) {
          setSelectedScriptState((prev: Script | null) => prev ? { ...prev, parameters: (prev.parameters || []).map((p: ScriptParameter) => p.name === paramName ? { ...p, value: value, computedInDocument: docName } : p) } : null);
        }
        showNotification("Selection successful!", "success");
      }
      return response.data;
    } catch (err: unknown) {
      showNotification("Selection failed.", "error");
      return { is_success: false };
    } finally {
      setIsComputingOptions(prev => ({ ...prev, [paramName]: false }));
    }
  }, [userEditedScriptParameters, revitStatus, setUserEditedScriptParameters, showNotification, selectedScriptId, setSelectedScriptState]);

  return {
    isComputingOptions,
    computeParameterOptions,
    pickObject,
    lastExplicitParameterFetchTimeRef
  };
};
