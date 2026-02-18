import React, { useEffect, useState, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Script } from "@/types/scriptModel";
import type { InspectorTab } from "@/context/providers/UIContext";
import { useUI } from "@/hooks/useUI";
import { useScriptExecution } from "@/features/automation";
import { ParametersTab } from './ParametersTab';
import { ConsoleTabContent } from './ConsoleTabContent';
import { TableTabContent } from './TableTabContent';
import { MetadataTabContent } from './MetadataTabContent';

import {
  faCompress,
  faExpand,
  faExpandAlt,
  faCompressAlt,
  faLayerGroup,
  faSlidersH,
  faTerminal,
  faChartLine,
  faInfoCircle
} from "@fortawesome/free-solid-svg-icons";

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

  const allTabs = [
    { id: "parameters", label: "Parameters", icon: faSlidersH },
    { id: "console", label: "Console", icon: faTerminal },
    { id: "table", label: "Analytics", icon: faChartLine },
    { id: "metadata", label: "Metadata", icon: faInfoCircle }
  ] as const;

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
      <div className="flex border-b border-slate-200/60 dark:border-slate-700/40 items-center px-4 bg-slate-50/50 dark:bg-slate-900/40">
        <div className="flex">
          {allTabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab-button px-4 py-3 flex items-center gap-2 transition-all duration-300 relative border-b-2
                ${activeInspectorTab === tab.id
                  ? "text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400 bg-white/50 dark:bg-slate-800/50"
                  : "text-slate-400/80 dark:text-slate-500/80 border-transparent hover:text-slate-600 dark:hover:text-slate-200"
                }`}
              onClick={() => setActiveInspectorTab(tab.id as InspectorTab)}
            >
              <FontAwesomeIcon icon={tab.icon} className={`text-[10px] ${activeInspectorTab === tab.id ? 'opacity-100' : 'opacity-50'}`} />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap">
                {tab.label}
              </span>

              {tab.id === 'table' && hasUnviewedTableData && (
                <span className="absolute top-2 right-2 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
              )}
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
                  : "text-slate-400 hover:text-blue-600 dark:text-slate-500 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                  }`}
                title={areGroupsExpanded ? "Collapse All Groups" : "Expand All Groups"}
              >
                <div className="relative">
                  <FontAwesomeIcon icon={faLayerGroup} className="w-3.5 h-3.5" />
                  <div className={`absolute -right-1 -bottom-1 w-2 h-2 rounded-full border-2 border-white dark:border-slate-900 transition-colors ${areGroupsExpanded ? "bg-blue-500" : "bg-slate-400"}`}></div>
                </div>
              </button>
              <div className="w-[1px] h-4 bg-slate-200/60 dark:bg-slate-700/50 mx-1"></div>
            </>
          )}
          <button
            onClick={onToggleExpand}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 rounded hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors"
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

