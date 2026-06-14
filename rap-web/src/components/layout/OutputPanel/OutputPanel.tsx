import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTerminal, faChartLine, faTrash, faCopy } from '@fortawesome/free-solid-svg-icons';
import { useConsole } from '@/features/automation/store/ConsoleContext';
import { useScriptExecution } from '@/features/automation';
import { ExecutionHistory } from '@/features/automation/components/ScriptInspector/ExecutionHistory';
import { TableTabContent } from '@/features/automation/components/ScriptInspector/TableTabContent';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { useNotifications } from '@/hooks/useNotifications';
import { useUI } from '@/hooks/useUI';

export const OutputPanel: React.FC = () => {
  const { localHistory, setLocalHistory } = useConsole();
  const { executionResult, clearExecutionResult, selectedScript } = useScriptExecution();
  const { revitStatus } = useRevitStatus();
  const { showNotification } = useNotifications();
  const { agentReplResults, setAgentReplResults, agentCapturedDocTitle } = useUI();

  const [activeTab, setActiveTab] = useState<'history' | 'analytics'>('history');
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const [hasUnviewedAnalytics, setHasUnviewedAnalytics] = useState(false);
  const [isFlashingAnalytics, setIsFlashingAnalytics] = useState(false);
  const [hasUnviewedHistory, setHasUnviewedHistory] = useState(false);
  const [isFlashingHistory, setIsFlashingHistory] = useState(false);

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

  const currentDocTitle = React.useMemo(() => revitStatus.document ? revitStatus.document.split(/[\\/]/).pop() || null : null, [revitStatus.document]);

  // ── History: Copy & Clear ────────────────────────────────────────────
  const hasHistoryData = localHistory.length > 0;

  const handleHistoryCopy = () => {
    const content = localHistory.map(item => (item.type === 'input' ? `> ${item.text}` : item.text)).join('\n');
    navigator.clipboard.writeText(content).then(() => showNotification("History copied to clipboard", "info"));
  };

  const handleHistoryClear = () => {
    setLocalHistory([]);
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

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-12 bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-gray-700 shrink-0 gap-2">
        <div className="flex items-center gap-1 shrink-0">
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

        {/* Portal target for analytics controls (search, nav, export) — injected by StructuredOutputViewer */}
        <div id="bottom-panel-portal-root" className="flex-1 flex items-center gap-2 min-w-0" />

        <div className="flex items-center gap-2 shrink-0">
          {/* History tab buttons — only when there's data */}
          {activeTab === 'history' && hasHistoryData && (
            <div className="flex items-center gap-2 animate-in fade-in duration-300">
              <button onClick={handleHistoryClear} title="Clear History" className="text-slate-400 hover:text-red-500 transition-colors p-1">
                <FontAwesomeIcon icon={faTrash} className="text-xs" />
              </button>
              <button onClick={handleHistoryCopy} title="Copy History" className="text-slate-400 hover:text-blue-500 transition-colors p-1">
                <FontAwesomeIcon icon={faCopy} className="text-xs" />
              </button>
            </div>
          )}

          {/* Analytics tab buttons — only when there's data */}
          {activeTab === 'analytics' && hasAnalyticsData && (
            <div className="flex items-center gap-2 animate-in fade-in duration-300">
              <button onClick={handleAnalyticsClear} title="Clear Analytics" className="text-slate-400 hover:text-red-500 transition-colors p-1">
                <FontAwesomeIcon icon={faTrash} className="text-xs" />
              </button>
              <button onClick={handleAnalyticsCopy} title="Copy Analytics" className="text-slate-400 hover:text-blue-500 transition-colors p-1">
                <FontAwesomeIcon icon={faCopy} className="text-xs" />
              </button>
            </div>
          )}
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
      </div>
    </div>
  );
};
