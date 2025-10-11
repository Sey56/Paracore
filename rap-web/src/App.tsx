import React, { useEffect, useRef } from 'react';
import { Command, Child } from '@tauri-apps/api/shell';
import { appWindow } from '@tauri-apps/api/window';
import { process } from '@tauri-apps/api';
import { resolveResource } from '@tauri-apps/api/path';
import { AppLayout } from "@/components/layout/AppLayout";
import NotificationDisplay from "@/components/common/NotificationDisplay";
import { AppProvider } from "@/context/AppProvider"; // Import the main AppProvider

function AppContent() {
  const rapServerProcess = useRef<Child | null>(null); // Ref to store the rap-server process

  useEffect(() => {
    const stopRapServer = async () => {
      if (rapServerProcess.current) {
        console.log('Attempting to kill rap-server with pid:', rapServerProcess.current.pid);
        await rapServerProcess.current.kill();
        console.log('rap-server killed.');
      }
    };

    // Register a listener for the window close request
    const unlisten = appWindow.onCloseRequested(async () => {
      process.exit(0); // Exit the Tauri app gracefully
    });

    // Cleanup on component unmount
    return () => {
      unlisten.then(f => f()); // Unlisten the close request
    };
  }, []);

  return (
    <React.Fragment>
      <AppLayout />
      <NotificationDisplay />
    </React.Fragment>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
