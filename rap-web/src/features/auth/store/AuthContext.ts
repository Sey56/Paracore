import { createContext } from 'react';
import { User, TeamMembership, Role } from '../types/authTypes';

export interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  cloudToken: string | null;
  localToken: string | null;
  sessionStartTime: number | null;
  activeTeam: TeamMembership | null;
  activeRole: Role | null;
  login: () => Promise<void>;
  loginLocal: () => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
