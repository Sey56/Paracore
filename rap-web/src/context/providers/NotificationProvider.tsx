
import { useState, useEffect, useCallback } from 'react';
import { nanoid } from 'nanoid';
import type { Notification } from '@/types';
import { NotificationContext } from './NotificationContext';

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const showNotification = useCallback((message: string, type: Notification['type'], duration: number = 5000) => {
    const id = nanoid();
    setNotifications((prev) => [...prev, { id, message, type, duration }]);
  }, []);

  const clearNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    notifications.forEach((notification) => {
      if (notification.duration) {
        const timer = setTimeout(() => {
          clearNotification(notification.id);
        }, notification.duration);
        return () => clearTimeout(timer);
      }
    });
  }, [notifications, clearNotification]);

  const contextValue = {
    notifications,
    showNotification,
    clearNotification,
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
};
