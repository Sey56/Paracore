import { createContext } from "react";
import { Script } from "@/types/scriptModel";
import { Message, ToolCall, OrchestrationPlan } from "@/features/agent/types/agentTypes";

export type InspectorTab = "parameters" | "console" | "table" | "metadata";

export type ActiveScriptSource =
  | { type: 'local'; path: string }
  | { type: 'team'; id: string; path: string }
  | { type: 'published'; id: string }
  | null;

export type { Message, ToolCall, OrchestrationPlan } from "@/features/agent/types/agentTypes";



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

  // Active Script Source (either a local folder or a team source)
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

  // Layout Swap
  isLayoutSwapped: boolean;
  toggleLayoutSwap: () => void;
}

export const UIContext = createContext<UIContextProps | undefined>(undefined);
