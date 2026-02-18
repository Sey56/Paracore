import React, { useEffect, useState, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Script } from "@/types/scriptModel";
import type { InspectorTab } from "@/context/providers/UIContext";
import { useUI } from "@/hooks/useUI";
import { useScriptExecution } from "@/features/automation";
import { ParametersTab } from './ParametersTab';
import { ConsoleTabContent } from './ConsoleTabContent';
import { TableTabContent } from './TableTabContent';

import {
  faCompress,
  faExpand,
  faExpandAlt,
  faCompressAlt,
  faLayerGroup,
  faSlidersH,
  faTerminal,
  faChartLine
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
  const {
    executionResult,
    clearExecutionResult,
  } = useScriptExecution();

  const [hasUnviewedTableData, setHasUnviewedTableData] = useState(false);
  const lastExecutionCountRef = useRef<number>(0);
  const currentExecutionCountRef = useRef<number>(0);



  const allTabs = [
    { id: "parameters", label: "Parameters", icon: faSlidersH },
    { id: "console", label: "Console", icon: faTerminal },
    { id: "table", label: "Analytics", icon: faChartLine },
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
      <div className="flex border-b border-slate-200/60 dark:border-slate-700/40 items-center px-5 bg-slate-50/50 dark:bg-slate-900/40">
        <div className="flex gap-1">
          {allTabs.map((tab) => (
            <button
              key={tab.id}
              className={`tab-button px-5 py-3.5 flex items-center gap-2.5 transition-all duration-300 relative border-b-2 rounded-t-lg
                ${activeInspectorTab === tab.id
                  ? "text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400 bg-white/50 dark:bg-slate-800/50"
                  : "text-slate-400/80 dark:text-slate-500/80 border-transparent hover:text-slate-600 dark:hover:text-slate-200"
                }`}
              onClick={() => setActiveInspectorTab(tab.id as InspectorTab)}
            >
              <FontAwesomeIcon icon={tab.icon} className={`text-xs ${activeInspectorTab === tab.id ? 'opacity-100' : 'opacity-50'}`} />
              <span className="text-[11px] font-black uppercase tracking-[0.15em] whitespace-nowrap">
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

      </div>
    </div>
  );
};

