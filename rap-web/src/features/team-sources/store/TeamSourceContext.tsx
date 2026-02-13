import { createContext, useContext } from 'react';
import { TeamScriptSource } from '@/types';
import { CloneSourcePayload } from '../services/teamSources';

interface TeamSourceContextProps {
  teamScriptSources: TeamScriptSource[];
  activeTeamSource: TeamScriptSource | null;
  cloneAndAddSource: (payload: CloneSourcePayload) => Promise<void>;
  removeTeamSource: (id: number) => void;
  setActiveSourceId: (id: number | null) => void;
  clearActiveSource: () => void;
}

export const TeamSourceContext = createContext<TeamSourceContextProps | undefined>(undefined);

export const useTeamSourceContext = () => {
  const context = useContext(TeamSourceContext);
  if (!context) {
    throw new Error('useTeamSourceContext must be used within a TeamSourceProvider');
  }
  return context;
};
