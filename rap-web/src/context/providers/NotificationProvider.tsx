import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { nanoid } from 'nanoid';
import type { Notification } from '@/types';
import { NotificationContext } from './NotificationContext';

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const hideNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const showNotification = useCallback((message: string, type: Notification['type'] = 'info', duration: number = 5000) => {
    const id = nanoid();
    const newNotification: Notification = { id, message, type, duration };
    setNotifications((prev) => [...prev, newNotification]);

    if (duration > 0) {
      setTimeout(() => hideNotification(id), duration);
    }
  }, [hideNotification]);

  const clearNotification = useCallback((id: string) => {
    hideNotification(id);
  }, [hideNotification]);

  const contextValue = useMemo(() => ({
    notifications,
    showNotification,
    clearNotification,
  }), [notifications, showNotification, clearNotification]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
};
