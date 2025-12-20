export * from './common';
export * from './scriptModel';

export interface Workspace {
  id: number;
  name: string;
  repo_url: string;
  localId?: number;
  isOrphaned?: boolean;
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
