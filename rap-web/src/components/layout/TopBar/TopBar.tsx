import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars, faCog, faQuestionCircle, faSun, faMoon } from '@fortawesome/free-solid-svg-icons';
import { useUI } from '@/hooks/useUI';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { useTheme } from '@/context/ThemeContext';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useAuth } from '@/hooks/useAuth';
import { useScripts } from '@/hooks/useScripts';
import React from 'react';
import { UserMenu } from './UserMenu';
import { Workspace } from '@/types';

export const TopBar: React.FC = () => {
  const { toggleSidebar, openSettingsModal } = useUI();
  const { rserverConnected, revitStatus } = useRevitStatus();
  const { theme, toggleTheme } = useTheme();
  const { workspaces, setActiveWorkspaceId } = useWorkspaces();
  const { isAuthenticated, user, login, logout } = useAuth();
  const { loadScriptsForFolder } = useScripts();

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
        <h1 className="font-bold text-lg text-gray-800 dark:text-gray-100">RAP</h1>
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
          <button className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
            <FontAwesomeIcon icon={faQuestionCircle} />
          </button>
          <button onClick={openSettingsModal} className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
            <FontAwesomeIcon icon={faCog} />
          </button>
        </div>
        <div className="flex items-center space-x-2 pl-2">
          <UserMenu user={user} onLogin={login} onLogout={logout} />
        </div>
      </div>
    </div>
  );
};