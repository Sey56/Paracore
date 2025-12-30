import { useState, useEffect, useCallback, useRef } from 'react';
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

  const loadedUserIdRef = useRef<string | null>(null);
  const currentUserId = user ? String(user.id) : null;

  // Load paths from localStorage on initial render or when user/key changes
  useEffect(() => {
    // START FIX: Check for stored token to avoid clearing on transient startup
    const storedToken = localStorage.getItem('rap_cloud_token');

    if (!user && !storedToken) { // Only clear if truly logged out (no user AND no token)
      setUserWorkspacePaths({});
      loadedUserIdRef.current = null; // Reset ref
      setIsLoaded(true);
      return;
    }

    // If we have a stored token but no user yet (startup), we should wait or keep existing if possible.
    // However, the STORAGE_KEY depends on user.id.
    // If user is null but token exists, we can't build the correct key yet.
    // So we should just Return and effectively "wait" until user is loaded.
    if (!user && storedToken) {
      return;
    }
    // END FIX

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
      loadedUserIdRef.current = user ? String(user.id) : null;
      setIsLoaded(true);
    }
  }, [user, STORAGE_KEY]); // Re-run effect when user or STORAGE_KEY changes

  const setWorkspacePath = useCallback((workspaceId: string, path: string, repo_url: string) => {
    setUserWorkspacePaths(prev => {
      const newPaths = { ...prev, [workspaceId]: { path, repo_url } };
      try {
        if (user) {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(newPaths));
        }
      } catch (error) {
        console.error("Failed to save workspace path to localStorage", error);
      }
      return newPaths;
    });
  }, [STORAGE_KEY, user]);

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

  // Derived loading state that ensures we match the current user
  const isLoadedCorrectly = isLoaded && loadedUserIdRef.current === currentUserId;

  return { userWorkspacePaths, setWorkspacePath, removeWorkspacePath, isLoaded: isLoadedCorrectly };
};
