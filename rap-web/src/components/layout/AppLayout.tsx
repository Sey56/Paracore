import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';
import { TopBar } from "@/components/layout/TopBar/TopBar";
import { Sidebar } from "@/components/layout/Sidebar/Sidebar";
import { ScriptGallery } from "@/components/automation/ScriptGallery/ScriptGallery";
import { ScriptInspector } from "@/components/automation/ScriptInspector/ScriptInspector";
import { FloatingCodeViewer } from "@/components/automation/ScriptInspector/FloatingCodeViewer";
import { InfoModal } from "@/components/automation/ScriptInspector/InfoModal";
import { useScriptExecution } from "@/hooks/useScriptExecution";
import { useUI } from "@/hooks/useUI";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useScripts } from "@/hooks/useScripts"; // Import useScripts
import { GitStatusPanel } from "@/components/layout/GitStatusPanel"; // Import GitStatusPanel
import React, { useState, useCallback } from 'react';
import { useAuth } from "@/hooks/useAuth";
import { Role } from '@/context/authTypes'; // Import Role
import SettingsModal from '@/components/settings/SettingsModal';
import TeamManagementModal from '@/components/settings/TeamManagementModal'; // Import TeamManagementModal
import { NewScriptModal } from '@/components/common/NewScriptModal'; // Import NewScriptModal
import { AddFolderModal } from '@/components/common/AddFolderModal'; // Import AddFolderModal
import { AddCategoryModal } from '@/components/common/AddCategoryModal'; // Import AddCategoryModal
import { AgentView } from "@/components/agent/AgentView";
import { GenerationView } from "@/components/generation/GenerationView";

export const AppLayout: React.FC = () => {
  const { isAuthenticated, user, activeRole } = useAuth();
  const { selectedScript } = useScriptExecution();
  const { addCustomScriptFolder } = useScripts(); // Access addCustomScriptFolder
  const {
    isSidebarOpen,
    toggleSidebar,
    isInspectorOpen,
    toggleInspector,
    isSettingsModalOpen,
    isNewScriptModalOpen,
    closeNewScriptModal,
    isTeamManagementModalOpen, // Access isTeamManagementModalOpen
    closeTeamManagementModal, // Access closeTeamManagementModal

    activeScriptSource, // Access activeScriptSource
    isFloatingCodeViewerOpen,
    closeFloatingCodeViewer,
    activeMainView, // Access activeMainView
    infoModalState, // Access global InfoModal state
    closeInfoModal, // Access closeInfoModal function
  } = useUI();

  const isMobile = useBreakpoint();
  const [activeTab, setActiveTab] = useState<'scripts' | 'summary'>('scripts'); // New state for active tab

  const [galleryWidth, setGalleryWidth] = useState(0.6);
  const [inspectorWidth, setInspectorWidth] = useState(0.4);
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;

    const container = document.getElementById("main-content-area");
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const newInspectorWidth = (containerRect.right - e.clientX) / containerRect.width;
    const newGalleryWidth = 1 - newInspectorWidth;

    const minGalleryWidth = 0.3;
    const maxGalleryWidth = 0.7;
    const minInspectorWidth = 0.3;
    const maxInspectorWidth = 0.7;

    if (newGalleryWidth >= minGalleryWidth && newGalleryWidth <= maxGalleryWidth &&
      newInspectorWidth >= minInspectorWidth && newInspectorWidth <= maxInspectorWidth) {
      setGalleryWidth(newGalleryWidth);
      setInspectorWidth(newInspectorWidth);
    }
  }, [isResizing, setGalleryWidth, setInspectorWidth]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, [setIsResizing]);

  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div className="flex flex-col h-screen bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 font-sans overflow-hidden">
      <SettingsModal />
      <NewScriptModal isOpen={isNewScriptModalOpen} onClose={closeNewScriptModal} selectedFolder="" /> {/* Render NewScriptModal */}
      <TeamManagementModal />
      <InfoModal isOpen={infoModalState.isOpen} onClose={closeInfoModal} title={infoModalState.title} message={infoModalState.message} />

      {selectedScript && (
        <FloatingCodeViewer
          script={selectedScript}
          isOpen={isFloatingCodeViewerOpen}
          onClose={closeFloatingCodeViewer}
        />
      )}
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div
          className={`fixed top-16 left-0 h-[calc(100%-4rem)] transform transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0 w-96' : '-translate-x-full w-96'} bg-gray-50 dark:bg-gray-800 shadow-lg z-30 border-t border-gray-200 dark:border-gray-700`}
        >
          <Sidebar />
        </div>

        {/* Main Content Area */}
        <div
          id="main-content-area"
          className="flex flex-col flex-1 bg-gray-100 dark:bg-gray-900 isolate"
          onClick={() => {
            if (isSidebarOpen) {
              toggleSidebar();
            }
          }}
        >
          <div className="flex flex-1 overflow-hidden">
            {/* Main Content based on activeMainView */}
            <div style={{ flex: activeMainView === 'generation' ? 1 : galleryWidth }} className={`overflow-y-auto ${activeMainView === 'generation' ? '' : 'p-4 lg:p-6'} ${isMobile ? 'pt-4' : ''}`}>
              {activeMainView === 'scripts' && <ScriptGallery />}
              {activeMainView === 'agent' && <AgentView />}
              {activeMainView === 'generation' && <GenerationView />}
            </div>

            {/* Resizer - Hidden in Generation Mode */}
            {activeMainView !== 'generation' && (
              <div
                className="w-2 bg-gray-300 dark:bg-gray-700 cursor-ew-resize flex-shrink-0"
                onMouseDown={handleMouseDown}
              ></div>
            )}

            {/* Inspector Panel (Desktop) - Hidden in Generation Mode */}
            {activeMainView !== 'generation' && (
              <div style={{ flex: inspectorWidth }} className="hidden lg:block p-6 bg-white dark:bg-gray-800 shadow-lg overflow-y-auto overflow-hidden min-w-0">
                <ScriptInspector />
              </div>
            )}
          </div>
          {activeScriptSource?.type === 'workspace' && activeRole !== Role.User && <GitStatusPanel />} {/* Render GitStatusPanel here */}
        </div>
        {/* Mobile Inspector */}
        {isMobile && selectedScript && (
          <div
            className={`fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 rounded-t-lg shadow-lg transform transition-transform duration-300 ${isInspectorOpen ? 'translate-y-0' : 'translate-y-full'}`}
            style={{ height: '70vh' }}
          >
            <div className="h-full flex flex-col relative">
              {/* Close button positioned absolutely at top right */}
              <button onClick={toggleInspector} className="absolute top-2 right-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white">
                <FontAwesomeIcon icon={faTimes} size="lg" />
              </button>
              <div className="flex-1 overflow-y-auto">
                <div className="p-4 pt-8">
                  <ScriptInspector />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
