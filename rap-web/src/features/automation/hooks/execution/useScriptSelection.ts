import { useState, useRef, useEffect } from 'react';
import useLocalStorage from '@/hooks/useLocalStorage';
import { Script } from '@/types/scriptModel';

export const useScriptSelection = () => {
  const [selectedScript, setSelectedScriptState] = useState<Script | null>(null);
  const [persistedScriptId, setPersistedScriptId] = useLocalStorage<string | null>('rap_activeSelectedScriptId', null);
  const selectedScriptRef = useRef<Script | null>(null);

  useEffect(() => {
    selectedScriptRef.current = selectedScript;
    if (selectedScript) {
      setPersistedScriptId(selectedScript.id);
    }
  }, [selectedScript, setPersistedScriptId]);

  return {
    selectedScript,
    setSelectedScriptState,
    selectedScriptRef,
    persistedScriptId,
    setPersistedScriptId
  };
};
