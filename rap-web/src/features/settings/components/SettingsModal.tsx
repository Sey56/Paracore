
import React, { useState, useEffect, useMemo } from 'react';
import { useUI } from '@/hooks/useUI';
import { useAuth } from '@/features/auth';
import TeamSourceSettings from '@/features/team-sources/components/TeamSourceSettings';
import LLMSettings from './LLMSettings';
import { WatchdogSettings } from './WatchdogSettings';
import { AutomationSettings } from './AutomationSettings';
import AgentSettings from './AgentSettings';
import { Modal } from '@/components/common/Modal';
import { Role } from '@/features/auth';

interface TabComponentProps {
  isAuthenticated: boolean;
  isReadOnly?: boolean;
}

const NoopComponent: React.FC<TabComponentProps> = () => null;

interface TabItem {
  name: string;
  component: React.ComponentType<TabComponentProps>;
  disabled?: boolean;
  onClick?: () => void;
}

const SettingsModal: React.FC = () => {
  const { isSettingsModalOpen, closeSettingsModal, openTeamManagementModal } = useUI();
  const { isAuthenticated, user, activeRole, activeTeam } = useAuth();

  const coreFeaturesTabs = useMemo(() => {
    const tabs: TabItem[] = [];

    tabs.push({
      name: 'Sentinels',
      component: WatchdogSettings,
    });

    tabs.push({
      name: 'Automation',
      component: AutomationSettings,
    });

    // All tabs are now visible, but restricted internally if offline
    if (activeRole !== Role.User) {
      tabs.push({ name: 'Team Sources', component: TeamSourceSettings });
    }

    // Team Management tab
    tabs.push({
      name: 'Team Management',
      component: NoopComponent,
      disabled: activeTeam?.team_id !== 0 && activeRole !== Role.Admin, // Only disable for non-admins when ONLINE
      onClick: activeTeam?.team_id !== 0 ? () => { openTeamManagementModal(); } : undefined // If offline, default behavior (switch tab)
    });

    tabs.push({
      name: 'LLM Settings',
      component: LLMSettings,
    });

    tabs.push({
      name: 'Agent Settings',
      component: AgentSettings,
    });

    return tabs;
  }, [activeRole, openTeamManagementModal, activeTeam]);

  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Set default tab on mount or when tabs change
  useEffect(() => {
    if (!activeTab && coreFeaturesTabs.length > 0) {
      setActiveTab(coreFeaturesTabs[0].name);
    }
  }, [coreFeaturesTabs, activeTab]);

  const ActiveComponent = coreFeaturesTabs.find(tab => tab.name === activeTab)?.component;
  const isOffline = activeTeam?.team_id === 0;

  return (
    <Modal isOpen={isSettingsModalOpen} onClose={closeSettingsModal} title="Settings" size="2xl">
      <div className="flex overflow-hidden max-h-[80vh] animate-in fade-in slide-in-from-bottom-4 duration-500 bg-slate-50 dark:bg-slate-900">
        <div className="w-64 border-r border-slate-200/60 dark:border-slate-800/60 p-6 flex-shrink-0 overflow-y-auto bg-white/50 dark:bg-slate-950/40 backdrop-blur-sm">
          <nav className="flex flex-col space-y-2">
            {/* Core Features Grouping */}
            <h3 className="text-[11px] font-black uppercase text-slate-400 dark:text-slate-500 mt-4 mb-4 tracking-[0.2em] px-4">
              Core Features
            </h3>
            <div className="flex flex-col space-y-1.5">
              {coreFeaturesTabs.map((tab: TabItem) => (
                <button
                  key={tab.name}
                  onClick={tab.onClick || (() => setActiveTab(tab.name))}
                  disabled={tab.disabled}
                  className={`px-5 py-3.5 text-[11px] font-black uppercase tracking-widest text-left rounded-2xl transition-all group relative overflow-hidden ${activeTab === tab.name && !tab.onClick
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-[0_8px_16px_-4px_rgba(0,0,0,0.1)] border border-blue-100/50 dark:border-blue-900/20'
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800'
                    } ${tab.disabled ? 'opacity-30 cursor-not-allowed' : ''
                    } `}
                >
                  <span className="relative z-10">{tab.name}</span>
                </button>
              ))}
            </div>
          </nav>
        </div>

        <div className="flex-1 p-10 overflow-y-auto bg-white/20 dark:bg-slate-950/10">
          {ActiveComponent && (
            <>
              {isOffline && activeTab !== 'LLM Settings' && activeTab !== 'Sentinels' ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-full">
                    <svg className="w-12 h-12 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Cloud Feature Only</h3>
                    <p className="text-gray-600 dark:text-gray-400 max-w-xs mx-auto">
                      Settings for {activeTab} are only available when signed in with a Cloud Team account.
                    </p>
                  </div>
                </div>
              ) : (
                <ActiveComponent
                  isAuthenticated={isAuthenticated || isOffline}
                  isReadOnly={activeTab === 'LLM Settings' || activeTab === 'Sentinels' ? false : isOffline}
                />
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default SettingsModal;
