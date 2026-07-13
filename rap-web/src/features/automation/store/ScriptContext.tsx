import { createContext } from 'react';
import { Script } from '@/types/scriptModel';
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
  createNewScript: (details: { 
    script_name: string; 
    template_id?: string; 
    generated_logic?: string; 
    generated_params?: string; 
    parent_folder?: string | null; 
  }) => Promise<Script | undefined>;
  editScript: (script: Script, forceScaffold?: boolean) => Promise<boolean>;
  deleteScript: (script: Script, scaffoldingOnly?: boolean) => Promise<boolean>;

  // Favorites & Recents
  favoriteScripts: string[];
  toggleFavoriteScript: (scriptId: string) => void;
  clearFavoriteScripts: () => void;
  recentScripts: string[]; // IDs
  addRecentScript: (scriptId: string) => void;
  clearRecentScripts: () => void;
  lastRunTimes: Record<string, string>;
  updateScriptLastRunTime: (scriptId: string) => void;
  updateScriptModificationTime: (scriptId: string) => void;

  // Sync & Active State
  isSyncActive: (scriptPath: string) => boolean;
  activeSyncSessions: Record<string, { last_modified: number }>;

  // Custom Folders
  customScriptFolders: string[];
  setCustomScriptFolders: (folders: string[]) => void;
  addCustomScriptFolder: (folderPath: string) => Promise<void>;
  addCustomScriptFolders: (folderPaths: string[]) => Promise<void>;
  removeCustomScriptFolder: (folderPath: string) => void;
  clearAllCustomScriptFolders: () => Promise<void>;

  // Agent / Library
  toolLibraryPath: string | null;
  setToolLibraryPath: (path: string | null) => void;

  canUseLocalFolders: boolean;
  selectedFolder: string | null;
}

export const ScriptContext = createContext<ScriptContextProps | undefined>(undefined);
