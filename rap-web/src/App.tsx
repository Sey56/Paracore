import React from 'react';
import { AppLayout } from "@/components/layout/AppLayout";
import NotificationDisplay from "@/components/common/NotificationDisplay";
import { AppProvider } from "@/context/AppProvider"; // Import the main AppProvider

function AppContent() {
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
