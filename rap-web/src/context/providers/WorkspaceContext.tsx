
import { createContext, useContext } from 'react';
import { Workspace } from '@/types';
import { CloneWorkspacePayload } from '@/api/workspaces';

interface WorkspaceContextProps {
  workspaces: Workspace[];
  publishedWorkspaces: Workspace[];
  activeWorkspace: Workspace | null;
  cloneAndAddWorkspace: (payload: CloneWorkspacePayload) => Promise<void>;
  removeWorkspace: (id: string) => void;
  setActiveWorkspaceId: (id: string | null) => void;
  clearActiveWorkspace: () => void;
  publishWorkspace: (workspaceId: string) => Promise<void>;
}

export const WorkspaceContext = createContext<WorkspaceContextProps | undefined>(undefined);

export const useWorkspaceContext = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspaceContext must be used within a WorkspaceProvider');
  }
  return context;
};
