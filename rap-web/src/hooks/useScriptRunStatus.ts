import { useCallback, useRef } from 'react';
import { useScriptExecution } from '@/features/automation';

type RunStatus = 'success' | 'error' | 'running' | null;

export function useScriptRunStatus(): (scriptPath: string) => RunStatus {
  const { runningScriptPath, executionResult } = useScriptExecution();
  const statusCache = useRef<Record<string, { status: RunStatus; ts: number }>>({});

  // Update cache when execution completes
  const lastResult = executionResult;
  if (lastResult?.timestamp && lastResult.scriptName) {
    const key = lastResult.scriptName.replace(/\\/g, '/').toLowerCase();
    if (!statusCache.current[key] || (statusCache.current[key]?.ts || 0) < lastResult.timestamp) {
      statusCache.current[key] = {
        status: lastResult.error ? 'error' : 'success',
        ts: lastResult.timestamp,
      };
    }
  }

  return useCallback(
    (scriptPath: string): RunStatus => {
      const normalizedPath = (scriptPath || '').replace(/\\/g, '/').toLowerCase();
      // Extract filename for matching
      const fileName = normalizedPath.split('/').pop() || normalizedPath;

      // Currently running?
      const normalizedRunning = (runningScriptPath || '').replace(/\\/g, '/').toLowerCase();
      if (normalizedRunning && normalizedRunning === normalizedPath) {
        return 'running';
      }

      // Check cache by full path or filename
      const cachedByPath = statusCache.current[normalizedPath];
      if (cachedByPath) return cachedByPath.status;
      const cachedByName = statusCache.current[fileName];
      if (cachedByName) return cachedByName.status;

      return null;
    },
    [runningScriptPath],
  );
}
