import { createContext } from "react";
import { Script } from "@/types/scriptModel";

export type InspectorTab = "parameters" | "console" | "table" | "metadata";

export type ActiveScriptSource =
  | { type: 'local'; path: string }
  | { type: 'workspace'; id: string; path: string }
  | { type: 'published'; id: string }
  | null;

export type ToolCall = {
  name: string;
  args: Record<string, string | number | boolean | Record<string, unknown> | unknown[]>;
  id: string;
};

export interface PlanStep {
  script_id: string;
  action: string;
  script_metadata: Script; // ADDED THIS
  deduced_parameters: Record<string, string | number | boolean>;
  satisfied_parameters: string[];
  missing_parameters: string[];
  status?: 'pending' | 'executing' | 'success' | 'error';
  result_summary?: string;
  parameter_definitions?: Array<{
    name: string;
    description: string;
    isRevitElement: boolean;
    revitElementType: string;
    options: string[];
    required: boolean;
  }>;
}

export interface OrchestrationPlan {
  action: string;
  explanation: string;
  steps: PlanStep[];
}

// This defines the shape of messages coming directly from the LangGraph state
export type Message = {
  type: 'human' | 'ai' | 'tool';
  content: string | { text: string }[];
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  id?: string; // Langchain message ID
  plan?: OrchestrationPlan;
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
  activeMainView: 'scripts' | 'agent' | 'playlists';
  setActiveMainView: React.Dispatch<React.SetStateAction<'scripts' | 'agent' | 'playlists'>>;

  // Global InfoModal
  infoModalState: { isOpen: boolean; title: string; message: string };
  showInfoModal: (title: string, message: string) => void;
  closeInfoModal: () => void;

  // Focus Mode
  isFocusMode: boolean;
  setFocusMode: (focused: boolean) => void;
}

export const UIContext = createContext<UIContextProps | undefined>(undefined);
