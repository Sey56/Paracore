import React from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import { XMarkIcon } from '@heroicons/react/20/solid';

const NotificationDisplay: React.FC = () => {
  const { notifications, clearNotification } = useNotifications();

  const getNotificationClasses = (type: string) => {
    switch (type) {
      case 'success':
        return { bg: 'bg-green-500', text: 'text-white', button: 'text-white hover:bg-green-600' };
      case 'error':
        return { bg: 'bg-red-500', text: 'text-white', button: 'text-white hover:bg-red-600' };
      case 'info':
        return { bg: 'bg-blue-500', text: 'text-white', button: 'text-white hover:bg-blue-600' };
      case 'warning':
        return { bg: 'bg-yellow-400', text: 'text-black', button: 'text-black hover:bg-yellow-500' };
      default:
        return { bg: 'bg-gray-700', text: 'text-white', button: 'text-white hover:bg-gray-800' };
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[1000] w-full max-w-sm space-y-3 pointer-events-none">
      {notifications.map((notification) => {
        const classes = getNotificationClasses(notification.type);
        return (
          <div
            key={notification.id}
            className={`relative p-4 rounded-lg shadow-2xl flex items-center justify-between transform transition-all duration-300 ease-out pointer-events-auto ${classes.bg} ${classes.text}`}
          >
            <p className="text-sm font-medium flex-grow pr-4">{String(notification.message)}</p>
            <button
              onClick={() => clearNotification(notification.id)}
              className={`ml-4 flex-shrink-0 rounded-md p-1 inline-flex focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 ${classes.button}`}
            >
              <span className="sr-only">Dismiss</span>
              <XMarkIcon className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default NotificationDisplay;
