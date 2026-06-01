import { useState, useCallback, useEffect, useMemo } from "react";
import { UIContext, InspectorTab, ActiveScriptSource, Message, ToolCall, StructuredOutput } from "./UIContext";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useNotifications } from "@/hooks/useNotifications";
import { useUserTeamSources } from "@/features/team-sources"; 
import { useAuth } from "@/features/auth";

const LOCAL_STORAGE_KEY_MESSAGES = 'agent_chat_messages';
const LOCAL_STORAGE_KEY_THREAD_ID = 'agent_chat_thread_id';
const LOCAL_STORAGE_KEY_ACTIVE_MAIN_VIEW = 'paracore_active_main_view';

export const UIProvider = ({ children }: { children: React.ReactNode }) => {
  const isMobile = useBreakpoint();
  const { showNotification } = useNotifications();
  const { user } = useAuth();
  const { userSourcePaths, isLoaded: userSourcesLoaded } = useUserTeamSources();

  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isInspectorOpen, setInspectorOpen] = useState(false);
  const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
  const [isNewScriptModalOpen, setIsNewScriptModalOpen] = useState(false);
  const [isNewSentinelModalOpen, setIsNewSentinelModalOpen] = useState(false);
  const [isTeamManagementModalOpen, setIsTeamManagementModalOpen] = useState(false);

  const [isFloatingCodeViewerOpen, setFloatingCodeViewerOpen] = useState(false);
  const [activeInspectorTab, setActiveInspectorTab] = useState<InspectorTab>("parameters");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [isFocusMode, setFocusMode] = useState(false);
  const [isLayoutSwapped, setIsLayoutSwapped] = useState(() => {
    return localStorage.getItem('isLayoutSwapped') === 'true';
  });
  const [showSentinelFAB, setShowSentinelFAB] = useState(() => {
    return localStorage.getItem('showSentinelFAB') === 'true';
  });

  const [activeScriptSource, setActiveScriptSource] = useState<ActiveScriptSource | null>(null);
  const [activeAnalyticsSubTabIndex, setActiveAnalyticsSubTabIndex] = useState(0);

  // Load activeScriptSource with user-aware key
  useEffect(() => {
    const userId = user?.id || 'anon';
    const key = `activeScriptSource_${userId}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try { setActiveScriptSource(JSON.parse(stored)); } catch { setActiveScriptSource(null); }
    } else {
      setActiveScriptSource(null);
    }
  }, [user?.id]);

  const toggleLayoutSwap = useCallback(() => {
    setIsLayoutSwapped(prev => {
      const newValue = !prev;
      localStorage.setItem('isLayoutSwapped', String(newValue));
      return newValue;
    });
  }, []);

  const toggleSentinelFAB = useCallback(() => {
    setShowSentinelFAB(prev => {
      const newValue = !prev;
      localStorage.setItem('showSentinelFAB', String(newValue));
      return newValue;
    });
  }, []);

  // Agent related state
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const storedMessages = localStorage.getItem(LOCAL_STORAGE_KEY_MESSAGES);
      return storedMessages ? JSON.parse(storedMessages) : [];
    } catch (error) {
      console.error("Failed to load chat messages from localStorage:", error);
      return [];
    }
  });
  const [threadId, setThreadId] = useState<string | null>(() => {
    try {
      const storedThreadId = localStorage.getItem(LOCAL_STORAGE_KEY_THREAD_ID);
      return storedThreadId || null;
    } catch (error) {
      console.error("Failed to load threadId from localStorage:", error);
      return null;
    }
  });
  const [isAwaitingApproval, setIsAwaitingApproval] = useState<boolean>(false);
  const [pendingToolCall, setPendingToolCall] = useState<ToolCall | null>(null);
  const [agentSelectedScriptPath, setAgentSelectedScriptPath] = useState<string | null>(null);

  // Effect to save messages and threadId to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_MESSAGES, JSON.stringify(messages));
    } catch (error) {
      console.error("Failed to save chat messages to localStorage:", error);
    }
  }, [messages]);

  useEffect(() => {
    try {
      if (threadId) {
        localStorage.setItem(LOCAL_STORAGE_KEY_THREAD_ID, threadId);
      } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY_THREAD_ID);
      }
    } catch (error) {
      console.error("Failed to save threadId to localStorage:", error);
    }
  }, [threadId]);

  // Main View Toggle
  const [activeMainView, setActiveMainView] = useState<'scripts' | 'agent' | 'playlists'>(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY_ACTIVE_MAIN_VIEW);
    if (stored === 'scripts' || stored === 'agent' || stored === 'playlists') return stored;
    return 'scripts';
  });

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_KEY_ACTIVE_MAIN_VIEW, activeMainView);
  }, [activeMainView]);

  // Welcome Gate overlay
  const [isWelcomeGateOpen, setIsWelcomeGateOpen] = useState(false);
  const openWelcomeGate = useCallback(() => setIsWelcomeGateOpen(true), []);
  const closeWelcomeGate = useCallback(() => setIsWelcomeGateOpen(false), []);

  // Agent REPL execution results (for Analytics tab rendering)
  const [agentReplResults, setAgentReplResults] = useState<StructuredOutput[] | null>(null);

  // Global InfoModal state
  const [infoModalState, setInfoModalState] = useState<{ isOpen: boolean; title: string; message: string }>({
    isOpen: false,
    title: '',
    message: '',
  });

  const showInfoModal = useCallback((title: string, message: string) => {
    setInfoModalState({ isOpen: true, title, message });
  }, []);

  const closeInfoModal = useCallback(() => {
    setInfoModalState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const openSettingsModal = useCallback(() => setSettingsModalOpen(true), []);
  const closeSettingsModal = useCallback(() => setSettingsModalOpen(false), []);

  const openNewScriptModal = useCallback(() => setIsNewScriptModalOpen(true), []);
  const closeNewScriptModal = useCallback(() => setIsNewScriptModalOpen(false), []);

  const openNewSentinelModal = useCallback(() => setIsNewSentinelModalOpen(true), []);
  const closeNewSentinelModal = useCallback(() => setIsNewSentinelModalOpen(false), []);

  const openTeamManagementModal = useCallback(() => setIsTeamManagementModalOpen(true), []);
  const closeTeamManagementModal = useCallback(() => setIsTeamManagementModalOpen(false), []);

  const openFloatingCodeViewer = useCallback(() => setFloatingCodeViewerOpen(true), []);
  const closeFloatingCodeViewer = useCallback(() => setFloatingCodeViewerOpen(false), []);
  const toggleFloatingCodeViewer = useCallback(() => setFloatingCodeViewerOpen(prev => !prev), []);

  const addCustomCategory = useCallback((categoryName: string) => {
    if (!customCategories.includes(categoryName)) {
      const newCategories = [...customCategories, categoryName];
      setCustomCategories(newCategories);
      localStorage.setItem("customCategories", JSON.stringify(newCategories));
      showNotification(`Added custom category: ${categoryName}.`, "success");
    } else {
      showNotification(`Category already exists: ${categoryName}.`, "info");
    }
  }, [customCategories, showNotification]);

  const removeCustomCategory = useCallback((categoryName: string) => {
    if (selectedCategory === categoryName) {
      setSelectedCategory(null);
    }
    const newCategories = customCategories.filter(
      (category) => category !== categoryName
    );
    setCustomCategories(newCategories);
    localStorage.setItem("customCategories", JSON.stringify(newCategories));
    showNotification(`Removed custom category: ${categoryName}.`, "info");
  }, [customCategories, selectedCategory, showNotification]);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const toggleInspector = useCallback(() => {
    setInspectorOpen((prev) => !prev);
  }, []);

  // Effect to load custom categories
  useEffect(() => {
    const storedCategories = localStorage.getItem("customCategories");
    if (storedCategories) {
      try {
        const parsed = JSON.parse(storedCategories);
        if (
          Array.isArray(parsed) &&
          parsed.every((item) => typeof item === "string")
        ) {
          setCustomCategories(parsed);
        }
      } catch (e) {
        console.error("Failed to parse customCategories from localStorage", e);
        showNotification("Failed to load custom categories from local storage.", "error");
      }
    }
  }, [showNotification]);

  // Effect to reset Focus Mode when user logs out, source changes, or view changes
  useEffect(() => {
    setFocusMode(false);
  }, [user, activeScriptSource, activeMainView]);

  // Effect to save activeScriptSource to localStorage whenever it changes
  useEffect(() => {
    const userId = user?.id || 'anon';
    const key = `activeScriptSource_${userId}`;
    if (activeScriptSource) {
      localStorage.setItem(key, JSON.stringify(activeScriptSource));
    } else {
      localStorage.removeItem(key);
    }
  }, [activeScriptSource, user?.id]);

  const contextValue = useMemo(() => ({
    isSidebarOpen,
    toggleSidebar,
    setSidebarOpen,
    isInspectorOpen,
    setInspectorOpen,
    toggleInspector,
    activeInspectorTab,
    setActiveInspectorTab,
    selectedCategory,
    setSelectedCategory,
    customCategories,
    addCustomCategory,
    removeCustomCategory,
    isSettingsModalOpen,
    openSettingsModal,
    closeSettingsModal,

    isTeamManagementModalOpen,
    openTeamManagementModal,
    closeTeamManagementModal,

    isNewScriptModalOpen,
    openNewScriptModal,
    closeNewScriptModal,

    isNewSentinelModalOpen,
    openNewSentinelModal,
    closeNewSentinelModal,

    isFloatingCodeViewerOpen,
    openFloatingCodeViewer,
    closeFloatingCodeViewer,
    toggleFloatingCodeViewer,

    activeScriptSource,
    setActiveScriptSource,

    messages,
    setMessages,
    threadId,
    setThreadId,
    isAwaitingApproval,
    setIsAwaitingApproval,
    pendingToolCall,
    setPendingToolCall,
    agentSelectedScriptPath,
    setAgentSelectedScriptPath,
    activeMainView,
    setActiveMainView,
    infoModalState,
    showInfoModal,
    closeInfoModal,
    isFocusMode,
    setFocusMode,
    isLayoutSwapped,
    toggleLayoutSwap,
    activeAnalyticsSubTabIndex,
    setActiveAnalyticsSubTabIndex,
    showSentinelFAB,
    toggleSentinelFAB,
    isWelcomeGateOpen,
    openWelcomeGate,
    closeWelcomeGate,
    agentReplResults,
    setAgentReplResults,
  }), [
    isSidebarOpen,
    toggleSidebar,
    isInspectorOpen,
    toggleInspector,
    activeInspectorTab,
    selectedCategory,
    customCategories,
    addCustomCategory,
    removeCustomCategory,
    isSettingsModalOpen,
    openSettingsModal,
    closeSettingsModal,
    isTeamManagementModalOpen,
    openTeamManagementModal,
    closeTeamManagementModal,
    isNewScriptModalOpen,
    openNewScriptModal,
    closeNewScriptModal,
    isNewSentinelModalOpen,
    openNewSentinelModal,
    closeNewSentinelModal,
    isFloatingCodeViewerOpen,
    openFloatingCodeViewer,
    closeFloatingCodeViewer,
    toggleFloatingCodeViewer,
    activeScriptSource,
    messages,
    threadId,
    isAwaitingApproval,
    pendingToolCall,
    agentSelectedScriptPath,
    activeMainView,
    infoModalState,
    showInfoModal,
    closeInfoModal,
    isFocusMode,
    isLayoutSwapped,
    toggleLayoutSwap,
    activeAnalyticsSubTabIndex,
    showSentinelFAB,
    toggleSentinelFAB,
    isWelcomeGateOpen,
    openWelcomeGate,
    closeWelcomeGate,
    agentReplResults,
  ]);

  return (
    <UIContext.Provider value={contextValue}>{children}</UIContext.Provider>
  );
};
