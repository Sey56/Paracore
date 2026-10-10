import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldHeart, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { TopBar } from "@/components/layout/TopBar/TopBar";
import { Sidebar } from "@/components/layout/Sidebar/Sidebar";
import { ScriptGallery } from "@/features/automation/components/ScriptGallery/ScriptGallery";
import { FloatingActionButton } from "@/features/automation/components/FloatingActionButton";
import { InfoModal } from "@/features/automation/components/ScriptInspector/InfoModal";
import { useScriptExecution } from "@/features/automation";
import { useUI } from "@/hooks/useUI";
import { useScripts } from "@/features/automation";
import { listen } from '@tauri-apps/api/event';
import api from '@/api/axios';
import type { Script, ScriptParameter } from '@/types/scriptModel';
import React, { Suspense, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from "@/features/auth";
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useTheme } from '@/context/ThemeContext';
import { useWatchdog } from '@/context/providers/WatchdogProvider';
import { OutputPanel } from "@/components/layout/OutputPanel/OutputPanel";
import { WelcomeGate } from "@/features/auth/components/WelcomeGate";
import { Skeleton } from "@/components/ui/skeleton";

// ── Lazy-loaded heavy features ──
const FloatingCodeViewer = React.lazy(() =>
  import("@/features/automation/components/ScriptInspector/FloatingCodeViewer")
    .then(m => ({ default: m.FloatingCodeViewer }))
);
const SettingsModal = React.lazy(() =>
  import("@/features/settings/components/SettingsModal")
);
const PlaylistsTab = React.lazy(() =>
  import("@/features/automation/components/Playlists/PlaylistsTab")
    .then(m => ({ default: m.PlaylistsTab }))
);
const ReplModeContent = React.lazy(() =>
  import("@/features/automation/components/ScriptInspector/ReplModeContent")
    .then(m => ({ default: m.ReplModeContent }))
);

// ── Shared skeleton fallback ──
const PanelSkeleton = () => (
  <div className="flex-1 p-6 space-y-3">
    <Skeleton className="h-5 w-1/3" />
    <Skeleton className="h-4 w-2/3" />
    <Skeleton className="h-4 w-1/2" />
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-4 w-1/4" />
  </div>
);

