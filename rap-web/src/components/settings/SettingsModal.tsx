import React, { useState, useEffect, useMemo } from 'react';
import { useUI } from '@/hooks/useUI';
import { useAuth } from '@/hooks/useAuth';
import { XMarkIcon } from '@heroicons/react/24/outline';
import WorkspaceSettings from './WorkspaceSettings';
import LLMSettings from './LLMSettings'; // Import the new LLMSettings component
import AgentSettings from './AgentSettings'; // Import the new AgentSettings component
import { Modal } from '../common/Modal';
import { Role } from '@/context/authTypes';

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

    // All tabs are now visible, but restricted internally if offline
    if (activeRole !== Role.User) {
      tabs.push({ name: 'Workspaces', component: WorkspaceSettings });
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
  }, [activeRole, openTeamManagementModal]);

  const [activeTab, setActiveTab] = useState<string | null>(
    coreFeaturesTabs.length > 0 ? coreFeaturesTabs[0].name : null
  );

  const ActiveComponent = coreFeaturesTabs.find(tab => tab.name === activeTab)?.component;
  const isOffline = activeTeam?.team_id === 0;

  return (
    <Modal isOpen={isSettingsModalOpen} onClose={closeSettingsModal} title="Settings" size="2xl">
      <div className="flex flex-1 overflow-hidden" style={{ height: '80vh' }}>
        <div className="w-1/4 border-r border-gray-200 dark:border-gray-700 p-6 flex-shrink-0 overflow-y-auto">
          <nav className="flex flex-col space-y-2">
            {/* Core Features Grouping */}
            <h3 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mt-4 mb-1">
              Core Features
            </h3>
            <div className="ml-4 flex flex-col space-y-2">
              {coreFeaturesTabs.map((tab: TabItem) => (
                <button
                  key={tab.name}
                  onClick={tab.onClick || (() => setActiveTab(tab.name))}
                  disabled={tab.disabled}
                  className={`px-4 py-2.5 text-sm font-medium text-left rounded-lg transition-colors ${activeTab === tab.name && !tab.onClick
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    } ${tab.disabled ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                >
                  {tab.name}
                </button>
              ))}
            </div>
          </nav>
        </div>

        <div className="flex-1 p-8 overflow-y-auto">
          {ActiveComponent && (
            <>
              {isOffline && activeTab !== 'LLM Settings' ? (
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
                  isAuthenticated={isAuthenticated} 
                  isReadOnly={activeTab === 'LLM Settings' ? false : isOffline} 
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
