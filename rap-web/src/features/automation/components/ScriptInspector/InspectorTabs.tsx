import React, { useEffect, useState, useRef } from "react";
import type { Script } from "@/types/scriptModel";
import type { InspectorTab } from "@/context/providers/UIContext";
import { useUI } from "@/hooks/useUI";
import { useScriptExecution } from "@/features/automation";
import { ParametersTab } from './ParametersTab';
import { ConsoleTabContent } from './ConsoleTabContent';
import { TableTabContent } from './TableTabContent';
import { MetadataTabContent } from './MetadataTabContent';

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCompress, faExpand, faExpandAlt, faCompressAlt, faLayerGroup } from "@fortawesome/free-solid-svg-icons";

interface InspectorTabsProps {
  script: Script;
  isRunning: boolean;
  onViewCodeClick: () => void;
  isActionable: boolean;
  tooltipMessage: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

export const InspectorTabs: React.FC<InspectorTabsProps> = ({ script, isRunning, onViewCodeClick, isActionable, tooltipMessage, isExpanded, onToggleExpand }) => {
  const { activeInspectorTab, setActiveInspectorTab } = useUI();
  const [areGroupsExpanded, setAreGroupsExpanded] = useState(false);
  const {
    executionResult,
    clearExecutionResult,
  } = useScriptExecution();

  const [hasUnviewedTableData, setHasUnviewedTableData] = useState(false);
  const lastExecutionCountRef = useRef<number>(0);
  const currentExecutionCountRef = useRef<number>(0);

  const toggleAllGroups = () => {
    const newState = !areGroupsExpanded;
    setAreGroupsExpanded(newState);
    window.dispatchEvent(new CustomEvent(newState ? 'expand-all-groups' : 'collapse-all-groups'));
  };

  const allTabs = ["parameters", "console", "table", "metadata"] as const;

  // Detect new execution with table data
  useEffect(() => {
    const hasTableData = executionResult?.structuredOutput &&
      executionResult.structuredOutput.length > 0 &&
      executionResult.structuredOutput.some(item => item.type === 'table');

    if (hasTableData) {
      // Increment execution count for each new result
      currentExecutionCountRef.current++;

      // Show badge if this is a new execution (count changed)
      if (currentExecutionCountRef.current > lastExecutionCountRef.current) {
        setHasUnviewedTableData(true);
      }
    }
  }, [executionResult]);

  // Mark as viewed when user visits the table tab
  useEffect(() => {
    if (activeInspectorTab === 'table' && hasUnviewedTableData) {
      setHasUnviewedTableData(false);
      lastExecutionCountRef.current = currentExecutionCountRef.current;
    }
  }, [activeInspectorTab, hasUnviewedTableData]);

  return (
    <div className={`tabs flex flex-col h-full min-h-0 w-full overflow-hidden ${!isActionable ? "opacity-50 cursor-not-allowed" : ""}`}>
      <div className="flex border-b border-gray-200 dark:border-gray-700 items-center">
        <div className="flex">
          {allTabs.map((tab: InspectorTab) => (
            <button
              key={tab}
              className={`tab-button px-4 py-2 font-medium text-sm relative ${activeInspectorTab === tab
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white"
                }`}
              onClick={() => setActiveInspectorTab(tab)}
            >
              <span className="relative inline-flex items-center">
                {tab === 'console' ? 'Console' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === 'table' && hasUnviewedTableData && (
                  <span className="absolute -top-2 -right-2 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
        <div className="ml-auto px-2 flex items-center gap-1">
          {activeInspectorTab === 'parameters' && (
            <>
              <button
                onClick={toggleAllGroups}
                className={`p-1.5 rounded transition-all duration-300 flex items-center justify-center ${areGroupsExpanded
                    ? "text-blue-600 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                    : "text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                title={areGroupsExpanded ? "Collapse All Groups" : "Expand All Groups"}
              >
                <div className="relative">
                  <FontAwesomeIcon icon={faLayerGroup} className="w-3.5 h-3.5" />
                  <div className={`absolute -right-1 -bottom-1 w-2 h-2 rounded-full border-2 border-white dark:border-gray-800 transition-colors ${areGroupsExpanded ? "bg-blue-500" : "bg-gray-400"}`}></div>
                </div>
              </button>
              <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700 mx-1"></div>
            </>
          )}
          <button
            onClick={onToggleExpand}
            className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title={isExpanded ? "Collapse View" : "Expand View"}
          >
            <FontAwesomeIcon icon={isExpanded ? faCompress : faExpand} />
          </button>
        </div>
      </div>

      {/* Tab Content Area */}
      <div className="mt-4 flex-grow min-h-0 min-w-0 w-full overflow-hidden relative">
        {activeInspectorTab === 'parameters' && (
          <div className="h-full overflow-y-auto custom-scrollbar">
            <ParametersTab script={script} onViewCodeClick={onViewCodeClick} isActionable={isActionable} tooltipMessage={tooltipMessage} />
          </div>
        )}
        {activeInspectorTab === 'console' && (
          <div className="h-full w-full min-w-0">
            <ConsoleTabContent
              isRunning={isRunning}
              executionResult={executionResult}
              scriptName={script.name}
              clearExecutionResult={clearExecutionResult}
            />
          </div>
        )}
        {activeInspectorTab === 'table' && (
          <div className="h-full">
            <TableTabContent executionResult={executionResult} />
          </div>
        )}
        {activeInspectorTab === 'metadata' && script.metadata && (
          <div className="h-full">
            <MetadataTabContent metadata={script.metadata} />
          </div>
        )}
      </div>
    </div>
  );
};

