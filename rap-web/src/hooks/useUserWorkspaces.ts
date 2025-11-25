import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import api from '@/api/axios'; // Correctly import the configured api instance

// Define the new shape for a single workspace entry
export interface LocalWorkspaceInfo {
  path: string;
  repo_url: string;
}

// Type for the stored paths, mapping registered ID to the local info object
type UserWorkspacePaths = Record<string, LocalWorkspaceInfo>;

export const useUserWorkspaces = () => {
  const { user } = useAuth();
  const STORAGE_KEY = user ? `rap-user-workspace-paths_${user.id}` : 'rap-user-workspace-paths_anonymous';

  const [userWorkspacePaths, setUserWorkspacePaths] = useState<UserWorkspacePaths>({});
  const [isLoaded, setIsLoaded] = useState(false);

  // Load paths from localStorage on initial render or when user/key changes
  useEffect(() => {
    if (!user) { // If no user, clear paths and mark as loaded
      setUserWorkspacePaths({});
      setIsLoaded(true);
      return;
    }

    try {
      const item = window.localStorage.getItem(STORAGE_KEY);
      if (item) {
        const parsedItem = JSON.parse(item);
        setUserWorkspacePaths(parsedItem);
      } else {
        setUserWorkspacePaths({}); // No item found, initialize to empty
      }
    } catch (error) {
      console.error("Failed to load workspace paths from localStorage", error);
      setUserWorkspacePaths({}); // On error, initialize to empty
    } finally {
      setIsLoaded(true);
    }
  }, [user, STORAGE_KEY]); // Re-run effect when user or STORAGE_KEY changes

  const setWorkspacePath = useCallback((workspaceId: string, path: string, repo_url: string) => {
    setUserWorkspacePaths(prev => {
      const newPaths = { ...prev, [workspaceId]: { path, repo_url } };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(newPaths));
      } catch (error) {
        console.error("Failed to save workspace path to localStorage", error);
      }
      return newPaths;
    });
  }, [STORAGE_KEY]);

  const removeWorkspacePath = useCallback(async (workspaceId: string) => {
    setUserWorkspacePaths(prev => {
      const { [workspaceId]: _, ...remainingPaths } = prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remainingPaths));
      } catch (error) {
        console.error("Failed to remove workspace path from localStorage", error);
      }
      return remainingPaths;
    });
  }, [STORAGE_KEY]);

  return { userWorkspacePaths, setWorkspacePath, removeWorkspacePath, isLoaded };
};