import { createContext } from "react";

export type InspectorTab = "parameters" | "console" | "table" | "metadata";

export type ActiveScriptSource =
  | { type: 'local'; path: string }
  | { type: 'workspace'; id: string; path: string }
  | { type: 'published'; id: string }
  | null;

export type ToolCall = {
  name: string;
  args: { [key: string]: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  id: string;
};

// This defines the shape of messages coming directly from the LangGraph state
export type Message = {
  type: 'human' | 'ai' | 'tool';
  content: string | any; // eslint-disable-line @typescript-eslint/no-explicit-any
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  id?: string; // Langchain message ID
  plan?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  raw_history?: string; // High-fidelity PydanticAI history blob
};



export interface UIContextProps {
  // Sidebar
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;

  // Inspector panel
  isInspectorOpen: boolean;
  setInspectorOpen: (open: boolean) => void;
  toggleInspector: () => void;
  activeInspectorTab: InspectorTab;
  setActiveInspectorTab: (tab: InspectorTab) => void;

  // Categories
  selectedCategory: string | null;
  setSelectedCategory: (category: string | null) => void;
  customCategories: string[];
  addCustomCategory: (categoryName: string) => void;
  removeCustomCategory: (categoryName: string) => void;
  isSettingsModalOpen: boolean;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;

  isTeamManagementModalOpen: boolean;
  openTeamManagementModal: () => void;
  closeTeamManagementModal: () => void;

  isNewScriptModalOpen: boolean;
  openNewScriptModal: () => void;
  closeNewScriptModal: () => void;

  // Floating Code Viewer
  isFloatingCodeViewerOpen: boolean;
  openFloatingCodeViewer: () => void;
  closeFloatingCodeViewer: () => void;
  toggleFloatingCodeViewer: () => void;

  // Active Script Source (either a local folder or a workspace)
  activeScriptSource: ActiveScriptSource;
  setActiveScriptSource: (source: ActiveScriptSource) => void;

  // Agent related state
  agentSelectedScriptPath: string | null;
  setAgentSelectedScriptPath: (path: string | null) => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  threadId: string | null;
  setThreadId: React.Dispatch<React.SetStateAction<string | null>>;

  // Main View Toggle
  activeMainView: 'scripts' | 'agent' | 'generation' | 'playlists';
  setActiveMainView: React.Dispatch<React.SetStateAction<'scripts' | 'agent' | 'generation' | 'playlists'>>;

  // Global InfoModal
  infoModalState: { isOpen: boolean; title: string; message: string };
  showInfoModal: (title: string, message: string) => void;
  closeInfoModal: () => void;
}

export const UIContext = createContext<UIContextProps | undefined>(undefined);
