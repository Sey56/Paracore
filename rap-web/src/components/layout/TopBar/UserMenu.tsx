import React, { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSignOutAlt } from '@fortawesome/free-solid-svg-icons';
import { SessionTimer } from './SessionTimer';

interface User {
  name?: string;
  email?: string;
  picture?: string;
}

interface UserMenuProps {
  user: User | null;
  onLogin: () => void;
  onLoginLocal: () => void;
  onLogout: () => void;
}

const getUserInitials = (name: string | undefined, email: string | undefined) => {
  if (name) {
    const parts = name.split(' ');
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  if (email) {
    return email.charAt(0).toUpperCase();
  }
  return '';
};

export const UserMenu: React.FC<UserMenuProps> = ({ user, onLogin, onLoginLocal, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const toggleMenu = () => setIsOpen(!isOpen);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      {user ? (
        <button onClick={toggleMenu} className="flex items-center focus:outline-none">
          {user.picture ? (
            <img src={user.picture} alt={user.name} className="w-8 h-8 rounded-full" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-medium">
              {getUserInitials(user.name, user.email)}
            </div>
          )}
        </button>
      ) : (
        <div className="flex items-center space-x-2">
          <button
            onClick={onLoginLocal}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none text-sm font-medium transition-colors duration-200"
          >
            Continue Offline
          </button>
          <button
            onClick={onLogin}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 text-sm font-medium transition-colors duration-200"
          >
            Sign in with Google
          </button>
        </div>
      )}

      {isOpen && user && (
        <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 z-50">
          <div className="px-4 py-2 text-sm text-gray-700 dark:text-gray-200">
            Signed in as <br />
            <span className="font-medium">{user.name || user.email}</span>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
          <SessionTimer />
          <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>
          <button
            onClick={() => {
              onLogout();
              setIsOpen(false);
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
          >
            <FontAwesomeIcon icon={faSignOutAlt} className="mr-2" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
};