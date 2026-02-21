import { useCallback, useRef } from 'react';
import useLocalStorage from '@/hooks/useLocalStorage';
import { ScriptParameter, Script } from '@/types/scriptModel';

export const useParameterCache = (
  setScripts: React.Dispatch<React.SetStateAction<Script[]>>,
  setSelectedScriptState: React.Dispatch<React.SetStateAction<Script | null>>
) => {
  const [userEditedScriptParameters, setUserEditedScriptParameters] = useLocalStorage<Record<string, ScriptParameter[]>>('rap_userEditedScriptParameters', {});
  const userEditedParametersRef = useRef(userEditedScriptParameters);

  const [activePresets, setActivePresets] = useLocalStorage<Record<string, string>>('rap_activePresets', {});

  const [defaultDraftParameters, setDefaultDraftParameters] = useLocalStorage<Record<string, ScriptParameter[]>>('rap_defaultDraftParameters', {});
  const defaultDraftParametersRef = useRef(defaultDraftParameters);

  // Keep refs in sync
  userEditedParametersRef.current = userEditedScriptParameters;
  defaultDraftParametersRef.current = defaultDraftParameters;

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

    setSelectedScriptState(prev => {
      if (prev?.id === scriptId) {
        return { ...prev, parameters };
      }
      return prev;
    });

    setScripts(prev => prev.map(s => {
      if (s.id !== scriptId) return s;
      return { ...s, parameters };
    }));
  }, [setUserEditedScriptParameters, setActivePresets, setDefaultDraftParameters, activePresets, setScripts, setSelectedScriptState]);

  const clearParameterCache = useCallback((scriptId: string) => {
    delete userEditedParametersRef.current[scriptId];
    delete defaultDraftParametersRef.current[scriptId];
    setUserEditedScriptParameters(prev => { const next = { ...prev }; delete next[scriptId]; return next; });
    setDefaultDraftParameters(prev => { const next = { ...prev }; delete next[scriptId]; return next; });
  }, [setUserEditedScriptParameters, setDefaultDraftParameters]);

  return {
    userEditedScriptParameters,
    setUserEditedScriptParameters,
    userEditedParametersRef,
    activePresets,
    setActivePresets,
    defaultDraftParameters,
    setDefaultDraftParameters,
    defaultDraftParametersRef,
    updateUserEditedParameters,
    clearParameterCache
  };
};
