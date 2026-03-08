import React, { useEffect, useRef, useState, Component, ErrorInfo, ReactNode } from 'react';
import { Command, Child } from '@tauri-apps/api/shell';
import { appWindow } from '@tauri-apps/api/window';
import { process as tauriProcess } from '@tauri-apps/api';
import { resolveResource } from '@tauri-apps/api/path';
import { AppLayout } from "@/components/layout/AppLayout";
import { SentinelControlList } from "@/features/automation/components/SentinelControlList";
import NotificationDisplay from "@/components/common/NotificationDisplay";
import { AppProvider } from "@/context/AppProvider"; // Import the main AppProvider
import { useWatchdog } from "@/context/providers/WatchdogProvider";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldHeart, faSpinner } from '@fortawesome/free-solid-svg-icons';

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Caught fatal error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-white p-10 text-center">
          <h1 className="text-2xl font-bold text-rose-500 mb-4">Critical System Failure</h1>
          <p className="text-slate-400 mb-6 max-w-md">Paracore encountered a fatal error and could not continue. This might be due to a configuration mismatch or a backend crash.</p>
          <pre className="bg-slate-800 p-4 rounded-lg text-left text-xs text-rose-300 overflow-auto max-w-full mb-8">
            {this.state.error?.message}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-full font-bold transition-all"
          >
            Attempt System Restart
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

function AppContent() {
  const rapServerProcess = useRef<Child | null>(null); // Ref to store the rap-server process
  const isSentinelControl = appWindow.label === 'sentinel-control';
  const { decommissionAll, watchdogSources, deployedDocumentMap, watchdogs, failedWatchdogs } = useWatchdog();
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const isShuttingDownRef = useRef(false);

  useEffect(() => {
    // Register a listener for the window close request
    const unlisten = appWindow.onCloseRequested(async (event) => {
      if (isSentinelControl) {
        // Detached sentinel window: just hide, don't kill the app
        event.preventDefault();
        await appWindow.hide();
      } else {
        // Main window: gracefully undeploy sentinels before exit
        if (isShuttingDownRef.current) {
          // Prevent multiple triggerings if they spam the close button
          event.preventDefault();
          return;
        }

        // Prevent immediate close
        event.preventDefault();

        const hasActiveSentinels = watchdogs.length > 0 || failedWatchdogs.length > 0 || watchdogSources.length > 0 || Object.keys(deployedDocumentMap).length > 0;

        if (hasActiveSentinels) {
          setIsShuttingDown(true);
          isShuttingDownRef.current = true;

          try {
            // Race decommissionAll against a 4-second timeout to ensure the app doesn't hang forever
            await Promise.race([
              decommissionAll(),
              new Promise(resolve => setTimeout(resolve, 4000))
            ]);
          } catch (error) {
            console.error("Error undeploying sentinels during shutdown:", error);
          }
        }

        // Final exit - this triggers the Tauri Rust backend to kill the sidecar
        tauriProcess.exit(0);
      }
    });

    // Cleanup on component unmount
    return () => {
      unlisten.then(f => f()); // Unlisten the close request
    };
  }, [decommissionAll, watchdogs, failedWatchdogs, watchdogSources, deployedDocumentMap]);

  return (
    <React.Fragment>
      {isSentinelControl ? (
        <div className="h-screen flex flex-col bg-slate-900">
          {/* Header for detached sentinel window */}
          <div className="p-5 pb-3 border-b border-white/5 flex items-center justify-between select-none" data-tauri-drag-region>
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.25em] flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-pulse" />
              Sentinel Control
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <SentinelControlList isDetached />
          </div>
        </div>
      ) : (
        <AppLayout />
      )}

      {/* Graceful Shutdown Gate Overlay */}
      {isShuttingDown && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-white/95 dark:bg-black/60 backdrop-blur-[100px] transition-all duration-300">
          <div className="flex flex-col items-center space-y-8 p-12 rounded-[3rem] bg-white/60 dark:bg-slate-800/40 border border-slate-200/50 dark:border-slate-600/50 shadow-2xl max-w-sm text-center backdrop-blur-md">
            <div className="relative">
              <div className="absolute inset-0 rounded-[2rem] bg-amber-500/20 animate-ping"></div>
              <div className="relative bg-amber-500 rounded-[2rem] p-5 shadow-lg shadow-amber-500/30 dark:shadow-amber-900/40">
                <FontAwesomeIcon icon={faShieldHeart} className="text-white text-3xl opacity-80" />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wide">Closing Paracore</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">Undeploying sentinels and closing server...</p>
            </div>
            <div className="flex items-center space-x-2 text-amber-500 dark:text-amber-400 font-black text-xs uppercase tracking-widest justify-center"><FontAwesomeIcon icon={faSpinner} spin /><span>Shutting down...</span></div>
          </div>
        </div>
      )}

      {!isSentinelControl && <NotificationDisplay />}
    </React.Fragment>
  );
}

function App() {
  return (
    <AppProvider>
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </AppProvider>
  );
}

export default App;
