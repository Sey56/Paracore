import { useState, useEffect, useMemo, useCallback } from 'react';
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

  const [ParacoreConnected, setParacoreConnected] = useState<boolean>(false);
  const [revitStatus, setRevitStatus] = useState<RevitStatus>(initialRevitStatus);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await api.get("/api/status");
      
      const newParacoreConnected = response.data.paracoreConnected;
      setParacoreConnected(prev => prev !== newParacoreConnected ? newParacoreConnected : prev);

      const newRevitStatus: RevitStatus = {
        isConnected: response.data.revitOpen,
        version: response.data.revitVersion || "",
        document: response.data.documentOpen ? response.data.documentTitle : null,
        documentType: response.data.documentOpen ? response.data.documentType : null,
      };

      setRevitStatus(prev => {
        if (
          prev.isConnected === newRevitStatus.isConnected &&
          prev.version === newRevitStatus.version &&
          prev.document === newRevitStatus.document &&
          prev.documentType === newRevitStatus.documentType
        ) {
          return prev; // Same data, keep stable reference to prevent re-renders
        }
        return newRevitStatus;
      });
    } catch (error) {
      console.error("[RAP] Failed to fetch status:", error);
      setParacoreConnected(prev => prev ? false : prev);
      setRevitStatus(prev => {
        if (!prev.isConnected && prev.document === null) return prev;
        return initialRevitStatus;
      });
    }
  }, [initialRevitStatus]);

  useEffect(() => {
    fetchStatus();
    const intervalId = setInterval(fetchStatus, 5000);
    return () => clearInterval(intervalId);
  }, [fetchStatus]);

  const contextValue = useMemo(() => ({
    ParacoreConnected,
    revitStatus,
  }), [ParacoreConnected, revitStatus]);

  return (
    <RevitContext.Provider value={contextValue}>
      {children}
    </RevitContext.Provider>
  );
};
