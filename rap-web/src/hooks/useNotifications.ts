import { useContext } from 'react';
import { NotificationContext, NotificationContextProps } from '@/context/providers/NotificationContext';

export const useNotifications = (): NotificationContextProps => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export default useNotifications;