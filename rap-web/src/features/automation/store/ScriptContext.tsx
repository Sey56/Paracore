import { createContext } from 'react';
import { Script, TeamScriptSource } from '@/types';

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
  addCustomScriptFolders: (folderPaths: string[]) => Promise<void>;
  removeCustomScriptFolder: (folderPath: string) => void;
  clearAllCustomScriptFolders: () => Promise<void>;
  addRemoteScriptSource: (teamId: number, source: TeamScriptSource) => Promise<void>;
  removeRemoteScriptSource: (teamId: number, sourceId: number) => Promise<void>;
  updateRemoteScriptSource: (teamId: number, sourceId: number, name: string | undefined, repoUrl: string | undefined) => Promise<void>;
  loadScriptsForFolder: (folderPath: string, suppressNotification?: boolean) => Promise<Script[] | undefined>;
  createNewScript: (details: any) => Promise<Script | undefined>;
  deleteScript: (script: Script) => Promise<boolean>;
  isSyncActive: (scriptPath: string) => boolean;
  activeSyncSessions: Record<string, string>; // script_path -> temp_sync_path
  clearFavoriteScripts: () => void;
  clearRecentScripts: () => void;
  fetchScriptMetadata: (scriptId: string) => Promise<void>;
  setScripts: React.Dispatch<React.SetStateAction<Script[]>>;
  setCombinedScriptContent: (content: string | null) => void;
  clearScriptsForSource: (sourcePath: string) => void;
  clearScripts: () => void;
  reloadScript: (script: Script, options?: { silent?: boolean }) => Promise<void>;
  pullAllTeamSources: () => Promise<void>;
  pullTeamSource: (sourcePath: string) => Promise<void>;
  fetchRemoteScriptSources: () => Promise<void>;
  toolLibraryPath: string | null;
  setToolLibraryPath: (path: string | null) => void;
}

export const ScriptContext = createContext<ScriptContextProps | undefined>(undefined);
