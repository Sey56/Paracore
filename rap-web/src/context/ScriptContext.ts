import { createContext } from 'react';
import type { Script } from '@/types/scriptModel';
import { TeamScriptSource } from '@/types/index';

export interface ScriptContextProps {
  scripts: Script[];
  customScriptFolders: string[];
  remoteScriptSources: Record<number, TeamScriptSource[]>;
  selectedFolder: string | null;
  favoriteScripts: string[];
  recentScripts: Script[];
  combinedScriptContent: string | null;
  toggleFavoriteScript: (scriptId: string) => void;
  addRecentScript: (scriptId: string) => void;
  updateScriptLastRunTime: (scriptId: string) => void;
  addCustomScriptFolder: (folderPath: string) => Promise<void>;
  removeCustomScriptFolder: (folderPath: string) => void;
  addRemoteScriptSource: (teamId: number, source: TeamScriptSource) => void;
  updateRemoteScriptSource: (teamId: number, sourceId: number, name: string | undefined, repoUrl: string | undefined) => void;
  removeRemoteScriptSource: (teamId: number, sourceId: number) => void;
  clearScripts: () => void;
  clearScriptsForSource: (sourcePath: string) => void;
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
  setScripts: React.Dispatch<React.SetStateAction<Script[]>>;
  setCombinedScriptContent: React.Dispatch<React.SetStateAction<string | null>>;
  pullAllTeamSources: () => Promise<void>;
  pullTeamSource: (sourcePath: string) => Promise<void>;
  fetchRemoteScriptSources: () => Promise<void>;
  fetchScriptManifest: (force?: boolean) => Promise<void>;
}

export const ScriptContext = createContext<ScriptContextProps | undefined>(undefined);
