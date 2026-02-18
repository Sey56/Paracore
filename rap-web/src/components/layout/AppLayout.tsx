import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faShieldHeart, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { TopBar } from "@/components/layout/TopBar/TopBar";
import { Sidebar } from "@/components/layout/Sidebar/Sidebar";
import { ScriptGallery } from "@/features/automation/components/ScriptGallery/ScriptGallery";
import { ScriptInspector } from "@/features/automation/components/ScriptInspector/ScriptInspector";
import { FloatingCodeViewer } from "@/features/automation/components/ScriptInspector/FloatingCodeViewer";
import { FloatingActionButton } from "@/features/automation/components/FloatingActionButton";
import { InfoModal } from "@/features/automation/components/ScriptInspector/InfoModal";
import { useScriptExecution } from "@/features/automation";
import { useUI } from "@/hooks/useUI";
import { useBreakpoint } from "@/hooks/useBreakpoint";
import { useScripts } from "@/features/automation";
import { GitStatusPanel } from "@/features/team-sources/components/GitStatusPanel";
import React, { useState, useCallback } from 'react';
import { useAuth } from "@/features/auth";
import { Role } from '@/features/auth';
import SettingsModal from '@/features/settings/components/SettingsModal';
import TeamManagementModal from '@/features/settings/components/TeamManagementModal';
import { NewScriptModal } from '@/features/automation/components/NewScriptModal';
import { AddFolderModal } from '@/features/automation/components/AddFolderModal';
import { AddCategoryModal } from '@/features/automation/components/AddCategoryModal';
import { AgentView } from "@/features/agent/components/AgentView";
import { PlaylistsTab } from "@/features/automation/components/Playlists/PlaylistsTab";

