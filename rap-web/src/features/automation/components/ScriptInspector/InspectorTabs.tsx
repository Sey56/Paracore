import React, { useEffect, useState, useRef } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { Script, StructuredOutput } from "@/types/scriptModel";
import type { ExecutionResult } from "@/types/common";
import type { InspectorTab } from "@/context/providers/UIContext";
import { useUI } from "@/hooks/useUI";
import { useScriptExecution } from "@/features/automation";
import { ParametersTab } from './ParametersTab';
import { ConsoleTabContent } from './ConsoleTabContent';
import { TableTabContent } from './TableTabContent';
import { MetadataTabContent } from './MetadataTabContent';
import { useRevitStatus } from "@/hooks/useRevitStatus";

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
  const activeInspectorTabRef = useRef(activeInspectorTab);
  
  useEffect(() => {
    activeInspectorTabRef.current = activeInspectorTab;
  }, [activeInspectorTab]);

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
  const [persistentStructuredOutput, setPersistentStructuredOutput] = useState<StructuredOutput[] | undefined>(() => {
    const saved = localStorage.getItem('paracore_analytics_output');
    return saved ? JSON.parse(saved) : undefined;
  });
  const [persistentExecutionTimestamp, setPersistentExecutionTimestamp] = useState<number | undefined>(() => {
    const saved = localStorage.getItem('paracore_analytics_timestamp');
    return saved ? Number(saved) : undefined;
  });
  const [capturedDocTitle, setCapturedDocTitle] = useState<string | null>(() => {
    return localStorage.getItem('paracore_analytics_captured_doc');
  });
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  
  // Track the last processed execution to avoid duplicate processing or processing intermediate states
  // Initialize from persisted timestamp so Clear works even before a new execution in this session
  const savedTimestamp = localStorage.getItem('paracore_analytics_timestamp');
  const lastProcessedTimestampRef = useRef<number | undefined>(savedTimestamp ? Number(savedTimestamp) : undefined);

  const allTabs: { id: InspectorTab, label: string, icon: import("@fortawesome/fontawesome-svg-core").IconProp, hidden?: boolean }[] = [
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

  // Helper to check if structured output is actually non-empty
  const isStructuredOutputNonEmpty = (output: StructuredOutput[] | undefined): boolean => {
    if (!output || output.length === 0) return false;
    return output.some(item => {
      // Only pulsate for tables and charts
      if (!['table', 'chart-bar', 'chart-pie', 'chart-line'].includes(item.type)) return false;
      
      // Optimization: Basic check for data existence and minimal length
      if (!item.data || item.data.length < 3) return false; 
      
      // Optimization: For large outputs, skip parsing and assume it's non-empty
      if (item.data.length > 500) return true;
      
      try {
        const parsed = JSON.parse(item.data);
        if (Array.isArray(parsed)) return parsed.length > 0;
        if (typeof parsed === 'object' && parsed !== null) return Object.keys(parsed).length > 0;
        return false;
      } catch {
        return false;
      }
    });
  };

  // Detect new execution results
  useEffect(() => {
    // 1. Skip if no result or if we already processed this exact result
    if (!executionResult || executionResult.timestamp === lastProcessedTimestampRef.current) {
      // Handle the case where executionResult is explicitly cleared (e.g. by Global Console clear)
      // V12 SMART GUARD: Only clear persistence if we have previously processed a result.
      // This prevents the initial null state on app refresh from wiping the loaded localStorage data.
      if (executionResult === null && lastProcessedTimestampRef.current !== undefined) {
        setPersistentStructuredOutput(undefined);
        setPersistentExecutionTimestamp(undefined);
        setCapturedDocTitle(null);
        setHasUnviewedTableData(false);
        lastProcessedTimestampRef.current = undefined;
        localStorage.removeItem('paracore_analytics_output');
        localStorage.removeItem('paracore_analytics_timestamp');
        localStorage.removeItem('paracore_analytics_captured_doc');
      }
      return;
    }

    lastProcessedTimestampRef.current = executionResult.timestamp;

    const newOutput = executionResult.structuredOutput;
    const hasValidOutput = isStructuredOutputNonEmpty(newOutput);

    if (hasValidOutput && newOutput) {
      // New valid output arrived: Update persistence and trigger pulse
      setPersistentStructuredOutput(newOutput);
      setPersistentExecutionTimestamp(executionResult.timestamp);
      
      // Only pulse if we are not already looking at the table
      if (activeInspectorTabRef.current !== 'table') {
        setHasUnviewedTableData(true);
      }
      // V13: Clear captured title so it can be re-captured for this specific execution
      setCapturedDocTitle(null);
    } else {
      // New run completed but produced NO analytics:
      // Clear persistence to ensure the UI reflects the latest execution result (empty).
      setPersistentStructuredOutput(undefined);
      setPersistentExecutionTimestamp(undefined);
      setCapturedDocTitle(null);
      setHasUnviewedTableData(false);
      localStorage.removeItem('paracore_analytics_output');
      localStorage.removeItem('paracore_analytics_timestamp');
      localStorage.removeItem('paracore_analytics_captured_doc');
    }
  }, [executionResult]); // Only depend on result, not tab switch

  const { revitStatus } = useRevitStatus();
  const currentDocTitle = React.useMemo(() => revitStatus.document ? revitStatus.document.split(/[\\/]/).pop() || null : null, [revitStatus.document]);

  // Capture document title for data context tagging - ONE TIME CAPTURE per execution
  useEffect(() => {
    // V13 GUARD: Only capture if we have an active run result AND we haven't captured a title yet.
    // This prevents re-capturing when the user switches documents later.
    if (persistentExecutionTimestamp && currentDocTitle && !capturedDocTitle) {
      setCapturedDocTitle(currentDocTitle);
      localStorage.setItem('paracore_analytics_captured_doc', currentDocTitle);
    }
  }, [persistentExecutionTimestamp, currentDocTitle, capturedDocTitle]);

  // Sync persistence to localStorage
  useEffect(() => {
    if (persistentStructuredOutput) {
      localStorage.setItem('paracore_analytics_output', JSON.stringify(persistentStructuredOutput));
    } else {
      localStorage.removeItem('paracore_analytics_output');
    }
  }, [persistentStructuredOutput]);

  useEffect(() => {
    if (persistentExecutionTimestamp) {
      localStorage.setItem('paracore_analytics_timestamp', String(persistentExecutionTimestamp));
    } else {
      localStorage.removeItem('paracore_analytics_timestamp');
    }
  }, [persistentExecutionTimestamp]);

  // Mark as viewed when user visits the table tab
  useEffect(() => {
    if (activeInspectorTab === 'table' && hasUnviewedTableData) {
      setHasUnviewedTableData(false);
    }
  }, [activeInspectorTab, hasUnviewedTableData]);

  // Reset EVERYTHING when switching scripts - total clean slate
  useEffect(() => {
    setIsMetadataOpen(false);
  }, [script?.id]);

  // Create a virtual execution result that includes the persistent output
  const virtualExecutionResult = React.useMemo((): ExecutionResult | null => {
    if (persistentStructuredOutput) {
      return {
        ...executionResult,
        output: executionResult?.output || "",
        isSuccess: executionResult?.isSuccess ?? true,
        error: executionResult?.error ?? null,
        structuredOutput: persistentStructuredOutput,
        timestamp: persistentExecutionTimestamp,
        scriptName: executionResult?.scriptName || script?.name
      };
    }
    return executionResult;
  }, [executionResult, persistentStructuredOutput, persistentExecutionTimestamp, script?.name]);

  return (
    <div className={`tabs flex flex-col h-full min-h-0 w-full overflow-hidden ${!isAuthenticated ? "opacity-50 cursor-not-allowed" : ""}`}>
      <div className="flex border-b border-slate-200/60 dark:border-slate-700/40 items-center px-5 bg-transparent">
        <div className="flex gap-1">
          {visibleTabs.map((tab) => (
            <React.Fragment key={tab.id}>
              <button
                className={`tab-button px-4 py-4 flex items-center gap-3 transition-all duration-300 relative border-b-2 rounded-t-xl
                  ${activeInspectorTab === tab.id
                    ? "text-blue-600 dark:text-blue-400 border-blue-600 dark:border-blue-400 bg-white dark:bg-slate-800"
                    : "text-slate-400 dark:text-slate-500 border-transparent hover:text-slate-600 dark:hover:text-slate-300"
                  }`}
                onClick={() => {
                  if (tab.id === 'table' && activeInspectorTab === 'table' && virtualExecutionResult?.structuredOutput && virtualExecutionResult.structuredOutput.length > 1) {
                    // Cycle through sub-tabs if clicking an already active Analytics tab
                    const nextIdx = (activeAnalyticsSubTabIndex + 1) % virtualExecutionResult.structuredOutput.length;
                    setActiveAnalyticsSubTabIndex(nextIdx);
                  } else {
                    setActiveInspectorTab(tab.id as InspectorTab);
                  }
                }}
              >
                <div className="relative">
                  <FontAwesomeIcon 
                    icon={tab.icon} 
                    className={`text-[10px] transition-all duration-500 ${
                      activeInspectorTab === tab.id 
                        ? 'opacity-100 scale-110' 
                        : 'opacity-60'
                    } ${
                      tab.id === 'table' && hasUnviewedTableData
                        ? 'text-blue-500 dark:text-blue-400'
                        : ''
                    }`} 
                  />
                </div>
                <span className={`text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap transition-all duration-1000 ${
                  tab.id === 'table' && hasUnviewedTableData 
                    ? "text-blue-500 dark:text-blue-400" 
                    : ""
                }`}>
                  {tab.label}
                </span>
                {tab.id === 'table' && hasUnviewedTableData && (
                  <div className="w-2.5 h-2.5 bg-blue-500 rounded-full animate-pulse shadow-sm" />
                )}
              </button>
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
          <div className="absolute inset-0">
            <ParametersTab
              script={script}
              onViewCodeClick={onViewCodeClick}
              isActionable={isActionable}
              tooltipMessage={tooltipMessage}
            />
          </div>
        )}

        {/* Console and Table Tabs are kept mounted to preserve history/scroll */}
        <div className={`h-full w-full min-w-0 ${activeInspectorTab !== 'console' ? 'opacity-0 pointer-events-none absolute inset-0 overflow-hidden' : 'relative'}`}>
          <ConsoleTabContent
            isRunning={isRunning}
            executionResult={executionResult}
            scriptName={script?.name || "Global Console"}
            clearExecutionResult={clearExecutionResult}
          />
        </div>

        {activeInspectorTab === 'table' && (
          <div className="h-full w-full min-w-0 overflow-hidden relative">
            <TableTabContent 
              executionResult={virtualExecutionResult} 
              capturedDocTitle={capturedDocTitle}
              currentDocTitle={currentDocTitle}
              selectedScript={script}
            />
          </div>
        )}
      </div>
    </div>
  );
};
