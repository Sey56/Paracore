import { useState, useCallback, useEffect } from "react";
import { UIContext, InspectorTab, ActiveScriptSource } from "./UIContext";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useNotifications } from "@/hooks/useNotifications";
import { useUserWorkspaces } from "@/hooks/useUserWorkspaces"; // Import useUserWorkspaces
import { useAuth } from "@/hooks/useAuth"; // Import useAuth

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

  // Effect to initialize activeScriptSource from localStorage and validate it
  useEffect(() => {
    if (!userWorkspacesLoaded || !user) return; // Wait for user workspaces to load and user to be available

    const storedSource = localStorage.getItem("activeScriptSource");
    if (storedSource) {
      try {
        const parsedSource = JSON.parse(storedSource) as ActiveScriptSource;
        if (parsedSource?.type === 'workspace') {
          // Validate if the stored workspace is actually set up for the current user
          const localPathForStoredWorkspace = userWorkspacePaths[parsedSource.id];
          if (localPathForStoredWorkspace && localPathForStoredWorkspace.path === parsedSource.path) {
            setActiveScriptSource(parsedSource);
          } else {
            // Stored workspace is not set up for this user, or path is inconsistent
            localStorage.removeItem("activeScriptSource"); // Clear invalid entry
            setActiveScriptSource(null);
          }
        } else if (parsedSource?.type === 'local') {
          // For local folders, we don't have userWorkspacePaths to validate against
          // We assume local folders are user-specific via ScriptProvider's useLocalStorage
          // For now, just set it if it's a local type
          setActiveScriptSource(parsedSource);
        } else {
          setActiveScriptSource(parsedSource);
        }
      } catch (e) {
        console.error("Failed to parse activeScriptSource from localStorage", e);
        setActiveScriptSource(null);
      }
    }
  }, [user, userWorkspacesLoaded, userWorkspacePaths]); // Re-run when user or userWorkspaces change

  const openSettingsModal = () => setSettingsModalOpen(true);
  const closeSettingsModal = () => setSettingsModalOpen(false);

  const openNewScriptModal = () => setIsNewScriptModalOpen(true);
  const closeNewScriptModal = () => setIsNewScriptModalOpen(false);

  const openTeamManagementModal = () => setIsTeamManagementModalOpen(true);
  const closeTeamManagementModal = () => setIsTeamManagementModalOpen(false);

  const openFloatingCodeViewer = () => setFloatingCodeViewerOpen(true);
  const closeFloatingCodeViewer = () => setFloatingCodeViewerOpen(false);
  const toggleFloatingCodeViewer = () => setFloatingCodeViewerOpen(prev => !prev);

  // Effect to load custom categories
  useEffect(() => {
    const storedCategories = localStorage.getItem("customCategories");
    if (storedCategories) {
      try {
        const parsed = JSON.parse(storedCategories);
        if (
          Array.isArray(parsed) &&
          parsed.every((item) => typeof item === "string")
        )
        {
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


  const addCustomCategory = (categoryName: string) => {
    if (!customCategories.includes(categoryName)) {
      const newCategories = [...customCategories, categoryName];
      setCustomCategories(newCategories);
      localStorage.setItem("customCategories", JSON.stringify(newCategories));
      showNotification(`Added custom category: ${categoryName}.`, "success");
    } else {
      showNotification(`Category already exists: ${categoryName}.`, "info");
    }
  };

  const removeCustomCategory = (categoryName: string) => {
    if (selectedCategory === categoryName) {
      setSelectedCategory(null);
    }
    const newCategories = customCategories.filter(
      (category) => category !== categoryName
    );
    setCustomCategories(newCategories);
    localStorage.setItem("customCategories", JSON.stringify(newCategories));
    showNotification(`Removed custom category: ${categoryName}.`, "info");
  };

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev);
  }, []);

  const toggleInspector = useCallback(() => {
    setInspectorOpen((prev) => !prev);
  }, []);

  const contextValue = {
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
  };

  return (
    <UIContext.Provider value={contextValue}>{children}</UIContext.Provider>
  );
};