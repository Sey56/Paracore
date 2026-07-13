
import React, { useState, useEffect, useMemo } from 'react';
import { useUI } from '@/hooks/useUI';
import { useAuth } from '@/features/auth';
import LLMSettings from './LLMSettings';
import { WatchdogSettings } from './WatchdogSettings';
import { AutomationSettings } from './AutomationSettings';
import { Modal } from '@/components/common/Modal';

interface TabComponentProps {
  isAuthenticated: boolean;
  isReadOnly?: boolean;
}

interface TabItem {
  name: string;
  component: React.ComponentType<TabComponentProps>;
}

const SettingsModal: React.FC = () => {
  const { isSettingsModalOpen, closeSettingsModal } = useUI();
  const { isAuthenticated, isEnterprise } = useAuth();

  const coreFeaturesTabs = useMemo(() => {
    const tabs: TabItem[] = [];

    if (isEnterprise) {
      tabs.push({
        name: 'Sentinels',
        component: WatchdogSettings,
      });
    }

    tabs.push({
      name: 'Automation',
      component: AutomationSettings,
    });

    tabs.push({
      name: 'LLM Settings',
      component: LLMSettings,
    });

    return tabs;
  }, [isEnterprise]);

  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Set default tab on mount or when tabs change
  useEffect(() => {
    if (!activeTab && coreFeaturesTabs.length > 0) {
      setActiveTab(coreFeaturesTabs[0].name);
    }
  }, [coreFeaturesTabs, activeTab]);

  const ActiveComponent = coreFeaturesTabs.find(tab => tab.name === activeTab)?.component;

  return (
    <Modal isOpen={isSettingsModalOpen} onClose={closeSettingsModal} title="Settings" size="2xl">
      <div className="flex overflow-hidden max-h-[80vh] animate-in fade-in slide-in-from-bottom-4 duration-500 bg-slate-50 dark:bg-slate-900">
        <div className="w-64 border-r border-slate-200/60 dark:border-slate-800/60 p-6 flex-shrink-0 overflow-y-auto custom-scrollbar bg-white/50 dark:bg-slate-950/40 backdrop-blur-sm">
          <nav className="flex flex-col space-y-2">
            <div className="flex flex-col space-y-1.5">
              {coreFeaturesTabs.map((tab: TabItem) => (
                <button
                  key={tab.name}
                  onClick={() => setActiveTab(tab.name)}
                  className={`px-5 py-3.5 text-[11px] font-black uppercase tracking-widest text-left rounded-2xl transition-all group relative overflow-hidden ${activeTab === tab.name
                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-[0_8px_16px_-4px_rgba(0,0,0,0.1)] border border-blue-100/50 dark:border-blue-900/20'
                    : 'text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-white/80 dark:hover:bg-slate-800'
                    }`}
                >
                  <span className="relative z-10">{tab.name}</span>
                </button>
              ))}
            </div>
          </nav>
        </div>

        <div className="flex-1 p-10 overflow-y-auto custom-scrollbar bg-white/20 dark:bg-slate-950/10">
          {ActiveComponent && (
            <ActiveComponent
              isAuthenticated={isAuthenticated}
            />
          )}
        </div>
      </div>
    </Modal>
  );
};

export default SettingsModal;
