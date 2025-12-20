import { createContext } from 'react';
import type { Script } from '@/types/scriptModel';
import { Workspace } from '@/types/index'; // Corrected import path

export interface ScriptContextProps {
  scripts: Script[];
  allScripts: Script[];
  customScriptFolders: string[]; // This is the current user's folders


  teamWorkspaces: Record<number, Workspace[]>; // New: Workspaces keyed by team_id
  selectedFolder: string | null;
  favoriteScripts: string[];
  recentScripts: Script[];
  combinedScriptContent: string | null;
  toggleFavoriteScript: (scriptId: string) => void;
  addRecentScript: (scriptId: string) => void;
  updateScriptLastRunTime: (scriptId: string) => void;
  addCustomScriptFolder: (folderPath: string) => Promise<void>;
  removeCustomScriptFolder: (folderPath: string) => void;
  addTeamWorkspace: (teamId: number, workspace: Workspace) => void; // New
  updateTeamWorkspace: (teamId: number, workspaceId: number, name: string | undefined, repoUrl: string | undefined) => void; // New
  removeTeamWorkspace: (teamId: number, workspaceId: number) => void; // New
  clearScripts: () => void;
  clearScriptsForWorkspace: (workspacePath: string) => void;
  loadScriptsForFolder: (folderPath: string) => Promise<void>;
  createNewScript: (details: {
    parent_folder: string;
    script_type: 'single' | 'multi';
    script_name: string;
    folder_name?: string;
  }) => Promise<void>;
  clearFavoriteScripts: () => void;
  clearRecentScripts: () => void;
  fetchScriptMetadata: (scriptId: string) => Promise<void>;
  setScripts: React.Dispatch<React.SetStateAction<Script[]>>; // Keep if still needed
  setCombinedScriptContent: React.Dispatch<React.SetStateAction<string | null>>; // Keep if still needed
  pullAllTeamWorkspaces: () => Promise<void>; // New: Function to pull all team workspaces
  pullWorkspace: (workspacePath: string) => Promise<void>;
  fetchTeamWorkspaces: () => Promise<void>; // New: Function to fetch team workspaces
  fetchScriptManifest: (force?: boolean) => Promise<void>;
}

export const ScriptContext = createContext<ScriptContextProps | undefined>(undefined);
