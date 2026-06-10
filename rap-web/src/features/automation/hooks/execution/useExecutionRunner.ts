import { useState, useCallback } from 'react';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { Script, ScriptParameter } from '@/types/scriptModel';
import { ExecutionResult } from '@/types/common';
import { trackEvent } from '@/utils/telemetry';

export const useExecutionRunner = (
  threadId: string | null,
  addRecentScript: (id: string) => void,
  updateScriptLastRunTime: (id: string) => void
) => {
  const { showNotification } = useNotifications();
  const { revitStatus } = useRevitStatus();
  const [runningScriptPath, setRunningScriptPath] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);

  const runScript = useCallback(async (
    script: Script, 
    parameters: ScriptParameter[], 
    shouldUpdateGlobalState: boolean = true
  ) => {
    if (runningScriptPath) {
      showNotification("A script is already running.", "warning");
      return undefined;
    }

    addRecentScript(script.id);
    updateScriptLastRunTime(script.id);
    setRunningScriptPath(script.id);
    
    // Capture current doc title at start of execution
    const capturedDocTitle = revitStatus.document ? revitStatus.document.split(/[\\/]/).pop() || null : null;

    // TELEMETRY: Track script or REPL execution
    const eventName = script.id === 'repl' || (script.name && script.name.toLowerCase().includes('repl')) ? 'repl_executed' : 'script_executed';
    trackEvent(eventName, { has_parameters: parameters.length > 0 });

    showNotification(`Running script: ${script.name}...`, "info");

    try {
      const response = await api.post("/run-script", {
        path: script.absolutePath,
        parameters: JSON.stringify(parameters),
        thread_id: threadId
      });

      const result = response.data;
      const frontendExecutionResult: ExecutionResult = {
        output: result.output || "",
        isSuccess: result.is_success,
        error: result.error_message,
        structuredOutput: result.structured_output || [],
        internalData: result.internal_data,
        timestamp: Date.now(),
        scriptName: script.metadata?.displayName || script.name,
        capturedDocTitle
      };

      if (shouldUpdateGlobalState) {
        setExecutionResult(frontendExecutionResult);
      }
      showNotification(result.is_success ? `Executed successfully.` : "Execution failed", result.is_success ? "success" : "error");
      return frontendExecutionResult;
    } catch (error: unknown) {
      const err = error as { response?: { data?: { detail?: string } }, message: string };
      const msg = err.response?.data?.detail || err.message;
      showNotification(`Failed to execute: ${msg}`, "error");
      const errRes: ExecutionResult = { 
        output: "", 
        isSuccess: false, 
        error: msg, 
        timestamp: Date.now(),
        capturedDocTitle
      };
      if (shouldUpdateGlobalState) {
        setExecutionResult(errRes);
      }
      return errRes;
    } finally {
      setRunningScriptPath(null);
    }
  }, [runningScriptPath, threadId, addRecentScript, updateScriptLastRunTime, showNotification, revitStatus.document]);

  return {
    runningScriptPath,
    executionResult,
    setExecutionResult,
    runScript
  };
};
