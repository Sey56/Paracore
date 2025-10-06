import React, { useEffect, useRef } from 'react';
import { Command } from '@tauri-apps/api/shell';
import { appWindow } from '@tauri-apps/api/window';
import { process } from '@tauri-apps/api';
import { AppLayout } from "@/components/layout/AppLayout";
import NotificationDisplay from "@/components/common/NotificationDisplay";
import { AppProvider } from "@/context/AppProvider"; // Import the main AppProvider

function AppContent() {
  const rapServerProcess = useRef<any>(null); // Ref to store the rap-server process

  useEffect(() => {
    const startRapServer = async () => {
      try {
        console.log('Attempting to start rap-server...');
        // The path to the rap-server is relative to the bundled app executable
        const command = new Command('rap-server.exe');
        const child = await command.spawn();
        rapServerProcess.current = child; // Store the child process
        console.log('rap-server started successfully with pid:', child.pid);
      } catch (e) {
        console.error('Failed to start rap-server:', e);
      }
    };

    const stopRapServer = async () => {
      if (rapServerProcess.current) {
        console.log('Attempting to kill rap-server with pid:', rapServerProcess.current.pid);
        await rapServerProcess.current.kill();
        console.log('rap-server killed.');
      }
    };

    startRapServer();

    // Register a listener for the window close request
    const unlisten = appWindow.onCloseRequested(async () => {
      await stopRapServer();
      process.exit(0); // Exit the Tauri app gracefully
    });

    // Cleanup on component unmount
    return () => {
      unlisten.then(f => f()); // Unlisten the close request
      stopRapServer(); // Ensure rap-server is stopped if component unmounts unexpectedly
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
