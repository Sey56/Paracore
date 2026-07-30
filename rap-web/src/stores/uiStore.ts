import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Script } from '@/types/scriptModel';

export type InspectorTab = "parameters" | "metadata";
export type ActiveScriptSource =
  | { type: 'local'; path: string }
  | { type: 'published'; id: string }
  | null;
export type MainView = 'gallery' | 'repl' | 'playlists';

interface InfoModalState {
  isOpen: boolean;
  title: string;
  message: string;
}

interface UIStore {
  // Sidebar
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Inspector
  isInspectorOpen: boolean;
  toggleInspector: () => void;
  setInspectorOpen: (open: boolean) => void;
  activeInspectorTab: InspectorTab;
  setActiveInspectorTab: (tab: InspectorTab) => void;

  // Analytics sub-tabs
  activeAnalyticsSubTabIndex: number;
  setActiveAnalyticsSubTabIndex: (index: number) => void;

  // Categories
  selectedCategory: string | null;
  setSelectedCategory: (category: string | null) => void;
  customCategories: string[];
  addCustomCategory: (name: string) => void;
  removeCustomCategory: (name: string) => void;

  // Settings modal
  isSettingsModalOpen: boolean;
  openSettingsModal: () => void;
  closeSettingsModal: () => void;

  // New script modal
  isNewScriptModalOpen: boolean;
  openNewScriptModal: () => void;
  closeNewScriptModal: () => void;

  // New sentinel modal
  isNewSentinelModalOpen: boolean;
  openNewSentinelModal: () => void;
  closeNewSentinelModal: () => void;

  // Floating code viewer
  isFloatingCodeViewerOpen: boolean;
  openFloatingCodeViewer: () => void;
  closeFloatingCodeViewer: () => void;
  toggleFloatingCodeViewer: () => void;

  // Active script source
  activeScriptSource: ActiveScriptSource;
  setActiveScriptSource: (source: ActiveScriptSource) => void;

  // Main view
  activeMainView: MainView;
  setActiveMainView: (view: MainView) => void;

  // Welcome gate
  isWelcomeGateOpen: boolean;
  openWelcomeGate: () => void;
  closeWelcomeGate: () => void;

  // Info modal
  infoModalState: InfoModalState;
  showInfoModal: (title: string, message: string) => void;
  closeInfoModal: () => void;

  // Focus mode
  isFocusMode: boolean;
  setFocusMode: (focused: boolean) => void;

  // Layout swap
  isLayoutSwapped: boolean;
  toggleLayoutSwap: () => void;

  // Sentinel FAB
  showSentinelFAB: boolean;
  toggleSentinelFAB: () => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
  // Sidebar
  isSidebarOpen: false,
  toggleSidebar: () => set(s => ({ isSidebarOpen: !s.isSidebarOpen })),
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),

  // Inspector
  isInspectorOpen: false,
  toggleInspector: () => set(s => ({ isInspectorOpen: !s.isInspectorOpen })),
  setInspectorOpen: (open) => set({ isInspectorOpen: open }),
  activeInspectorTab: 'parameters',
  setActiveInspectorTab: (tab) => set({ activeInspectorTab: tab }),

  // Analytics sub-tabs
  activeAnalyticsSubTabIndex: 0,
  setActiveAnalyticsSubTabIndex: (index) => set({ activeAnalyticsSubTabIndex: index }),

  // Categories
  selectedCategory: null,
  setSelectedCategory: (category) => set({ selectedCategory: category }),
  customCategories: [],
  addCustomCategory: (name) => set(s => ({
    customCategories: s.customCategories.includes(name) ? s.customCategories : [...s.customCategories, name],
  })),
  removeCustomCategory: (name) => set(s => ({
    customCategories: s.customCategories.filter(c => c !== name),
  })),

  // Settings modal
  isSettingsModalOpen: false,
  openSettingsModal: () => set({ isSettingsModalOpen: true }),
  closeSettingsModal: () => set({ isSettingsModalOpen: false }),

  // New script modal
  isNewScriptModalOpen: false,
  openNewScriptModal: () => set({ isNewScriptModalOpen: true }),
  closeNewScriptModal: () => set({ isNewScriptModalOpen: false }),

  // New sentinel modal
  isNewSentinelModalOpen: false,
  openNewSentinelModal: () => set({ isNewSentinelModalOpen: true }),
  closeNewSentinelModal: () => set({ isNewSentinelModalOpen: false }),

  // Floating code viewer
  isFloatingCodeViewerOpen: false,
  openFloatingCodeViewer: () => set({ isFloatingCodeViewerOpen: true }),
  closeFloatingCodeViewer: () => set({ isFloatingCodeViewerOpen: false }),
  toggleFloatingCodeViewer: () => set(s => ({ isFloatingCodeViewerOpen: !s.isFloatingCodeViewerOpen })),

  // Active script source
  activeScriptSource: null,
  setActiveScriptSource: (source) => set({ activeScriptSource: source }),

  // Main view
  activeMainView: 'gallery',
  setActiveMainView: (view) => set({ activeMainView: view }),

  // Welcome gate
  isWelcomeGateOpen: false,
  openWelcomeGate: () => set({ isWelcomeGateOpen: true }),
  closeWelcomeGate: () => set({ isWelcomeGateOpen: false }),

  // Info modal
  infoModalState: { isOpen: false, title: '', message: '' },
  showInfoModal: (title, message) => set({ infoModalState: { isOpen: true, title, message } }),
  closeInfoModal: () => set(s => ({ infoModalState: { ...s.infoModalState, isOpen: false } })),

  // Focus mode
  isFocusMode: false,
  setFocusMode: (focused) => set({ isFocusMode: focused }),

  // Layout swap
  isLayoutSwapped: false,
  toggleLayoutSwap: () => set(s => ({ isLayoutSwapped: !s.isLayoutSwapped })),

  // Sentinel FAB
  showSentinelFAB: true,
  toggleSentinelFAB: () => set(s => ({ showSentinelFAB: !s.showSentinelFAB })),
}),
    {
      name: 'paracore-ui-store',
      partialize: (state) => ({
        activeScriptSource: state.activeScriptSource,
        activeMainView: state.activeMainView,
        isLayoutSwapped: state.isLayoutSwapped,
        showSentinelFAB: state.showSentinelFAB,
      }),
    },
  ),
);
