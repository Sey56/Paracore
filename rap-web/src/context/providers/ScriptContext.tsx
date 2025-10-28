import { createContext } from 'react';
import type { Script } from '@/types/scriptModel';
import { Workspace } from '@/types/index'; // Import Workspace type

export interface ScriptContextProps {
  scripts: Script[];
  allScripts: Script[]; // For global search
  customScriptFolders: string[];
  selectedFolder: string | null;
  favoriteScripts: string[];
  recentScripts: Script[];
  combinedScriptContent: string | null;
  toggleFavoriteScript: (scriptId: string) => void;
  addRecentScript: (scriptId: string) => void;
  updateScriptLastRunTime: (scriptId: string) => void;
  addCustomScriptFolder: (folderPath: string) => Promise<void>;
  removeCustomScriptFolder: (folderPath: string) => void;
  loadScriptsForFolder: (folderPath: string) => void;
  createNewScript: (details: {
    parent_folder: string;
    script_type: 'single' | 'multi';
    script_name: string;
    folder_name?: string;
  }) => Promise<void>;
  clearFavoriteScripts: () => void;
  clearRecentScripts: () => void;
  fetchScriptMetadata: (scriptId: string) => Promise<void>;
  setScripts: React.Dispatch<React.SetStateAction<Script[]>>;
  setCombinedScriptContent: React.Dispatch<React.SetStateAction<string | null>>;
  teamWorkspaces: Record<number, Workspace[]>;
  addTeamWorkspace: (teamId: number, workspace: Workspace) => Promise<void>;
  removeTeamWorkspace: (teamId: number, workspaceId: number) => Promise<void>;
  updateTeamWorkspace: (teamId: number, workspaceId: number, name: string | undefined, repoUrl: string | undefined) => Promise<void>;
  clearScriptsForWorkspace: (workspacePath: string) => void;
  pullAllTeamWorkspaces: () => Promise<void>;
  pullWorkspace: (workspacePath: string) => Promise<void>;
  fetchTeamWorkspaces: () => Promise<void>;
  clearScripts: () => void;
}

export const ScriptContext = createContext<ScriptContextProps | undefined>(undefined);
