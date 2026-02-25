import React, { useEffect, useRef, Component, ErrorInfo, ReactNode } from 'react';
import { Command, Child } from '@tauri-apps/api/shell';
import { appWindow } from '@tauri-apps/api/window';
import { process } from '@tauri-apps/api';
import { resolveResource } from '@tauri-apps/api/path';
import { AppLayout } from "@/components/layout/AppLayout";
import { SentinelControlList } from "@/features/automation/components/SentinelControlList";
import NotificationDisplay from "@/components/common/NotificationDisplay";
import { AppProvider } from "@/context/AppProvider"; // Import the main AppProvider

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

  useEffect(() => {
    // Register a listener for the window close request
    const unlisten = appWindow.onCloseRequested(async (event) => {
      if (isSentinelControl) {
        // Detached sentinel window: just hide, don't kill the app
        event.preventDefault();
        await appWindow.hide();
      } else {
        // Main window: exit entire app
        process.exit(0);
      }
    });

    // Cleanup on component unmount
    return () => {
      unlisten.then(f => f()); // Unlisten the close request
    };
  }, []);

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
