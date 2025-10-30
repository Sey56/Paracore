import React from "react";
import type { Script } from "@/types/scriptModel";
import type { InspectorTab } from "@/context/providers/UIContext";
import { useUI } from "@/hooks/useUI";
import { useScriptExecution } from "@/hooks/useScriptExecution";
import { ParametersTab } from './ParametersTab';
import { ConsoleTabContent } from './ConsoleTabContent';
import { SummaryTabContent } from './SummaryTabContent';
import { MetadataTabContent } from './MetadataTabContent';

interface InspectorTabsProps {
  script: Script;
  isRunning: boolean;
  onViewCodeClick: () => void;
  isActionable: boolean;
  tooltipMessage: string;
}

export const InspectorTabs: React.FC<InspectorTabsProps> = ({ script, isRunning, onViewCodeClick, isActionable, tooltipMessage }) => {
  const { activeInspectorTab, setActiveInspectorTab } = useUI();
  const { 
    executionResult,
    clearExecutionResult,
  } = useScriptExecution();

  const tabsToShow = ["parameters", "console", "summary", "metadata"] as const;

  return (
    <div className={`tabs mb-6 w-full overflow-hidden ${!isActionable ? "opacity-50 cursor-not-allowed" : ""}`}>
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {tabsToShow.map((tab: InspectorTab) => (
          <button
            key={tab}
            className={`tab-button px-4 py-2 font-medium text-sm ${ 
              activeInspectorTab === tab
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white"
            }`}
            onClick={() => setActiveInspectorTab(tab)}
          >
            {tab === 'console' ? 'Console' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content Area */}
      <div className="mt-4">
        <div className={activeInspectorTab === 'parameters' ? '' : 'hidden'}>
          <ParametersTab script={script} onViewCodeClick={onViewCodeClick} isActionable={isActionable} tooltipMessage={tooltipMessage} />
        </div>
        <div className={activeInspectorTab === 'console' ? '' : 'hidden'}>
          <ConsoleTabContent
            isRunning={isRunning}
            executionResult={executionResult}
            scriptName={script.name}
            clearExecutionResult={clearExecutionResult}
          />
        </div>
        <div className={activeInspectorTab === 'summary' ? '' : 'hidden'}>
          <SummaryTabContent executionResult={executionResult} />
        </div>
        <div className={activeInspectorTab === 'metadata' ? '' : 'hidden'}>
          <MetadataTabContent metadata={script.metadata} />
        </div>
      </div>
    </div>
  );
};