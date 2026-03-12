import { useState, useCallback } from 'react';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';
import { Script, ScriptParameter } from '@/types/scriptModel';
import { ExecutionResult } from '@/types/common';

export const useExecutionRunner = (
  threadId: string | null,
  addRecentScript: (id: string) => void,
  updateScriptLastRunTime: (id: string) => void
) => {
  const { showNotification } = useNotifications();
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
        timestamp: Date.now(),
        scriptName: script.metadata?.displayName || script.name
      };

      if (shouldUpdateGlobalState) {
        setExecutionResult(prev => {
          // If the new result has data, use it. 
          // If not, keep the old structured output so graphs stay visible.
          const hasNewData = result.structured_output && result.structured_output.length > 0;
          return {
            ...frontendExecutionResult,
            structuredOutput: hasNewData ? result.structured_output : (prev?.structuredOutput || [])
          };
        });
      }
      showNotification(result.is_success ? `Executed successfully.` : "Execution failed", result.is_success ? "success" : "error");
      return frontendExecutionResult;
    } catch (error: any) {
      const msg = error.response?.data?.detail || error.message;
      showNotification(`Failed to execute: ${msg}`, "error");
      const errRes: ExecutionResult = { output: "", isSuccess: false, error: msg };
      if (shouldUpdateGlobalState) {
        setExecutionResult(prev => ({
          ...errRes,
          structuredOutput: prev?.structuredOutput || [] // Keep graphs even on error
        }));
      }
      return errRes;
    } finally {
      setRunningScriptPath(null);
    }
  }, [runningScriptPath, threadId, addRecentScript, updateScriptLastRunTime, showNotification]);

  return {
    runningScriptPath,
    executionResult,
    setExecutionResult,
    runScript
  };
};
