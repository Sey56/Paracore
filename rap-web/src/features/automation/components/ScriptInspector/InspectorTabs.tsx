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

import { useAuth } from "@/features/auth";
import {
  faSlidersH,
  faTerminal,
  faChartLine,
  faInfoCircle,
  faTimes
} from "@fortawesome/free-solid-svg-icons";

interface InspectorTabsProps {
  script: Script | null;
  isRunning: boolean;
  onViewCodeClick: () => void;
  isActionable: boolean;
  tooltipMessage: string;
}

export const InspectorTabs: React.FC<InspectorTabsProps> = ({ script, isRunning, onViewCodeClick, isActionable, tooltipMessage }) => {
  const { activeInspectorTab, setActiveInspectorTab } = useUI();
  const { isAuthenticated } = useAuth();
  const {
    executionResult,
    clearExecutionResult,
  } = useScriptExecution();
  const { 
    activeAnalyticsSubTabIndex, 
    setActiveAnalyticsSubTabIndex 
  } = useUI();

  const [hasUnviewedTableData, setHasUnviewedTableData] = useState(false);
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const lastExecutionCountRef = useRef<number>(0);
  const currentExecutionCountRef = useRef<number>(0);

  const allTabs: { id: InspectorTab, label: string, icon: any, hidden?: boolean }[] = [
    { id: "parameters", label: "Parameters", icon: faSlidersH, hidden: !script },
    { id: "console", label: "Console", icon: faTerminal },
    { id: "table", label: "Analytics", icon: faChartLine },
  ];

  const visibleTabs = allTabs.filter(t => !t.hidden);

  // If no script is selected and we are on parameters tab, switch to console
  useEffect(() => {
    if (!script && activeInspectorTab === 'parameters') {
      setActiveInspectorTab('console');
    }
  }, [script, activeInspectorTab, setActiveInspectorTab]);

  // Detect new execution with table data
  useEffect(() => {
    const hasTableData = executionResult?.structuredOutput &&
      executionResult.structuredOutput.length > 0 &&
      executionResult.structuredOutput.some(item => item.type === 'table');

    if (hasTableData) {
      currentExecutionCountRef.current++;
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

  // Close metadata panel when switching scripts
  useEffect(() => {
    setIsMetadataOpen(false);
  }, [script?.id]);

  return (
    <div className={`tabs flex flex-col h-full min-h-0 w-full overflow-hidden ${!isAuthenticated ? "opacity-50 cursor-not-allowed" : ""}`}>
      <div className="flex border-b border-slate-200/60 dark:border-slate-700/40 items-center px-5 bg-slate-50/50 dark:bg-slate-900/40">
        <div className="flex gap-1">
          {visibleTabs.map((tab) => (
            <React.Fragment key={tab.id}>
              <button
                className={`tab-button px-4 py-4 flex items-center gap-3 transition-all duration-300 relative border-b-2 rounded-t-xl
                  ${activeInspectorTab === tab.id
                    ? "text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400 bg-white dark:bg-slate-800"
                    : "text-slate-400 dark:text-slate-500 border-transparent hover:text-slate-600 dark:hover:text-slate-300"
                  }`}
                onClick={() => setActiveInspectorTab(tab.id as InspectorTab)}
              >
                <FontAwesomeIcon icon={tab.icon} className={`text-[10px] ${activeInspectorTab === tab.id ? 'opacity-100' : 'opacity-60'}`} />
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

              {/* Compact Sub-tab pills for Analytics */}
              {tab.id === 'table' && executionResult?.structuredOutput && executionResult.structuredOutput.length > 1 && (
                <div className="flex items-center gap-1 ml-1 mr-3 h-full pb-1">
                  <div className="flex bg-slate-200/50 dark:bg-slate-800/50 p-1 rounded-lg gap-1">
                    {executionResult.structuredOutput.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setActiveAnalyticsSubTabIndex(idx);
                          setActiveInspectorTab('table');
                        }}
                        className={`h-5 flex items-center justify-center rounded text-[9px] font-black transition-all ${
                          item.title ? "px-2 min-w-[20px]" : "w-5"
                        } ${
                          activeAnalyticsSubTabIndex === idx
                            ? "bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm"
                            : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                        }`}
                        title={item.title || `Table ${idx + 1}`}
                      >
                        {item.title || idx + 1}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
        <div className="ml-auto pl-2 flex items-center gap-1 flex-shrink-0">
          {script && (
            <button
              onClick={() => setIsMetadataOpen(!isMetadataOpen)}
              className={`p-1.5 rounded transition-all duration-200 ${isMetadataOpen
                ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30"
                : "text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700/60"
                }`}
              title="Script Info"
            >
              <FontAwesomeIcon icon={faInfoCircle} />
            </button>
          )}
        </div>
      </div>

      {/* Metadata Slide-Down Panel */}
      {isMetadataOpen && script && script.metadata && (
        <div className="border-b border-slate-200/60 dark:border-slate-700/40 bg-slate-50/80 dark:bg-slate-900/60 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between px-5 pt-3 pb-1">
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Script Info</span>
            <button
              onClick={() => setIsMetadataOpen(false)}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded transition-colors"
            >
              <FontAwesomeIcon icon={faTimes} className="text-xs" />
            </button>
          </div>
          <div className="px-5 pb-4 max-h-[200px] overflow-y-auto custom-scrollbar">
            <MetadataTabContent metadata={script.metadata} scriptName={script.name} />
          </div>
        </div>
      )}

      {/* Tab Content Area */}
      <div className="flex-grow min-h-0 min-w-0 w-full overflow-hidden relative">
        {/* Parameters Tab is conditionally rendered (needs a script) */}
        {activeInspectorTab === 'parameters' && script && (
          <div className="h-full overflow-y-auto custom-scrollbar">
            <ParametersTab
              script={script}
              onViewCodeClick={onViewCodeClick}
              isActionable={isActionable}
              tooltipMessage={tooltipMessage}
            />
          </div>
        )}

        {/* Console and Table Tabs are kept mounted to preserve history/scroll */}
        <div className={`h-full w-full min-w-0 ${activeInspectorTab !== 'console' ? 'hidden' : ''}`}>
          <ConsoleTabContent
            isRunning={isRunning}
            executionResult={executionResult}
            scriptName={script?.name || "Global Console"}
            clearExecutionResult={clearExecutionResult}
          />
        </div>

        <div className={`h-full w-full min-w-0 overflow-hidden ${activeInspectorTab !== 'table' ? 'hidden' : ''}`}>
          <TableTabContent executionResult={executionResult} />
        </div>
      </div>
    </div>
  );
};
