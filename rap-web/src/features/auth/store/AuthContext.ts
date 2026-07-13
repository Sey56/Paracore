import { createContext } from 'react';
import { User } from '../types/authTypes';

export interface AuthContextType {
  isAuthenticated: boolean;
  isEnterprise: boolean;
  user: User | null;
  cloudToken: string | null;
  localToken: string | null;
  sessionStartTime: number | null;
  login: () => Promise<void>;
  loginLocal: () => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
