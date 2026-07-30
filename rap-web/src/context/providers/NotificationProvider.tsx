import React, { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { NotificationContext } from './NotificationContext';

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const showNotification = useCallback((message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', _duration?: number) => {
    toast(String(message), {
      description: type === 'error' ? undefined : undefined,
    });
  }, []);

  const clearNotification = useCallback((id: string) => {
    toast.dismiss(id);
  }, []);

  const contextValue = useMemo(() => ({
    notifications: [], // Sonner handles rendering; keep for API compatibility
    showNotification,
    clearNotification,
  }), [showNotification, clearNotification]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
};
