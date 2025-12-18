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

    // Only add Workspaces tab if the user has the appropriate role
    // REMOVED: && activeTeam?.team_id !== 0 check to allow viewing in Read-Only mode
    if (activeRole !== Role.User) {
      tabs.push({ name: 'Workspaces', component: WorkspaceSettings });
    }

    // Add Team Management tab
    tabs.push({
      name: 'Team Management',
      component: NoopComponent, // This tab opens a modal, so it doesn't render a component in the main view
      // REMOVED: || (activeTeam?.team_id === 0) check to allow viewing in Read-Only mode
      disabled: activeRole !== Role.Admin,
      onClick: () => { openTeamManagementModal(); } // Corrected: Does not close the settings modal
    });

    // Add LLM Settings tab
    tabs.push({
      name: 'LLM Settings',
      component: LLMSettings,
    });

    // Add Agent Settings tab
    tabs.push({
      name: 'Agent Settings',
      component: AgentSettings,
    });

    return tabs;
  }, [activeRole, openTeamManagementModal]); // Removed activeTeam dependency

  const [activeTab, setActiveTab] = useState<string | null>(
    coreFeaturesTabs.length > 0 ? coreFeaturesTabs[0].name : null
  );

  const ActiveComponent = coreFeaturesTabs.find(tab => tab.name === activeTab)?.component;
  const isReadOnly = activeTeam?.team_id === 0;

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
          {ActiveComponent && <ActiveComponent isAuthenticated={isAuthenticated} isReadOnly={isReadOnly} />}
        </div>
      </div>
    </Modal>
  );
};

export default SettingsModal;
