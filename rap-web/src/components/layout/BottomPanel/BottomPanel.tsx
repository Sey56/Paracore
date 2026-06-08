import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTerminal, faChartLine, faTrash, faCopy, faMagicWandSparkles, faExpandAlt, faCompressAlt } from '@fortawesome/free-solid-svg-icons';
import { useConsole } from '@/features/automation/store/ConsoleContext';
import { useScriptExecution } from '@/features/automation';
import { ExecutionHistory } from '@/features/automation/components/ScriptInspector/ExecutionHistory';
import { TableTabContent } from '@/features/automation/components/ScriptInspector/TableTabContent';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { useNotifications } from '@/hooks/useNotifications';
import { useUI } from '@/hooks/useUI';

export const BottomPanel: React.FC = () => {
  const { localHistory, setLocalHistory, aiResult, isExplaining, setAiResult } = useConsole();
  const { executionResult, clearExecutionResult, selectedScript } = useScriptExecution();
  const { revitStatus } = useRevitStatus();
  const { showNotification } = useNotifications();
  const { agentReplResults, setAgentReplResults, agentCapturedDocTitle } = useUI();
  
  const [activeTab, setActiveTab] = useState<'history' | 'analytics'>('history');
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  
  const [isExpanded, setIsExpanded] = useState(() => {
    return localStorage.getItem('paracore_bottom_panel_expanded') === 'true';
  });

  const [panelHeight, setPanelHeight] = useState(() => {
    const saved = localStorage.getItem('paracore_bottom_panel_height');
    const parsed = saved ? parseInt(saved) : 300;
    // Ensure a usable minimum on load so the handle is always reachable
    return Math.max(parsed, 80);
  });
  
  const [isResizing, setIsResizing] = useState(false);
  const [hasUnviewedAnalytics, setHasUnviewedAnalytics] = useState(false);
  const [isFlashingAnalytics, setIsFlashingAnalytics] = useState(false);
  const [hasUnviewedHistory, setHasUnviewedHistory] = useState(false);
  const [isFlashingHistory, setIsFlashingHistory] = useState(false);

  useEffect(() => {
    localStorage.setItem('paracore_bottom_panel_expanded', String(isExpanded));
  }, [isExpanded]);

  // Analytics badge — only fires when data changes, not on tab switches
  useEffect(() => {
    const hasAnalytics = (executionResult?.structuredOutput || agentReplResults)?.some(item =>
      ['table', 'chart-bar', 'chart-pie', 'chart-line'].includes(item.type)
    );
    if (!hasAnalytics) return;

    setIsFlashingAnalytics(true);
    setTimeout(() => setIsFlashingAnalytics(false), 1000);
    if (activeTabRef.current !== 'analytics') {
      setHasUnviewedAnalytics(true);
    }
  }, [executionResult, agentReplResults]);

  // History badge — only fires when data changes, not on tab switches
  useEffect(() => {
    const hasHistory = executionResult?.output || executionResult?.error;
    if (!hasHistory) return;

    setIsFlashingHistory(true);
    setTimeout(() => setIsFlashingHistory(false), 1000);
    if (activeTabRef.current !== 'history') {
      setHasUnviewedHistory(true);
    }
  }, [executionResult]);

  // Clear badges when user activates the tab
  useEffect(() => {
    if (activeTab === 'analytics') setHasUnviewedAnalytics(false);
    if (activeTab === 'history') setHasUnviewedHistory(false);
  }, [activeTab]);

  // Clear agent REPL override when any execution (manual or script) produces new results
  useEffect(() => {
    if (executionResult) {
      setAgentReplResults(null);
    }
  }, [executionResult, setAgentReplResults]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsResizing(true);
    e.preventDefault();
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const newHeight = window.innerHeight - e.clientY;
    // Min 80px to keep resize handle always reachable above the header
    const clampedHeight = Math.max(80, Math.min(newHeight, window.innerHeight - 100));
    setPanelHeight(clampedHeight);
    // If expanded and user drags down past a threshold, exit expanded mode
    if (isExpanded && clampedHeight < window.innerHeight - 100) {
      setIsExpanded(false);
    }
  }, [isResizing, isExpanded]);

  const handleMouseUp = useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      localStorage.setItem('paracore_bottom_panel_height', panelHeight.toString());
    }
  }, [isResizing, panelHeight]);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const currentDocTitle = React.useMemo(() => revitStatus.document ? revitStatus.document.split(/[\\/]/).pop() || null : null, [revitStatus.document]);
  
  // ── History: Copy & Clear ────────────────────────────────────────────
  const hasHistoryData = localHistory.length > 0;

  const handleHistoryCopy = () => {
    const content = localHistory.map(item => (item.type === 'input' ? `> ${item.text}` : item.text)).join('\n');
    navigator.clipboard.writeText(content).then(() => showNotification("History copied to clipboard", "info"));
  };

  const handleHistoryClear = () => {
    setLocalHistory([]);
    setAiResult(null);
    localStorage.removeItem('paracore_console_history');
    showNotification("History cleared", "info");
  };

  // ── Analytics: Copy & Clear ──────────────────────────────────────────
  const structuredOutput = agentReplResults ?? executionResult?.structuredOutput;
  const hasAnalyticsData = !!(structuredOutput && structuredOutput.length > 0);

  const handleAnalyticsCopy = () => {
    if (!structuredOutput) return;
    
    const parts: string[] = [];
    for (const item of structuredOutput) {
      if (item.type === 'table' && item.data) {
        try {
          const rows = typeof item.data === 'string' ? JSON.parse(item.data) : item.data;
          if (Array.isArray(rows) && rows.length > 0) {
            const headers = Object.keys(rows[0]);
            parts.push(headers.join('\t'));
            for (const row of rows) {
              parts.push(headers.map(h => String(row[h] ?? '')).join('\t'));
            }
          }
        } catch { /* skip unparseable items */ }
      } else if (item.data) {
        parts.push(typeof item.data === 'string' ? item.data : JSON.stringify(item.data, null, 2));
      }
    }
    
    const text = parts.join('\n\n');
    navigator.clipboard.writeText(text).then(() => showNotification("Analytics copied to clipboard", "info"));
  };

  const handleAnalyticsClear = () => {
    clearExecutionResult();
    setAgentReplResults(null);
    showNotification("Analytics cleared", "info");
  };

  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const getPanelClasses = () => {
    const base = "flex flex-col bg-white dark:bg-slate-900 transition-all duration-300 ease-in-out z-40 overflow-hidden";
    if (isExpanded) return `${base} absolute inset-0 z-[100] border-none shadow-none`;
    return `${base} relative border-t border-slate-200 dark:border-gray-700 shadow-lg`;
  };

  const getPanelStyle = (): React.CSSProperties => {
    if (isExpanded) return { height: '100%', width: '100%', top: 0, left: 0 };
    return { height: `${panelHeight}px` };
  };

  return (
    <div className={getPanelClasses()} style={getPanelStyle()}>
      {/* Resizer Handle */}
      <div 
        className={`absolute -top-2 inset-x-0 h-4 cursor-ns-resize hover:bg-blue-500/20 transition-colors z-[110] group flex items-center justify-center`}
        onMouseDown={handleMouseDown}
      >
        <div className="w-12 h-1 bg-slate-300 dark:bg-slate-600 rounded-full group-hover:bg-blue-400" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-1">
          <button 
            onClick={() => setActiveTab('history')}
            className={`w-12 h-12 flex items-center justify-center border-b-2 transition-all relative ${activeTab === 'history' ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900 shadow-[inset_0_-2px_0_rgba(59,130,246,1)]' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
            title="Execution History"
          >
            <FontAwesomeIcon 
              icon={faTerminal} 
              className={`text-sm transition-all duration-300 ${isFlashingHistory ? 'scale-150 text-blue-500' : ''}`} 
            />
            {hasUnviewedHistory && (
              <span className="absolute top-2 right-1.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500 border border-white dark:border-slate-800"></span>
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('analytics')}
            className={`w-12 h-12 flex items-center justify-center border-b-2 transition-all relative ${activeTab === 'analytics' ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900 shadow-[inset_0_-2px_0_rgba(59,130,246,1)]' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
            title="Analytics & Tables"
          >
            <FontAwesomeIcon 
              icon={faChartLine} 
              className={`text-sm transition-all duration-300 ${isFlashingAnalytics ? 'scale-150 text-blue-500' : ''}`} 
            />
            {hasUnviewedAnalytics && (
              <span className="absolute top-2 right-1.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500 border border-white dark:border-slate-800"></span>
              </span>
            )}
          </button>
        </div>

        <div className="flex-1 flex items-center gap-3 min-w-0 ml-4">
          <div id="bottom-panel-portal-root" className="flex-1 flex items-center gap-2" />

          <div className="flex items-center gap-3 shrink-0 ml-auto">
            {/* History tab buttons — only when there's data */}
            {activeTab === 'history' && hasHistoryData && (
              <div className="flex items-center gap-3 animate-in fade-in duration-300 tooltip-bottom">
                <button onClick={handleHistoryClear} title="Clear History" className="text-slate-400 hover:text-red-500 transition-colors">
                  <FontAwesomeIcon icon={faTrash} className="text-xs" />
                </button>
                <button onClick={handleHistoryCopy} title="Copy History" className="text-slate-400 hover:text-blue-500 transition-colors">
                  <FontAwesomeIcon icon={faCopy} className="text-xs" />
                </button>
              </div>
            )}
            
            {/* Analytics tab buttons — only when there's data */}
            {activeTab === 'analytics' && hasAnalyticsData && (
              <div className="flex items-center gap-3 animate-in fade-in duration-300 tooltip-bottom">
                <button onClick={handleAnalyticsClear} title="Clear Analytics" className="text-slate-400 hover:text-red-500 transition-colors">
                  <FontAwesomeIcon icon={faTrash} className="text-xs" />
                </button>
                <button onClick={handleAnalyticsCopy} title="Copy Analytics" className="text-slate-400 hover:text-blue-500 transition-colors">
                  <FontAwesomeIcon icon={faCopy} className="text-xs" />
                </button>
              </div>
            )}
            
            <div className="flex items-center border-l border-slate-200 dark:border-slate-700 ml-1 pl-3">
              <button 
                onClick={toggleExpand} 
                title={isExpanded ? "Restore Layout" : "Fill Gallery Area"}
                className={`transition-colors p-2 ${isExpanded ? 'text-blue-500 hover:text-blue-600' : 'text-slate-400 hover:text-blue-500'}`}
              >
                <FontAwesomeIcon icon={isExpanded ? faCompressAlt : faExpandAlt} className="text-xs" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`h-full w-full ${activeTab !== 'history' ? 'hidden' : ''}`}>
          <ExecutionHistory />
        </div>
        <div className={`h-full w-full ${activeTab !== 'analytics' ? 'hidden' : ''}`}>
          <TableTabContent
            executionResult={agentReplResults ? { ...executionResult, scriptName: 'Agent' } as any : executionResult}
            capturedDocTitle={agentReplResults ? agentCapturedDocTitle : (executionResult?.capturedDocTitle || null)}
            currentDocTitle={currentDocTitle}
            selectedScript={selectedScript}
            isHeaderPortalTarget={activeTab === 'analytics'}
            structuredOutputOverride={agentReplResults}
          />
        </div>

        {isExplaining && (
          <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-50">
             <FontAwesomeIcon icon={faMagicWandSparkles} spin className="text-blue-500 text-4xl mb-4" />
             <p className="text-lg font-bold text-slate-700 dark:text-slate-200 animate-pulse tracking-widest uppercase">AI ANALYZING</p>
          </div>
        )}
      </div>
    </div>
  );
};
