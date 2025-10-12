export * from './common';
export * from './scriptModel';

export interface Workspace {
  id: string;
  name: string;
  repo_url: string;
  path: string;
  localId?: number;
}

export interface Membership {
  team_id: number;
  team_name: string;
  role: string;
}

export interface Notification {
  id: string;
  message: string;
  type: "success" | "error" | "info" | "warning";
  duration?: number;
}

export interface RevitStatus {
  isConnected: boolean;
  version: string;
  document: string | null;
  documentType: string | null;
}