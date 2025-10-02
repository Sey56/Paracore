import React, { useState, useEffect } from 'react';
import { useUI } from '@/hooks/useUI';
import { useAuth } from '@/hooks/useAuth';
import { XMarkIcon } from '@heroicons/react/24/outline';
import ScriptAutomationSettings from './ScriptAutomationSettings'; // Relative path remains the same
import WorkspaceSettings from './WorkspaceSettings'; // Relative path remains the same

import { Modal } from '../common/Modal'; // Updated import path

interface TabComponentProps {
  isAuthenticated: boolean;
}

interface TabItem {
  name: string;
  component: React.ComponentType<TabComponentProps>;
  disabled?: boolean;
}

const SettingsModal: React.FC = () => {
  const { isSettingsModalOpen, closeSettingsModal } = useUI();
  const { isAuthenticated, user } = useAuth();

  const scriptAutomationTabs: TabItem[] = [
    { name: 'Local Folders', component: ScriptAutomationSettings },
    { name: 'Workspaces', component: WorkspaceSettings },
  ];



  const otherTabs: TabItem[] = [
    { name: 'AI Script Generation', component: () => <div>AI Scripts Settings (Coming Soon)</div>, disabled: true },
    { name: 'Agentic Automation', component: () => <div>Agentic Automation Settings (Coming Soon)</div>, disabled: true },
    { name: 'MCP', component: () => <div>MCP Settings (Coming Soon)</div>, disabled: true },
  ];

  const allTabs = [...scriptAutomationTabs, ...otherTabs];

  const [activeTab, setActiveTab] = useState<string>(scriptAutomationTabs[0].name);

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
              {scriptAutomationTabs.map((tab) => (
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
            {otherTabs.map((tab) => (
              <button
                key={tab.name}
                onClick={() => setActiveTab(tab.name)}
                disabled={tab.disabled}
                className={`text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mt-4 mb-1 py-2.5 text-left rounded-lg transition-colors ${
                  activeTab === tab.name
                    ? 'bg-blue-500 text-white'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                } ${
                  tab.disabled ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {tab.name}
              </button>
            ))}
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
