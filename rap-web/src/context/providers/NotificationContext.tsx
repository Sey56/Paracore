
import { createContext } from 'react';
import type { Notification } from '@/types';

export interface NotificationContextProps {
  notifications: Notification[];
  showNotification: (message: string, type: Notification['type'], duration?: number) => void;
  clearNotification: (id: string) => void;
}

export const NotificationContext = createContext<NotificationContextProps | undefined>(undefined);
