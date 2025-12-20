import { createContext } from 'react';

export enum Role {
  Admin = 'admin',
  Developer = 'developer',
  User = 'user',
}

export interface TeamMembership {
  team_id: number;
  team_name: string;
  role: Role;
  owner_id: number; // Added owner_id to TeamMembership
}

export interface TeamMemberOut {
  id: number;
  name?: string;
  email: string;
  role: Role;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  picture_url?: string;
  memberships: TeamMembership[];
}

export interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  cloudToken: string | null;
  localToken: string | null; // Retained for potential future use
  sessionStartTime: number | null;
  activeTeam: TeamMembership | null;
  activeRole: Role | null;
  login: () => void;
  loginLocal: () => void;
  logout: () => void;

}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
