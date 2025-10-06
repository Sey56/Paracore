import { createContext } from 'react';

export interface User {
  id: string;
  email: string;
  name?: string;
  picture_url?: string;
}

export interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  cloudToken: string | null;
  localToken: string | null;
  sessionStartTime: number | null;
  login: () => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);