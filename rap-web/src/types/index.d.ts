
export interface Notification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number; // in milliseconds, optional
}

export interface RevitStatus {
  revitOpen: boolean;
  revitVersion: string | null;
  documentOpen: boolean;
  documentTitle: string | null;
  documentType: string | null; // Added
}
