import { createContext } from "react";
import { Script, StructuredOutput } from "@/types/scriptModel";
export type InspectorTab = "parameters" | "console" | "table" | "metadata";

export type AutomationSubMode = 'gallery' | 'repl';

export type ActiveScriptSource =
  | { type: 'local'; path: string }
  | { type: 'published'; id: string }
  | null;

export type { StructuredOutput } from "@/types/scriptModel";



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

  // Analytics Sub-tabs
  activeAnalyticsSubTabIndex: number;
  setActiveAnalyticsSubTabIndex: (index: number) => void;

  // Categories
  selectedCategory: string | null;
  setSelectedCategory: (category: string | null) => void;
  customCategories: string[];
  addCustomCategory: (categoryName: string) => void;
  removeCustomCategory: (categoryName: string) => void;
  isSettingsModalOpen: boolean;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;

  isNewScriptModalOpen: boolean;
  openNewScriptModal: () => void;
  closeNewScriptModal: () => void;

  isNewSentinelModalOpen: boolean;
  openNewSentinelModal: () => void;
  closeNewSentinelModal: () => void;

  // Floating Code Viewer
  isFloatingCodeViewerOpen: boolean;
  openFloatingCodeViewer: () => void;
  closeFloatingCodeViewer: () => void;
  toggleFloatingCodeViewer: () => void;

  // Active Script Source (local folder or published)
  activeScriptSource: ActiveScriptSource;
  setActiveScriptSource: (source: ActiveScriptSource) => void;

  // Main View Toggle
  activeMainView: 'scripts' | 'playlists';
  setActiveMainView: React.Dispatch<React.SetStateAction<'scripts' | 'playlists'>>;

  // Automation Sub-mode (only relevant when activeMainView === 'scripts')
  automationSubMode: AutomationSubMode;
  setAutomationSubMode: React.Dispatch<React.SetStateAction<AutomationSubMode>>;

  // Welcome Gate overlay (accessible from main UI after auth)
  isWelcomeGateOpen: boolean;
  openWelcomeGate: () => void;
  closeWelcomeGate: () => void;

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

  // Sentinel FAB Visibility
  showSentinelFAB: boolean;
  toggleSentinelFAB: () => void;
}

export const UIContext = createContext<UIContextProps | undefined>(undefined);
