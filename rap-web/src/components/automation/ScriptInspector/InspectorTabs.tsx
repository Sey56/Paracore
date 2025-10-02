import React from "react";
import type { Script, InspectorTab } from "@/types/scriptModel";
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
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Parameters Tab */}
      {activeInspectorTab === "parameters" && (
        <ParametersTab script={script} onViewCodeClick={onViewCodeClick} isActionable={isActionable} tooltipMessage={tooltipMessage} />
      )}

      {/* Console Tab */}
      {activeInspectorTab === "console" && (
        <ConsoleTabContent
          isRunning={isRunning}
          executionResult={executionResult}
          scriptName={script.name}
          clearExecutionResult={clearExecutionResult}
        />
      )}

      {/* Summary Tab */}
      {activeInspectorTab === "summary" && (
        <SummaryTabContent executionResult={executionResult} />
      )}

      {/* Metadata Tab */}
      {activeInspectorTab === "metadata" && (
        <MetadataTabContent metadata={script.metadata} />
      )}
    </div>
  );
};