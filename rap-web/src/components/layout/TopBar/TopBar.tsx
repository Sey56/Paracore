import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars, faCog, faQuestionCircle, faSun, faMoon, faRobot, faRectangleList, faCode } from '@fortawesome/free-solid-svg-icons';
import { useUI } from '@/hooks/useUI';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { useTheme } from '@/context/ThemeContext';
import { useNotifications } from '@/hooks/useNotifications';

import { useAuth } from '@/hooks/useAuth';
import { useScripts } from '@/hooks/useScripts';
import React, { useState, useRef, useEffect } from 'react';
import { UserMenu } from './UserMenu';
import { Workspace } from '@/types';
import { Modal } from '@/components/common/Modal';
import { shell } from '@tauri-apps/api';

export const TopBar: React.FC = () => {
  const { toggleSidebar, openSettingsModal, activeMainView, setActiveMainView } = useUI();
  const { ParacoreConnected, revitStatus } = useRevitStatus();
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated, user, login, loginLocal, logout, activeTeam } = useAuth();
  const { loadScriptsForFolder, toolLibraryPath } = useScripts();
  const { showNotification } = useNotifications();

  const [isHelpDropdownOpen, setIsHelpDropdownOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const helpDropdownRef = useRef<HTMLDivElement>(null);
  const [hasGeneratedManifest, setHasGeneratedManifest] = useState(false);

  const handleAgentModeClick = async () => {
    setActiveMainView('agent');

    // Trigger manifest generation only once per session when entering Agent Mode
    if (!hasGeneratedManifest && toolLibraryPath) {
      try {
        console.log("Triggering manifest generation...");
        showNotification("Generating script manifest...", "info");
        const response = await fetch('http://localhost:8000/api/manifest/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_scripts_path: toolLibraryPath })
        });
        const data = await response.json();
        console.log("Manifest generation triggered successfully.");
        showNotification(`Script manifest generated successfully! Found ${data.count} scripts.`, "success");
        setHasGeneratedManifest(true);
      } catch (error) {
        console.error("Failed to trigger manifest generation:", error);
        showNotification("Failed to generate manifest.", "error");
      }
    }
  };

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
    await shell.open('https://sey56.github.io/paracore-help');
    setIsHelpDropdownOpen(false);
  };

  const handleAboutClick = () => {
    setIsAboutModalOpen(true);
    setIsHelpDropdownOpen(false);
  };

  const getConnectionStatusText = () => {
    if (!ParacoreConnected) {
      return "Paracore Disconnected";
    }
    const parts = ["Paracore Connected"];
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
    if (!ParacoreConnected) {
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
          <img src="/RAP.png" alt="Paracore Logo" className="h-8 w-auto" />
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
      <div className={`hidden md:flex items-center text-sm px-3 py-1.5 rounded-full ${!ParacoreConnected ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300" : "bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-300"}`}>
        <span className={`w-2.5 h-2.5 rounded-full ${getConnectionStatusColorClass()} mr-2`}></span>
        <span className="font-medium">{getConnectionStatusText()}</span>
      </div>

      <div className="flex items-center space-x-2">
        {/* Agent/Automation Toggle */}
        <button
          onClick={() => setActiveMainView('scripts')}
          className={`p-2 rounded-full transition-colors duration-300 mr-2 ${activeMainView === 'scripts' ? 'bg-blue-500 text-white shadow-md' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          title="Automation Mode"
        >
          <FontAwesomeIcon icon={faRectangleList} />
        </button>
        <button
          onClick={() => {
            if (activeTeam && activeTeam.team_id !== 0) setActiveMainView('generation');
          }}
          disabled={!activeTeam || activeTeam.team_id === 0}
          className={`p-2 rounded-full transition-colors duration-300 mr-2 ${activeMainView === 'generation' ? 'bg-blue-500 text-white shadow-md' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'} ${(!activeTeam || activeTeam.team_id === 0) ? 'opacity-30 cursor-not-allowed' : ''}`}
          title={(!activeTeam || activeTeam.team_id === 0) ? "AI Script Generation (Enterprise Feature)" : "Generation Mode"}
        >
          <FontAwesomeIcon icon={faCode} />
        </button>
        <button
          onClick={() => {
            if (activeTeam && activeTeam.team_id !== 0) handleAgentModeClick();
          }}
          disabled={!activeTeam || activeTeam.team_id === 0}
          className={`p-2 rounded-full transition-colors duration-300 ${activeMainView === 'agent' ? 'bg-blue-500 text-white shadow-md' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'} ${(!activeTeam || activeTeam.team_id === 0) ? 'opacity-30 cursor-not-allowed' : ''}`}
          title={(!activeTeam || activeTeam.team_id === 0) ? "Agentic Mode (Enterprise Feature)" : "Agent Mode"}
        >
          <FontAwesomeIcon icon={faRobot} />
        </button>

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
          <UserMenu user={user} onLogin={login} onLoginLocal={loginLocal} onLogout={logout} />
        </div>
      </div>

      {/* About Modal */}
      <Modal isOpen={isAboutModalOpen} onClose={() => setIsAboutModalOpen(false)} title="About Paracore" size="sm">
        <div className="p-6 space-y-4 text-sm">
          <div className="text-center">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Paracore</h2>
            <p className="text-gray-600 dark:text-gray-400">Revit Automation Platform</p>
          </div>
          <div className="space-y-2 pt-2">
            <div className="flex justify-between">
              <span className="font-medium text-gray-700 dark:text-gray-300">Version:</span>
              <span className="text-gray-600 dark:text-gray-400">2.1.2</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-gray-700 dark:text-gray-300">Developer:</span>
              <span className="text-gray-600 dark:text-gray-400">Paras Codarch (Ethiopia)</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium text-gray-700 dark:text-gray-300">Contact:</span>
              <span className="text-gray-600 dark:text-gray-400">codarch46@gmail.com</span>
            </div>
          </div>
          <div className="pt-4 text-center">
            <a href="https://sey56.github.io/paracore-help" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
              Online Documentation
            </a>
          </div>
        </div>
      </Modal>
    </div>
  );
};
