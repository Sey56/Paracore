import React, { useEffect } from 'react';
import { Command } from '@tauri-apps/api/shell';
import { AppLayout } from "@/components/layout/AppLayout";
import NotificationDisplay from "@/components/common/NotificationDisplay";
import { AppProvider } from "@/context/AppProvider"; // Import the main AppProvider

function AppContent() {

  useEffect(() => {
    const startServer = async () => {
      try {
        console.log('Attempting to start rap-server sidecar...');
        const command = Command.sidecar('rap-server');
        const child = await command.spawn();
        console.log('rap-server sidecar started successfully with pid:', child.pid);
      } catch (e) {
        console.error('Failed to start rap-server sidecar:', e);
      }
    };

    startServer();
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
