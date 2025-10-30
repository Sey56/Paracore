import { createContext } from "react";

export type InspectorTab = "parameters" | "agent" | "log" | "summary" | "metadata" | "console";

export type ActiveScriptSource =
  | { type: 'local'; path: string }
  | { type: 'workspace'; id: string; path: string }
  | { type: 'published'; id: string }
  | null;

export type Message = {
  sender: 'user' | 'agent';
  text?: string;
  toolCall?: ToolCall;
  toolResponse?: any; // Adjust as needed
};

export type ToolCall = {
  id?: string; // Making id optional as it's not present in the provided backend output
  name: string;
  arguments: { [key: string]: any };
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
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  threadId: string | null;
  setThreadId: React.Dispatch<React.SetStateAction<string | null>>;
  isAwaitingApproval: boolean;
  setIsAwaitingApproval: React.Dispatch<React.SetStateAction<boolean>>;
  pendingToolCall: ToolCall | null;
  setPendingToolCall: React.Dispatch<React.SetStateAction<ToolCall | null>>;

  // Main View Toggle
  activeMainView: 'scripts' | 'agent';
  setActiveMainView: React.Dispatch<React.SetStateAction<'scripts' | 'agent'>>;
}

export const UIContext = createContext<UIContextProps | undefined>(undefined);