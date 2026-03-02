import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/features/auth';

// Define the shape for a single team source entry
export interface LocalSourceInfo {
  path: string;
  repo_url: string;
}

// Type for the stored paths, mapping registered ID to the local info object
type UserTeamSourcePaths = Record<string, LocalSourceInfo>;

export const useUserTeamSources = () => {
  const { user } = useAuth();
  const STORAGE_KEY = user ? `rap-user-source-paths_${user.id}` : 'rap-user-source-paths_anon';

  const [userSourcePaths, setUserSourcePaths] = useState<UserTeamSourcePaths>({});
  const [isLoaded, setIsLoaded] = useState(false);

  const loadedUserIdRef = useRef<string | null>(null);
  const currentUserId = user ? String(user.id) : null;

  // Load paths from localStorage on initial render or when user/key changes
  useEffect(() => {
    const storedToken = localStorage.getItem('rap_cloud_token');

    if (!user && !storedToken) {
      setUserSourcePaths({});
      loadedUserIdRef.current = null;
      setIsLoaded(true);
      return;
    }

    if (!user && storedToken) {
      return;
    }

    try {
      const item = window.localStorage.getItem(STORAGE_KEY);
      if (item) {
        const parsedItem = JSON.parse(item);
        setUserSourcePaths(parsedItem);
      } else {
        setUserSourcePaths({});
      }
    } catch (error) {
      console.error("Failed to load script source paths from localStorage", error);
      setUserSourcePaths({});
    } finally {
      loadedUserIdRef.current = user ? String(user.id) : null;
      setIsLoaded(true);
    }
  }, [user, STORAGE_KEY]);

  const setSourcePath = useCallback((sourceId: string, path: string, repo_url: string) => {
    setUserSourcePaths(prev => {
      const newPaths = { ...prev, [sourceId]: { path, repo_url } };
      try {
        if (user) {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(newPaths));
        }
      } catch (error) {
        console.error("Failed to save source path to localStorage", error);
      }
      return newPaths;
    });
  }, [STORAGE_KEY, user]);

  const removeSourcePath = useCallback(async (sourceId: string) => {
    setUserSourcePaths(prev => {
      const { [sourceId]: _, ...remainingPaths } = prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(remainingPaths));
      } catch (error) {
        console.error("Failed to remove source path from localStorage", error);
      }
      return remainingPaths;
    });
  }, [STORAGE_KEY]);

  const isLoadedCorrectly = isLoaded && loadedUserIdRef.current === currentUserId;

  return { userSourcePaths, setSourcePath, removeSourcePath, isLoaded: isLoadedCorrectly };
};
