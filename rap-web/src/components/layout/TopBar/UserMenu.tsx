import React, { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUserCircle, faSignOutAlt } from '@fortawesome/free-solid-svg-icons';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';

interface User {
  name?: string;
  email?: string;
  picture?: string;
}

interface UserMenuProps {
  user: User | null;
  onLogin: (credentialResponse: CredentialResponse) => void;
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

export const UserMenu: React.FC<UserMenuProps> = ({ user, onLogin, onLogout }) => {
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
        <GoogleLogin
          onSuccess={(credentialResponse) => {
            console.log(credentialResponse);
            onLogin(credentialResponse);
          }}
          onError={() => {
            console.log('Login Failed');
          }}
        />
      )}

      {isOpen && user && (
        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 z-50">
          <div className="px-4 py-2 text-sm text-gray-700 dark:text-gray-200">
            Signed in as <br />
            <span className="font-medium">{user.name || user.email}</span>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700"></div>
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