export const AppLayout: React.FC = () => {
  const { isAuthenticated, user, login, loginLocal } = useAuth();
  const { selectedScript, setSelectedScript, runScript, userEditedScriptParameters } = useScriptExecution();
  const { isArmingWatchdogs, watchdogs } = useWatchdog();
  const { toggleTheme } = useTheme();
  const [gateVisible, setGateVisible] = useState(true);

  const prevAuthRef = useRef(isAuthenticated);
  useEffect(() => {
    if (!prevAuthRef.current && isAuthenticated) setGateVisible(true);
    prevAuthRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    if (!gateVisible) return;
    const timer = setTimeout(() => setGateVisible(false), 2500);
    return () => clearTimeout(timer);
  }, [gateVisible]);

  const normalize = (p: string) => (p || "").replace(/\\/g, '/').toLowerCase().trim();
  useEffect(() => {
    const unlisten = listen<{ scriptPath: string; action: string }>('sentinel-table-action', async (event) => {
      try {
        const { scriptPath, action } = event.payload;
        const response = await api.get(`/api/script-details?scriptPath=${encodeURIComponent(scriptPath)}`);
        const s = response.data as Script;
        if (s) {
          await setSelectedScript(s, 'user');
          let execParams = userEditedScriptParameters[s.id] || s.parameters || [];
          const watchdog = watchdogs.find(w => normalize(w.script_path) === normalize(scriptPath));
          if (watchdog?.parameters_json) {
            try {
              const parsed = JSON.parse(watchdog.parameters_json);
              if (Array.isArray(parsed)) execParams = parsed;
              else if (typeof parsed === 'object' && parsed !== null) {
                if (execParams.length > 0) execParams = execParams.map((p: ScriptParameter) => parsed[p.name] !== undefined ? { ...p, value: parsed[p.name] } : p);
              }
            } catch {
              // ignore parse errors
            }
          }
          const paramAction: ScriptParameter = { name: '__sentinel_action__', value: action, type: 'string', defaultValue: action, required: true, options: [] };
          runScript(s, [paramAction, ...execParams]);
        }
      } catch (err) { console.error("[AppLayout] Failed to handle sentinel-table-action:", err); }
    });
    return () => { unlisten.then(f => f()); };
  }, [watchdogs, userEditedScriptParameters, runScript, setSelectedScript]);

  const {
    isSidebarOpen,
    toggleSidebar,
    isInspectorOpen,
    toggleInspector,
    isFloatingCodeViewerOpen,
    closeFloatingCodeViewer,
    activeMainView,
    activeScriptSource,
    infoModalState,
    closeInfoModal,
    isLayoutSwapped,
    layoutOrientation,
    toggleLayoutOrientation,
    showSentinelFAB,
    isWelcomeGateOpen,
    closeWelcomeGate,
    toggleLayoutSwap,
    openSettingsModal,
    setActiveMainView,
  } = useUI();

  const showGate = isAuthenticated && gateVisible;

  // ── Keyboard Shortcuts ──
  useKeyboardShortcuts({
    'toggle-sidebar': toggleSidebar,
    'toggle-inspector': toggleInspector,
    'run-script': () => { if (selectedScript) runScript(selectedScript, userEditedScriptParameters[selectedScript.id] || selectedScript.parameters || []); },
    'toggle-layout-swap': toggleLayoutSwap,
    'toggle-layout-orientation': toggleLayoutOrientation,
    'cycle-theme': toggleTheme,
    'open-settings': openSettingsModal,
    'view-gallery': () => setActiveMainView('gallery'),
    'view-repl': () => setActiveMainView('repl'),
    'view-playlists': () => setActiveMainView('playlists'),
  });

  // Global Reflow Trigger: 
  // Helps resolve a known Webview2/Tauri issue where scrollbars don't 
  // initialize dragging correctly if the window starts with specific overlays.
  useEffect(() => {
    if (!showGate) {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 750); // Fire shortly after transition starts/ends
      return () => clearTimeout(timer);
    }
  }, [showGate]);

  const [galleryWidth, setGalleryWidth] = useState(() => {
    const saved = localStorage.getItem('paracore_gallery_width');
    return saved ? parseFloat(saved) : 0.595;
  });
  const [inspectorWidth, setInspectorWidth] = useState(() => {
    const saved = localStorage.getItem('paracore_inspector_width');
    return saved ? parseFloat(saved) : 0.405;
  });
  const [galleryHeight, setGalleryHeight] = useState(() => {
    const saved = localStorage.getItem('paracore_gallery_height');
    return saved ? parseFloat(saved) : 0.55;
  });
  const [inspectorHeight, setInspectorHeight] = useState(() => {
    const saved = localStorage.getItem('paracore_inspector_height');
    return saved ? parseFloat(saved) : 0.45;
  });
  const [isResizing, setIsResizing] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => { setIsResizing(true); e.preventDefault(); };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const container = document.getElementById("main-content");
    if (!container) return;
    const containerRect = container.getBoundingClientRect();

    if (layoutOrientation === 'vertical') {
      let nih: number;
      if (isLayoutSwapped) nih = (e.clientY - containerRect.top) / containerRect.height;
      else nih = (containerRect.bottom - e.clientY) / containerRect.height;
      if (nih >= 0.2 && nih <= 0.8) {
        setInspectorHeight(nih);
        setGalleryHeight(1 - nih);
      }
    } else {
      let niw: number;
      if (isLayoutSwapped) niw = (e.clientX - containerRect.left) / containerRect.width;
      else niw = (containerRect.right - e.clientX) / containerRect.width;
      if (niw >= 0.2 && niw <= 0.8) {
        setInspectorWidth(niw);
        setGalleryWidth(1 - niw);
      }
    }
  }, [isResizing, isLayoutSwapped, layoutOrientation]);

  const handleMouseUp = useCallback(() => {
    if (isResizing) {
      if (layoutOrientation === 'vertical') {
        localStorage.setItem('paracore_gallery_height', galleryHeight.toString());
        localStorage.setItem('paracore_inspector_height', inspectorHeight.toString());
      } else {
        localStorage.setItem('paracore_gallery_width', galleryWidth.toString());
        localStorage.setItem('paracore_inspector_width', inspectorWidth.toString());
      }
      setIsResizing(false);
    }
  }, [isResizing, layoutOrientation, galleryWidth, inspectorWidth, galleryHeight, inspectorHeight]);

  useEffect(() => {
    if (isResizing) { document.addEventListener('mousemove', handleMouseMove); document.addEventListener('mouseup', handleMouseUp); }
    else { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); }
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div className="flex flex-col h-screen semantic-bg-panel semantic-text font-sans overflow-hidden">
      {/* Startup Gate Overlay */}
      {showGate && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/95 dark:bg-black/60 backdrop-blur-[100px] transition-all duration-700">
          <div className="flex flex-col items-center justify-center space-y-8 w-88 aspect-square rounded-[3rem] bg-white/60 dark:bg-slate-800/40 shadow-2xl text-center backdrop-blur-md">
            <div className="relative">
              <div className="absolute inset-0 rounded-[2rem] bg-blue-500/20 animate-ping"></div>
              <div className="relative bg-blue-500 rounded-[2rem] p-5 shadow-lg shadow-blue-500/30 dark:shadow-blue-900/40">
                <FontAwesomeIcon icon={faShieldHeart} className="text-white text-3xl animate-pulse" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Setting Up Paracore</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">Getting everything ready for you.</p>
            </div>
            <div className="flex items-center space-x-2 text-blue-500 dark:text-blue-400 text-xs justify-center"><FontAwesomeIcon icon={faSpinner} spin /><span>Preparing environment...</span></div>
          </div>
        </div>
      )}

      {/* Welcome Gate Overlay (accessible from main UI when authenticated) */}
      {isAuthenticated && isWelcomeGateOpen && (
        <div className="fixed inset-0 z-[9998] bg-white/95 dark:bg-black/60 backdrop-blur-[100px] transition-all duration-300">
          <WelcomeGate login={login} loginLocal={loginLocal} isAuthenticated onDismiss={closeWelcomeGate} />
        </div>
      )}

      <Suspense fallback={null}><SettingsModal /></Suspense>
      <InfoModal isOpen={infoModalState.isOpen} onClose={closeInfoModal} title={infoModalState.title} message={infoModalState.message} />
      {showSentinelFAB && <FloatingActionButton />}

      {selectedScript && (
        <Suspense fallback={null}>
          <FloatingCodeViewer script={selectedScript} isOpen={isFloatingCodeViewerOpen} onClose={closeFloatingCodeViewer} />
        </Suspense>
      )}

      <div className={`flex flex-col h-full transition-opacity duration-700 ${showGate ? 'opacity-0' : 'opacity-100'}`}>
        {!isAuthenticated ? (
          <WelcomeGate login={login} loginLocal={loginLocal} />
        ) : (
          <>
            <TopBar />
            <div className="flex flex-1 overflow-hidden">
              {/* Sidebar */}
              <div className={`fixed top-16 left-0 h-[calc(100%-4rem)] transform transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0 w-96' : '-translate-x-full w-96'} semantic-bg-panel shadow-xl z-30 border-r border-slate-200 dark:border-gray-700`}><Sidebar /></div>

              {/* Main Content Area */}
              <div id="main-content" className="flex flex-col flex-1 semantic-bg-ground isolate min-w-0 min-h-0 overflow-hidden" onClick={() => { if (isSidebarOpen) toggleSidebar(); }}>
                <div className={`flex flex-1 overflow-hidden w-full max-w-full h-full max-h-full ${layoutOrientation === 'vertical' ? 'flex-col' : 'flex-row'}`}>
                  {/* ── Main Content Area (left / top side) ── */}
                  <div style={layoutOrientation === 'vertical' ? {
                    height: `calc(${galleryHeight * 100}% - 4px)`,
                    flex: `0 0 calc(${galleryHeight * 100}% - 4px)`,
                    maxHeight: `calc(${galleryHeight * 100}% - 4px)`,
                    width: '100%',
                    maxWidth: '100%',
                    order: isLayoutSwapped ? 2 : 0
                  } : {
                    width: `calc(${galleryWidth * 100}% - 4px)`,
                    flex: `0 0 calc(${galleryWidth * 100}% - 4px)`,
                    maxWidth: `calc(${galleryWidth * 100}% - 4px)`,
                    height: '100%',
                    order: isLayoutSwapped ? 2 : 0
                  }} className="flex flex-col min-w-0 min-h-0 semantic-bg-ground relative overflow-hidden">
                    <div className="flex-1 relative min-h-0">
                      {/* Playlists mode */}
                      {activeMainView === 'playlists' && (
                        <div className="absolute inset-0 overflow-y-auto custom-scrollbar transition-opacity duration-150 z-10 opacity-100 visible">
                          <Suspense fallback={<PanelSkeleton />}><PlaylistsTab /></Suspense>
                        </div>
                      )}

                      {/* Gallery mode */}
                      {activeMainView === 'gallery' && (
                        <div className="absolute inset-0 overflow-y-auto custom-scrollbar transition-opacity duration-150 z-10 opacity-100 visible">
                          <ScriptGallery />
                        </div>
                      )}

                      {/* REPL mode */}
                      {activeMainView === 'repl' && (
                        <div className="absolute inset-0 overflow-y-auto overflow-x-hidden custom-scrollbar transition-opacity duration-150 z-10 opacity-100 visible">
                          <Suspense fallback={<PanelSkeleton />}><ReplModeContent /></Suspense>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Resizer */}
                  <div
                    className={`transition-all duration-300 flex-shrink-0 relative group flex items-center justify-center
                      ${layoutOrientation === 'vertical'
                        ? 'h-2.5 w-full cursor-ns-resize'
                        : 'w-2.5 h-full cursor-ew-resize'}
                      ${isResizing ? 'bg-blue-500/20' : 'bg-slate-200/40 dark:bg-slate-800/50 hover:bg-blue-500/10'}`}
                    onMouseDown={handleMouseDown}
                    style={{ order: 1 }}
                  >
                    <div className={`rounded-full transition-all duration-500
                      ${layoutOrientation === 'vertical'
                        ? (isResizing
                            ? 'bg-blue-500 w-24 h-1 shadow-[0_0_15px_rgba(59,130,246,0.6)]'
                            : 'bg-slate-400/60 dark:bg-slate-500/40 w-12 h-1 group-hover:bg-blue-400 group-hover:w-20')
                        : (isResizing
                            ? 'bg-blue-500 h-20 w-1 shadow-[0_0_15px_rgba(59,130,246,0.6)]'
                            : 'bg-slate-400/60 dark:bg-slate-500/40 h-10 w-1 group-hover:bg-blue-400 group-hover:h-16')}`}
                    />
                  </div>

                  {/* ── OutputPanel (right / bottom side) ── */}
                  <div style={layoutOrientation === 'vertical' ? {
                    height: `calc(${inspectorHeight * 100}% - 4px)`,
                    flex: `0 0 calc(${inspectorHeight * 100}% - 4px)`,
                    maxHeight: `calc(${inspectorHeight * 100}% - 4px)`,
                    width: '100%',
                    maxWidth: '100%',
                    order: isLayoutSwapped ? 0 : 2
                  } : {
                    width: `calc(${inspectorWidth * 100}% - 4px)`,
                    flex: `0 0 calc(${inspectorWidth * 100}% - 4px)`,
                    maxWidth: `calc(${inspectorWidth * 100}% - 4px)`,
                    height: '100%',
                    order: isLayoutSwapped ? 0 : 2
                  }} className={`flex flex-col overflow-hidden min-w-0 min-h-0 ${
                    layoutOrientation === 'vertical'
                      ? (isLayoutSwapped ? 'border-b border-slate-200 dark:border-gray-700' : 'border-t border-slate-200 dark:border-gray-700')
                      : (isLayoutSwapped ? 'border-r border-slate-200 dark:border-gray-700' : 'border-l border-slate-200 dark:border-gray-700')
                  }`}>
                    <OutputPanel />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
