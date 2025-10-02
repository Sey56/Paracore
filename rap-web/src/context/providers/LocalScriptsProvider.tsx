import React, { useState, useCallback, useEffect, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { getWorkspaceScripts } from '@/api/workspaces';
import { LocalScript, LocalScriptsContext } from '../localScriptsTypes';

interface ApiResponseError {
  response?: {
    data?: {
      detail?: string;
    };
  };
}

export const LocalScriptsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth(); // Removed unused 'token'
  const { activeWorkspace } = useWorkspaces();
  const [localScripts, setLocalScripts] = useState<LocalScript[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLocalScripts = useCallback(async () => {
    // The API call is authenticated via the axios interceptor, so the token isn't needed here
    if (!isAuthenticated || !activeWorkspace?.path) {
      setLocalScripts([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const scriptPaths = await getWorkspaceScripts(activeWorkspace.path);
      const scripts: LocalScript[] = scriptPaths.map(path => ({
        path,
        name: path.split(/[\\/]/).pop() || path, // Extract file name from path
      }));
      setLocalScripts(scripts);
    } catch (err: unknown) {
      const apiError = err as ApiResponseError;
      console.error('Failed to fetch local scripts:', err);
      setError(apiError.response?.data?.detail || 'Failed to fetch local scripts.');
      setLocalScripts([]);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, activeWorkspace?.path]);

  useEffect(() => {
    fetchLocalScripts();
  }, [fetchLocalScripts]);

  return (
    <LocalScriptsContext.Provider value={{ localScripts, fetchLocalScripts, isLoading, error }}>
      {children}
    </LocalScriptsContext.Provider>
  );
};
