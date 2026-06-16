import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBars, faCog, faQuestionCircle, faSun, faMoon, faCircleHalfStroke, faRobot, faRectangleList, faCode, faListUl, faExchangeAlt, faHouse, faThLarge } from '@fortawesome/free-solid-svg-icons';
import { useUI } from '@/hooks/useUI';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { useTheme } from '@/context/ThemeContext';
import { useNotifications } from '@/hooks/useNotifications';

import { useAuth } from '@/features/auth';
import { useScripts } from '@/features/automation';
import React, { useState, useRef, useEffect } from 'react';
import { UserMenu } from './UserMenu';
import { Modal } from '@/components/common/Modal';
import { shell } from '@tauri-apps/api';
import packageJson from '../../../../package.json';

export const TopBar: React.FC = () => {
  const { toggleSidebar, openSettingsModal, activeMainView, setActiveMainView, isLayoutSwapped, toggleLayoutSwap, openWelcomeGate, automationSubMode, setAutomationSubMode } = useUI();
  const { ParacoreConnected, revitStatus } = useRevitStatus();
  const { theme, toggleTheme } = useTheme();
  const { isAuthenticated, user, login, loginLocal, logout, activeTeam } = useAuth();
  const { loadScriptsForFolder, toolLibraryPath } = useScripts();
  const { showNotification } = useNotifications();

  const [isHelpDropdownOpen, setIsHelpDropdownOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const helpDropdownRef = useRef<HTMLDivElement>(null);

  const handleAgentModeClick = () => {
    setActiveMainView('agent');
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
    <div 
      className="h-16 border-b border-slate-200 dark:border-slate-700/50 shadow-sm flex items-center justify-between px-4 z-40 relative tooltip-bottom"
      style={{ 
        backgroundColor: theme === 'eclipse' ? 'var(--bg-card)' : undefined,
        backdropFilter: theme === 'eclipse' ? 'none' : undefined
      }}
    >
      {/* 1. Logo & Sidebar Toggle Cluster */}
      <div className="flex items-center gap-4">
        <button
          onClick={toggleSidebar}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-300 active:scale-95 tooltip-right"
          title="Toggle Sidebar"
        >
          <FontAwesomeIcon icon={faBars} className="text-lg" />
        </button>

        <div className="flex items-center gap-2 pr-4 border-r border-slate-100 dark:border-slate-800">
          <img src="/RAP.png" alt="Paracore Logo" className="h-7 w-auto drop-shadow-sm" />
          <h1 className="font-black text-sm text-slate-800 dark:text-white tracking-[0.15em] uppercase">
            Paracore
          </h1>
        </div>

        {/* Theme Toggle - Integrated Three-Way Cycle */}
        <button
          onClick={toggleTheme}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90
            ${theme === 'light' ? 'text-amber-500 hover:bg-amber-50' :
              theme === 'midnight' ? 'text-blue-400 hover:bg-blue-900/20' :
                'text-slate-400 hover:bg-slate-800'}`}
          title={theme.charAt(0).toUpperCase() + theme.slice(1)}
        >
          <FontAwesomeIcon
            icon={theme === 'light' ? faSun : theme === 'midnight' ? faMoon : faCircleHalfStroke}
            className="text-sm"
          />
        </button>
      </div>

      {/* 2. Central Navigation Center (Segmented Switcher) */}
      <div className="hidden lg:flex items-center p-1 bg-slate-100/50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 shadow-inner">
        {[
          { id: 'scripts', label: 'Scripts', icon: faRectangleList },
          { id: 'agent', label: 'Agent', icon: faRobot },
          { id: 'playlists', label: 'Playlists', icon: faListUl }
        ].map(nav => {
          const isActive = activeMainView === nav.id;

          return (
            <button
              key={nav.id}
              onClick={() => {
                if (nav.id === 'agent') handleAgentModeClick();
                else setActiveMainView(nav.id as 'scripts' | 'agent' | 'playlists');
              }}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all duration-300
                ${isActive
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-md scale-[1.02]'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
            >
              <FontAwesomeIcon icon={nav.icon} className={isActive ? 'text-blue-500' : ''} />
              {nav.label}
            </button>
          );
        })}

        {/* Automation Sub-mode Toggle — only visible when Automation is active */}
        {activeMainView === 'scripts' && (
          <button
            onClick={() => setAutomationSubMode(automationSubMode === 'gallery' ? 'repl' : 'gallery')}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all duration-300 text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 border-l border-slate-200 dark:border-slate-700/50 ml-1 pl-5"
            title={automationSubMode === 'gallery' ? 'Switch to REPL Playground' : 'Switch to Script Gallery'}
          >
            <FontAwesomeIcon
              icon={automationSubMode === 'gallery' ? faThLarge : faCode}
              className="text-purple-500"
            />
            {automationSubMode === 'gallery' ? 'Gallery' : 'REPL'}
          </button>
        )}
      </div>

      {/* 3. Status & System Cluster */}
      <div className="flex items-center gap-3">
        {/* Connection Status Badge (Live Feed Style) */}
        <div className={`hidden xl:flex items-center gap-2.5 px-3 py-1.5 rounded-xl border transition-all duration-500 shadow-sm
          ${!ParacoreConnected
            ? "bg-rose-50 border-rose-100 dark:bg-rose-900/20 dark:border-rose-800/50 text-rose-600 dark:text-rose-400"
            : "bg-emerald-50 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800/50 text-emerald-600 dark:text-emerald-400"
          }`}>
          <div className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${!ParacoreConnected ? 'bg-rose-400' : 'bg-emerald-400'}`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${!ParacoreConnected ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
          </div>
          <span className="text-[11px] font-bold uppercase tracking-tight">
            {ParacoreConnected ? 'Connected' : 'Disconnected'}
          </span>
          {ParacoreConnected && revitStatus.document && (
            <div className="flex items-center gap-2 border-l border-slate-200 dark:border-slate-700 ml-1 pl-2">
              <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 truncate max-w-[120px] lowercase italic">
                {revitStatus.document}
              </span>
            </div>
          )}
        </div>

        <div className="h-8 w-px bg-slate-100 dark:bg-slate-800 mx-1" />

        <div className="flex items-center gap-1">
          <button
            onClick={toggleLayoutSwap}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all
              ${isLayoutSwapped ? 'text-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
            title="Swap Panels"
          >
            <FontAwesomeIcon icon={faExchangeAlt} className={isLayoutSwapped ? "rotate-180 transition-transform duration-500" : "transition-transform duration-500"} />
          </button>

          <button
            onClick={openWelcomeGate}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
            title="Home"
          >
            <FontAwesomeIcon icon={faHouse} className="text-sm" />
          </button>

          <div className="relative" ref={helpDropdownRef}>
            <button
              onClick={() => setIsHelpDropdownOpen(!isHelpDropdownOpen)}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-all"
              title="Help & About"
            >
              <FontAwesomeIcon icon={faQuestionCircle} />
            </button>
            {isHelpDropdownOpen && (
              <div className="absolute right-0 mt-3 w-48 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 py-2 animate-in slide-in-from-top-2 duration-200">
                <button onClick={handleHelpClick} className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 w-full text-left transition-colors">
                  Online Help
                </button>
                <button onClick={handleAboutClick} className="flex items-center gap-3 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 w-full text-left transition-colors">
                  About Paracore
                </button>
              </div>
            )}
          </div>

          <button 
            onClick={openSettingsModal} 
            disabled={!isAuthenticated}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${!isAuthenticated ? 'text-slate-200 dark:text-slate-700 cursor-not-allowed' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
            title={isAuthenticated ? "Settings" : "Settings (Sign in to access)"}
          >
            <FontAwesomeIcon icon={faCog} />
          </button>
        </div>

        <div className="pl-3 border-l border-slate-100 dark:border-slate-800">
          <UserMenu user={user} onLogin={login} onLoginLocal={loginLocal} onLogout={logout} />
        </div>
      </div>

      {/* About Modal - Minimalist Redesign */}
      <Modal isOpen={isAboutModalOpen} onClose={() => setIsAboutModalOpen(false)} title="About Paracore" size="sm">
        <div className="p-10 space-y-8 text-center bg-white dark:bg-slate-900">
          <div className="flex flex-col items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center shadow-xl shadow-blue-500/20 active:scale-95 transition-transform">
              <img src="/RAP.png" alt="Paracore Logo" className="h-8 w-auto brightness-0 invert" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-[0.25em]">Paracore</h2>
              <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mt-1.5">High-Performance BIM Automations</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            <div className="flex justify-between items-center px-5 py-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/50">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">App Engine</span>
              <span className="text-[13px] font-black text-slate-700 dark:text-slate-200 font-mono">v{packageJson.version}</span>
            </div>
            <div className="flex justify-between items-center px-5 py-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/50">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Revit Addin</span>
              <span className="text-[13px] font-black text-slate-700 dark:text-slate-200 font-mono">v{packageJson.version}</span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex flex-col gap-1 text-center">
              <span className="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-[0.2em]">Developed By</span>
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Paras Codarch (Ethiopia)</span>
            </div>

            <button
              onClick={() => shell.open('https://sey56.github.io/paracore-help')}
              className="w-full py-3.5 bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.25em] shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              Documentation
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
