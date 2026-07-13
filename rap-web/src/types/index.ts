export * from './common';
export * from './scriptModel';
export * from './playlistModel';

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
