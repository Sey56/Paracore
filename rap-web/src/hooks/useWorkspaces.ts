import { useWorkspaceContext } from '@/context/providers/WorkspaceContext';

export const useWorkspaces = () => {
  return useWorkspaceContext();
};

