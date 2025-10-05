import React, { useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { cloneWorkspace as cloneWorkspaceApi, CloneWorkspacePayload } from '@/api/workspaces';
import { WorkspaceContext } from './WorkspaceContext';
import { Workspace } from '@/types';

const LOCAL_STORAGE_KEY = 'rap-workspaces';

export const WorkspaceProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    try {
      const storedWorkspaces = localStorage.getItem(LOCAL_STORAGE_KEY);
      return storedWorkspaces ? JSON.parse(storedWorkspaces) : [];
    } catch (error) {
      console.error("Failed to parse workspaces from localStorage:", error);
      return [];
    }
  });



  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(() => {
    const storedActiveId = localStorage.getItem('rap-active-workspace-id');
    if (storedActiveId && JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]').some((ws: Workspace) => ws.id === storedActiveId)) {
      return storedActiveId;
    }
    return null;
  });

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(workspaces));
  }, [workspaces]);

  useEffect(() => {
    if (activeWorkspaceId) {
      localStorage.setItem('rap-active-workspace-id', activeWorkspaceId);
    } else {
      localStorage.removeItem('rap-active-workspace-id');
    }
  }, [activeWorkspaceId]);

  const { showNotification } = useNotifications();
  const { isAuthenticated } = useAuth();

  const cloneAndAddWorkspace = useCallback(async (payload: CloneWorkspacePayload) => {
    const existingWorkspaceByUrl = workspaces.find(ws => ws.repoUrl === payload.repo_url);
    if (existingWorkspaceByUrl) {
      showNotification("Workspace exists, cloning skipped", "info");
      return;
    }

    try {
      showNotification("Cloning workspace...", "info");
      const response = await cloneWorkspaceApi(payload);
      const { cloned_path, workspace_id, message } = response;

      if (message && message === "workspace exists in path, loading it...") {
        showNotification(message, "info");
        const newWorkspace: Workspace = {
            id: workspace_id.toString(),
            name: payload.repo_url.split('/').pop()?.replace('.git', '') || 'New Workspace',
            path: cloned_path,
            repoUrl: payload.repo_url,
        };
        setWorkspaces((prev) => {
            const updatedWorkspaces = [...prev, newWorkspace];
            if (prev.length === 0) {
                setActiveWorkspaceId(newWorkspace.id);
            }
            return updatedWorkspaces;
        });
        return;
      }

      const newWorkspace: Workspace = {
        id: workspace_id.toString(),
        name: payload.repo_url.split('/').pop()?.replace('.git', '') || 'New Workspace',
        path: cloned_path,
        repoUrl: payload.repo_url,
      };

      setWorkspaces((prev) => {
        const updatedWorkspaces = [...prev, newWorkspace];
        if (prev.length === 0) {
          setActiveWorkspaceId(newWorkspace.id);
        }
        return updatedWorkspaces;
      });

      showNotification("Workspace cloned and added successfully!", "success");
    } catch (error) {
      console.error("Failed to clone and add workspace:", error);
      showNotification("Failed to clone workspace.", "error");
    }
  }, [workspaces, showNotification]);

  const removeWorkspace = useCallback((id: string) => {
    setWorkspaces((prev) => {
      const updatedWorkspaces = prev.filter((ws) => ws.id !== id);
      if (activeWorkspaceId === id) {
        setActiveWorkspaceId(updatedWorkspaces.length > 0 ? updatedWorkspaces[0].id : null);
      }
      return updatedWorkspaces;
    });
  }, [activeWorkspaceId]);

  const clearActiveWorkspace = useCallback(() => {
    setActiveWorkspaceId(null);
  }, []);

  const activeWorkspace = activeWorkspaceId
    ? workspaces.find(ws => ws.id === activeWorkspaceId) || null
    : null;

  const contextValue = {
    workspaces,
    activeWorkspace,
    cloneAndAddWorkspace,
    removeWorkspace,
    setActiveWorkspaceId,
    clearActiveWorkspace,
  };

  return (
    <WorkspaceContext.Provider value={contextValue}>
      {children}
    </WorkspaceContext.Provider>
  );
};