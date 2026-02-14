import { createContext } from 'react';
import { Script } from '@/types/scriptModel';
import { TeamScriptSource } from '@/types';
import { ActiveScriptSource } from '@/context/providers/UIContext';

export interface ScriptContextProps {
  scripts: Script[];
  setScripts: React.Dispatch<React.SetStateAction<Script[]>>;
  activeScriptSource: ActiveScriptSource;
  setActiveScriptSource: (source: ActiveScriptSource) => void;
  loadScriptsForFolder: (path: string, silent?: boolean) => Promise<Script[] | undefined>;
  fetchScriptMetadata: (scriptId: string) => Promise<void>;
  reloadScript: (script: Script, options?: { silent?: boolean }) => Promise<void>;
  
  // Scaffolding & Content
  combinedScriptContent: string | null;
  setCombinedScriptContent: (content: string | null) => void;
  createNewScript: (details: any) => Promise<Script | undefined>;
  deleteScript: (script: Script) => Promise<boolean>;

  // Favorites & Recents
  favoriteScripts: string[];
  toggleFavoriteScript: (scriptId: string) => void;
  clearFavoriteScripts: () => void;
  recentScripts: string[]; // IDs
  addRecentScript: (scriptId: string) => void;
  clearRecentScripts: () => void;
  lastRunTimes: Record<string, string>;
  updateScriptLastRunTime: (scriptId: string) => void;

  // Sync & Active State
  isSyncActive: (scriptPath: string) => boolean;
  activeSyncSessions: Record<string, any>;
  
  // Custom Folders
  customScriptFolders: string[];
  setCustomScriptFolders: (folders: string[]) => void;
  addCustomScriptFolder: (folderPath: string) => Promise<void>;
  addCustomScriptFolders: (folderPaths: string[]) => Promise<void>;
  removeCustomScriptFolder: (folderPath: string) => void;
  clearAllCustomScriptFolders: () => Promise<void>;

  // Team & Remote
  remoteScriptSources: Record<number, TeamScriptSource[]>;
  fetchRemoteScriptSources: () => Promise<void>;
  addRemoteScriptSource: (teamId: number, source: TeamScriptSource) => Promise<void>;
  removeRemoteScriptSource: (teamId: number, sourceId: number) => Promise<void>;
  updateRemoteScriptSource: (teamId: number, sourceId: number, name: string | undefined, repoUrl: string | undefined) => Promise<void>;
  pullAllTeamSources: () => Promise<void>;
  pullTeamSource: (sourcePath: string) => Promise<void>;
  clearScriptsForSource: (sourcePath: string) => void;

  // Agent / Library
  toolLibraryPath: string | null;
  setToolLibraryPath: (path: string | null) => void;
  
  // User paths mapping
  userSourcePaths: Record<number, { path: string; name: string }>;
  setUserSourcePath: (sourceId: number, path: string, name: string) => void;
  canUseLocalFolders: boolean;
  selectedFolder: string | null;
}

export const ScriptContext = createContext<ScriptContextProps | undefined>(undefined);
