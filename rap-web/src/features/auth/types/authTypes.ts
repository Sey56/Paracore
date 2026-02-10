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
