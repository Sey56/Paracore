import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars, faCog, faQuestionCircle, faSun, faMoon } from '@fortawesome/free-solid-svg-icons';
import { useUI } from '@/hooks/useUI';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { useTheme } from '@/context/ThemeContext';

import { useAuth } from '@/hooks/useAuth';
import { useScripts } from '@/hooks/useScripts';
import React, { useState, useRef, useEffect } from 'react';
import { UserMenu } from './UserMenu';
import { Workspace } from '@/types';
import { Modal } from '@/components/common/Modal'; // Import Modal component
import { shell } from '@tauri-apps/api'; // Import shell

export const TopBar: React.FC = () => {
  const { toggleSidebar, openSettingsModal } = useUI();
  const { rserverConnected, revitStatus } = useRevitStatus();
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated, user, login, logout, activeTeam } = useAuth();
  const { loadScriptsForFolder } = useScripts();

  const [isHelpDropdownOpen, setIsHelpDropdownOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const helpDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (helpDropdownRef.current && !helpDropdownRef.current.contains(event.target as Node)) {
        setIsHelpDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleHelpClick = async () => {
    await shell.open('https://paracore-help.netlify.app');
    setIsHelpDropdownOpen(false);
  };

  const handleAboutClick = () => {
    setIsAboutModalOpen(true);
    setIsHelpDropdownOpen(false);
  };

  const getConnectionStatusText = () => {
    if (!rserverConnected) {
      return "RServer Disconnected";
    }
    const parts = ["RServer Connected"];
    if (revitStatus.version) {
      parts.push(`Revit ${revitStatus.version}`);
    }
    if (revitStatus.document) {
      parts.push(revitStatus.document);
    }
    if (revitStatus.documentType && revitStatus.documentType !== 'None') {
      parts.push(revitStatus.documentType);
    }
    return parts.join(' | ');
  };

  const getConnectionStatusColorClass = () => {
    if (!rserverConnected) {
      return "bg-red-500";
    }
    return "bg-green-500";
  };

  return (
    <div className="bg-white dark:bg-gray-800 shadow-lg p-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center space-x-4">
        <button onClick={toggleSidebar} className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white">
          <FontAwesomeIcon icon={faBars} className="text-xl" />
        </button>
        <div className="flex items-center space-x-1">
          <img src="/Paracore.png" alt="Paracore Logo" className="h-8 w-auto" />
          <h1 className="font-bold text-lg text-gray-800 dark:text-gray-100">Paracore</h1>
        </div>
        <button
          onClick={toggleTheme}
          className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          <FontAwesomeIcon icon={theme === 'dark' ? faSun : faMoon} />
        </button>
      </div>

      {/* Connection Status - Hidden on mobile, shown on larger screens */}
      <div className={`hidden md:flex items-center text-sm px-3 py-1.5 rounded-full ${!rserverConnected ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300" : "bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300"}`}>
        <span className={`w-2.5 h-2.5 rounded-full ${getConnectionStatusColorClass()} mr-2`}></span>
        <span className="font-medium">{getConnectionStatusText()}</span>
      </div>

      <div className="flex items-center space-x-2">
        <div className="action-icons flex items-center space-x-2 border-r border-gray-200 dark:border-gray-700 pr-4">
          <div className="relative" ref={helpDropdownRef}>
            <button
              onClick={() => setIsHelpDropdownOpen(!isHelpDropdownOpen)}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <FontAwesomeIcon icon={faQuestionCircle} />
            </button>
            {isHelpDropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-700 rounded-md shadow-lg z-10 py-1">
                <button
                  onClick={handleHelpClick}
                  className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 w-full text-left"
                >
                  Help
                </button>
                <button
                  onClick={handleAboutClick}
                  className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 w-full text-left"
                >
                  About
                </button>
              </div>
            )}
          </div>
          <button onClick={openSettingsModal} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
            <FontAwesomeIcon icon={faCog} />
          </button>
        </div>
        <div className="flex items-center space-x-2 pl-2">
          <UserMenu user={user} onLogin={login} onLogout={logout} />
        </div>
      </div>

      {/* About Modal */}
      <Modal isOpen={isAboutModalOpen} onClose={() => setIsAboutModalOpen(false)} title="About Paracore" size="sm">
        <div className="p-4 text-gray-700 dark:text-gray-200">
          <p className="mb-2"><strong>Paracore - Revit Automation Platform</strong></p>
          <p className="mb-2">Version: 1.0.0 (Beta)</p>
          <p className="mb-2">Developed by: Paras Codarch</p>
          <p className="mb-2">For more information, visit our <a href="https://paracore-help.netlify.app" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">documentation</a>.</p>
        </div>
      </Modal>
    </div>
  );
};