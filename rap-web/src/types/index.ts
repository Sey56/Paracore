export * from './common';
export * from './scriptModel';

export interface Workspace {
  id: string;
  name: string;
  path: string;
  repoUrl: string;
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