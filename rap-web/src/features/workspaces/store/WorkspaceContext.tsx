
import { createContext, useContext } from 'react';
import { Workspace } from '@/types';
import { CloneWorkspacePayload } from '@/features/workspaces/services/workspaces';

interface WorkspaceContextProps {
  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  cloneAndAddWorkspace: (payload: CloneWorkspacePayload) => Promise<void>;
  removeWorkspace: (id: number) => void;
  setActiveWorkspaceId: (id: number | null) => void;
  clearActiveWorkspace: () => void;
}

export const WorkspaceContext = createContext<WorkspaceContextProps | undefined>(undefined);

export const useWorkspaceContext = () => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspaceContext must be used within a WorkspaceProvider');
  }
  return context;
};
