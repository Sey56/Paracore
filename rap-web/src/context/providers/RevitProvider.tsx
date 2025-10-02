import { useState, useEffect, useMemo } from 'react';
import { RevitContext } from './RevitContext';
import type { RevitStatus } from '@/types';
import { useNotifications } from '@/hooks/useNotifications';
import api from '@/api/axios';

export const RevitProvider = ({ children }: { children: React.ReactNode }) => {
  const { showNotification } = useNotifications();
  const initialRevitStatus: RevitStatus = useMemo(() => ({
    isConnected: false,
    version: "",
    document: null,
    documentType: null,
  }), []);
  const [rserverConnected, setRserverConnected] = useState<boolean>(false);
  const [revitStatus, setRevitStatus] = useState<RevitStatus>(initialRevitStatus);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await api.get("/api/status");

        setRserverConnected(response.data.rserverConnected);
        
        const newRevitStatus: RevitStatus = {
          isConnected: response.data.revitOpen,
          version: response.data.revitVersion || "",
          document: response.data.documentOpen ? response.data.documentTitle : null,
          documentType: response.data.documentOpen ? response.data.documentType : null,
        };
        setRevitStatus(newRevitStatus);

        if (!response.data.rserverConnected) {
          // showNotification("RServer is not connected.", "warning", 3000);
        } else if (!response.data.revitOpen) {
          // showNotification("Revit is not open.", "warning", 3000);
        } else if (!response.data.documentOpen) {
          // showNotification("No Revit document is open.", "warning", 3000);
        } else {
          // showNotification("RServer and Revit are connected.", "success", 3000);
        }
      } catch (error) {
        console.error("[RAP] Failed to fetch status:", error);
        showNotification("Failed to fetch RServer status.", "error");
        setRserverConnected(false);
        setRevitStatus(initialRevitStatus);
      }
    };

    fetchStatus();
    const intervalId = setInterval(fetchStatus, 5000);

    return () => clearInterval(intervalId);
  }, [initialRevitStatus, showNotification]);

  const contextValue = {
    rserverConnected,
    revitStatus,
  };

  return (
    <RevitContext.Provider value={contextValue}>{children}</RevitContext.Provider>
  );
};