import React, { useState, useEffect, useMemo } from 'react';
import { useUI } from '@/hooks/useUI';
import { useAuth } from '@/hooks/useAuth';
import { XMarkIcon } from '@heroicons/react/24/outline';
import ScriptAutomationSettings from './ScriptAutomationSettings';
import WorkspaceSettings from './WorkspaceSettings';
import { Modal } from '../common/Modal'; // Updated import path
import { Role } from '@/context/authTypes'; // Import Role

interface TabComponentProps {
  isAuthenticated: boolean;
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
  const { isAuthenticated, user, activeRole } = useAuth();

  const scriptAutomationTabs = useMemo(() => {
    const tabs: TabItem[] = [];
    // Only add Workspaces tab if not a user
    if (activeRole !== Role.User) {
      tabs.push({ name: 'Workspaces', component: WorkspaceSettings });
    }
    return tabs;
  }, [activeRole]); // Dependency on activeRole

  const otherTabs = useMemo(() => [
    {
      name: 'Team Management',
      component: NoopComponent, // Use NoopComponent here
      disabled: activeRole !== Role.Admin,
      onClick: () => { closeSettingsModal(); openTeamManagementModal(); }
    },
    { name: 'AI Script Generation', component: () => <div>AI Scripts Settings (Coming Soon)</div>, disabled: true },
    { name: 'Agentic Automation', component: () => <div>Agentic Automation Settings (Coming Soon)</div>, disabled: true },
    { name: 'MCP', component: () => <div>MCP Settings (Coming Soon)</div>, disabled: true },
  ], [activeRole, closeSettingsModal, openTeamManagementModal]);

  const allTabs = useMemo(() => [...scriptAutomationTabs, ...otherTabs], [scriptAutomationTabs, otherTabs]);
  const [activeTab, setActiveTab] = useState<string | null>(scriptAutomationTabs.length > 0 ? scriptAutomationTabs[0].name : null);

  const ActiveComponent = allTabs.find(tab => tab.name === activeTab)?.component;

  return (
    <Modal isOpen={isSettingsModalOpen} onClose={closeSettingsModal} title="Settings" size="2xl">
      <div className="flex flex-1 overflow-hidden" style={{ height: '80vh' }}>
        <div className="w-1/4 border-r border-gray-200 dark:border-gray-700 p-6 flex-shrink-0 overflow-y-auto">
          <nav className="flex flex-col space-y-2">
            {/* Script Automation Grouping */}
            <h3 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mt-4 mb-1">
              Script Automation
            </h3>
            <div className="ml-4 flex flex-col space-y-2">
              {scriptAutomationTabs.map((tab: TabItem) => (
                <button
                  key={tab.name}
                  onClick={() => setActiveTab(tab.name)}
                  disabled={tab.disabled}
                  className={`px-4 py-2.5 text-sm font-medium text-left rounded-lg transition-colors ${
                    activeTab === tab.name
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  } ${
                    tab.disabled ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {tab.name}
                </button>
              ))}
            </div>



            {/* Other Settings */}
            <h3 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mt-4 mb-1">
              General
            </h3>
            <div className="ml-4 flex flex-col space-y-2">
              {otherTabs.map((tab: TabItem) => (
                <button
                  key={tab.name}
                  onClick={tab.onClick || (() => setActiveTab(tab.name))}
                  disabled={tab.disabled}
                  className={`px-4 py-2.5 text-sm font-medium text-left rounded-lg transition-colors ${
                    activeTab === tab.name && !tab.onClick
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                  } ${
                    tab.disabled ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {tab.name}
                </button>
              ))}
            </div>
          </nav>
        </div>

        <div className="flex-1 p-8 overflow-y-auto">
          {ActiveComponent && <ActiveComponent isAuthenticated={isAuthenticated} />}
        </div>
      </div>
    </Modal>
  );
};

export default SettingsModal;