export const AppLayout: React.FC = () => {
  const { isAuthenticated, user, activeRole } = useAuth();
  const { selectedScript } = useScriptExecution();
  const { addCustomScriptFolder, isArmingWatchdogs } = useScripts(); // Access isArmingWatchdogs
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
    isLayoutSwapped,
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
    let newInspectorWidth: number;
    let newGalleryWidth: number;

    if (isLayoutSwapped) {
      newInspectorWidth = (e.clientX - containerRect.left) / containerRect.width;
      newGalleryWidth = 1 - newInspectorWidth;
    } else {
      newInspectorWidth = (containerRect.right - e.clientX) / containerRect.width;
      newGalleryWidth = 1 - newInspectorWidth;
    }

    const minGalleryWidth = 0.3;
    const maxGalleryWidth = 0.7;
    const minInspectorWidth = 0.3;
    const maxInspectorWidth = 0.7;

    if (newGalleryWidth >= minGalleryWidth && newGalleryWidth <= maxGalleryWidth &&
      newInspectorWidth >= minInspectorWidth && newInspectorWidth <= maxInspectorWidth) {
      setGalleryWidth(newGalleryWidth);
      setInspectorWidth(newInspectorWidth);
    }
  }, [isResizing, setGalleryWidth, setInspectorWidth, isLayoutSwapped]);

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
      {/* --- ARMING OVERLAY (Startup Gate) --- */}
      {isArmingWatchdogs && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/95 dark:bg-gray-900/95 backdrop-blur-[100px] transition-all duration-700">
          <div className="flex flex-col items-center space-y-8 p-12 rounded-[3rem] bg-white/20 dark:bg-gray-800/20 shadow-2xl max-w-sm text-center backdrop-blur-2xl">
            <div className="relative">
              <div className="absolute inset-0 rounded-[2rem] bg-blue-500/20 animate-ping"></div>
              <div className="relative bg-blue-500 rounded-[2rem] p-5 shadow-lg shadow-blue-500/30">
                <FontAwesomeIcon icon={faShieldHeart} className="text-white text-3xl animate-pulse" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Arming Sentinels</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                Initializing background monitoring systems. Manual script execution will be available in a few seconds.
              </p>
            </div>

            <div className="flex items-center space-x-2 text-blue-500 font-medium text-sm justify-center">
              <FontAwesomeIcon icon={faSpinner} spin />
              <span>Scanning sources...</span>
            </div>
          </div>
        </div>
      )}

      <SettingsModal />
      <NewScriptModal isOpen={isNewScriptModalOpen} onClose={closeNewScriptModal} selectedFolder="" /> {/* Render NewScriptModal */}
      <TeamManagementModal />
      <InfoModal isOpen={infoModalState.isOpen} onClose={closeInfoModal} title={infoModalState.title} message={infoModalState.message} />
      <FloatingActionButton />

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
          className={`fixed top-16 left-0 h-[calc(100%-4rem)] transform transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0 w-96' : '-translate-x-full w-96'} bg-gray-50/90 dark:bg-gray-800/90 backdrop-blur-md shadow-lg z-30 border-t border-gray-200 dark:border-gray-700`}
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
            {/* Left/Right Panels based on layout swap */}
            {isLayoutSwapped ? (
              <>
                {/* Inspector Panel (Swapped to Left) */}
                {activeMainView !== 'playlists' && (
                  <div style={{ flex: inspectorWidth, maxWidth: `${inspectorWidth * 100}%` }} className="hidden lg:block p-6 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md shadow-lg overflow-y-auto overflow-x-hidden min-w-0 border-r border-gray-200 dark:border-gray-700 transition-all duration-500">
                    <ScriptInspector />
                  </div>
                )}

                {/* Resizer */}
                {activeMainView !== 'playlists' && (
                  <div
                    className="w-2 bg-gray-300 dark:bg-gray-700 cursor-ew-resize flex-shrink-0"
                    onMouseDown={handleMouseDown}
                  ></div>
                )}

                {/* Main Content Area (Swapped to Right) */}
                <div style={{ flex: activeMainView === 'playlists' ? 1 : galleryWidth, maxWidth: activeMainView === 'playlists' ? '100%' : `${galleryWidth * 100}%` }} className={`overflow-y-auto p-4 lg:p-6 min-w-0 ${isMobile ? 'pt-4' : ''} transition-all duration-500`}>
                  {activeMainView === 'scripts' && <ScriptGallery />}
                  {activeMainView === 'agent' && <AgentView />}
                  {activeMainView === 'playlists' && <PlaylistsTab />}
                </div>
              </>
            ) : (
              <>
                {/* Main Content Area (Original Left) */}
                <div style={{ flex: activeMainView === 'playlists' ? 1 : galleryWidth, maxWidth: activeMainView === 'playlists' ? '100%' : `${galleryWidth * 100}%` }} className={`overflow-y-auto p-4 lg:p-6 min-w-0 ${isMobile ? 'pt-4' : ''} transition-all duration-500`}>
                  {activeMainView === 'scripts' && <ScriptGallery />}
                  {activeMainView === 'agent' && <AgentView />}
                  {activeMainView === 'playlists' && <PlaylistsTab />}
                </div>

                {/* Resizer */}
                {activeMainView !== 'playlists' && (
                  <div
                    className="w-2 bg-gray-300 dark:bg-gray-700 cursor-ew-resize flex-shrink-0"
                    onMouseDown={handleMouseDown}
                  ></div>
                )}

                {/* Inspector Panel (Original Right) */}
                {activeMainView !== 'playlists' && (
                  <div style={{ flex: inspectorWidth, maxWidth: `${inspectorWidth * 100}%` }} className="hidden lg:block p-6 bg-white/90 dark:bg-gray-800/90 backdrop-blur-md shadow-lg overflow-y-auto overflow-x-hidden min-w-0 transition-all duration-500">
                    <ScriptInspector />
                  </div>
                )}
              </>
            )}
          </div>
          {activeScriptSource?.type === 'team' && activeRole !== Role.User && <GitStatusPanel />} {/* Render GitStatusPanel here */}
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
