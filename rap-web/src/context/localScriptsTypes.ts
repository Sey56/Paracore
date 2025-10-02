import { createContext } from 'react';

export interface LocalScript {
  path: string;
  name: string;
  // Add other relevant fields for local scripts, e.g., last modified date, git status
}

export interface LocalScriptsContextType {
  localScripts: LocalScript[];
  fetchLocalScripts: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export const LocalScriptsContext = createContext<LocalScriptsContextType | undefined>(undefined);
