import { createContext } from 'react';
import { CredentialResponse } from '@react-oauth/google';

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
  login: (credentialResponse: CredentialResponse) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);