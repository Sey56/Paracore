import { useState, useCallback, useEffect, useMemo } from "react";
import { UIContext, InspectorTab, ActiveScriptSource, Message, ToolCall } from "./UIContext";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useNotifications } from "@/hooks/useNotifications";
import { useUserWorkspaces } from "@/hooks/useUserWorkspaces"; // Import useUserWorkspaces
import { useAuth } from "@/hooks/useAuth"; // Import useAuth

const LOCAL_STORAGE_KEY_MESSAGES = 'agent_chat_messages';
const LOCAL_STORAGE_KEY_THREAD_ID = 'agent_chat_thread_id';

export const UIProvider = ({ children }: { children: React.ReactNode }) => {
  const isMobile = useBreakpoint();
  const { showNotification } = useNotifications();
  const { user } = useAuth(); // Get the current user
  const { userWorkspacePaths, isLoaded: userWorkspacesLoaded } = useUserWorkspaces(); // Get user-specific workspace paths

  const [isSidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [isInspectorOpen, setInspectorOpen] = useState(false);
  const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
  const [isNewScriptModalOpen, setIsNewScriptModalOpen] = useState(false);
  const [isTeamManagementModalOpen, setIsTeamManagementModalOpen] = useState(false);

  const [isFloatingCodeViewerOpen, setFloatingCodeViewerOpen] = useState(false);
  const [activeInspectorTab, setActiveInspectorTab] = useState<InspectorTab>("parameters");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [customCategories, setCustomCategories] = useState<string[]>([]);

  const [activeScriptSource, setActiveScriptSource] = useState<ActiveScriptSource>(null);

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
  const [activeMainView, setActiveMainView] = useState<'scripts' | 'agent' | 'generation'>('scripts'); // Default to 'scripts'

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

  // Effect to save activeScriptSource to localStorage whenever it changes
  useEffect(() => {
    if (activeScriptSource) {
      localStorage.setItem("activeScriptSource", JSON.stringify(activeScriptSource));
    } else {
      localStorage.removeItem("activeScriptSource");
    }
  }, [activeScriptSource]);

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
  ]);

  return (
    <UIContext.Provider value={contextValue}>{children}</UIContext.Provider>
  );
};
