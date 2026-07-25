import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash, faCopy } from '@fortawesome/free-solid-svg-icons';
import { Tooltip } from '@/components/common/Tooltip';
import { useConsole } from '@/features/automation/store/ConsoleContext';
import { useScriptExecution } from '@/features/automation';
import { ExecutionHistory } from '@/features/automation/components/ScriptInspector/ExecutionHistory';
import { TableTabContent } from '@/features/automation/components/ScriptInspector/TableTabContent';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { useNotifications } from '@/hooks/useNotifications';
export const OutputPanel: React.FC = () => {
  const { localHistory, setLocalHistory } = useConsole();
  const { executionResult, clearExecutionResult, selectedScript } = useScriptExecution();
  const { revitStatus } = useRevitStatus();
  const { showNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState<'history' | 'analytics'>('history');
  const [showPipeline, setShowPipeline] = useState(() => {
    const stored = localStorage.getItem('paracore_show_pipeline');
    return stored !== null ? stored === 'true' : true;
  });
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const [hasUnviewedAnalytics, setHasUnviewedAnalytics] = useState(false);
  const [isFlashingAnalytics, setIsFlashingAnalytics] = useState(false);
  const [hasUnviewedHistory, setHasUnviewedHistory] = useState(false);
  const [isFlashingHistory, setIsFlashingHistory] = useState(false);

  // Analytics badge — only fires when data changes, not on tab switches
  useEffect(() => {
    const hasAnalytics = executionResult?.structuredOutput?.some(item =>
      ['table', 'chart-bar', 'chart-pie', 'chart-line'].includes(item.type)
    );
    if (!hasAnalytics) return;

    setIsFlashingAnalytics(true);
    setTimeout(() => setIsFlashingAnalytics(false), 1000);
    if (activeTabRef.current !== 'analytics') {
      setHasUnviewedAnalytics(true);
    }
  }, [executionResult]);

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
  const structuredOutput = executionResult?.structuredOutput;
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
    showNotification("Analytics cleared", "info");
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-12 bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-gray-700 shrink-0 gap-2">
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setActiveTab('history')}
            className={`px-3 h-12 flex items-center border-b-2 transition-all relative text-sm font-medium ${activeTab === 'history' ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
          >
            History
            {hasUnviewedHistory && (
              <span className="absolute top-2 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500 border border-white dark:border-slate-800"></span>
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`px-3 h-12 flex items-center border-b-2 transition-all relative text-sm font-medium ${activeTab === 'analytics' ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
          >
            Analytics
            {hasUnviewedAnalytics && (
              <span className="absolute top-2 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500 border border-white dark:border-slate-800"></span>
              </span>
            )}
          </button>
        </div>

        {/* Portal target for analytics controls (search, nav, export) — injected by StructuredOutputViewer */}
        <div id="bottom-panel-portal-root" className="flex-1 flex items-center gap-2 min-w-0" />

        <div className="flex items-center gap-2 shrink-0">
          {/* Pipeline toggle — always visible */}
          {activeTab === 'history' && (
            <label className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showPipeline}
                onChange={(e) => {
                  setShowPipeline(e.target.checked);
                  localStorage.setItem('paracore_show_pipeline', String(e.target.checked));
                }}
                className="w-3 h-3 accent-blue-500 cursor-pointer"
              />
              Pipeline
            </label>
          )}

          {/* History tab buttons — only when there's data */}
          {activeTab === 'history' && hasHistoryData && (
            <div className="flex items-center gap-2 animate-in fade-in duration-300">
              <Tooltip text="Clear" position="bottom">
                <button onClick={handleHistoryClear} className="text-slate-400 hover:text-red-500 transition-colors p-1">
                  <FontAwesomeIcon icon={faTrash} className="text-xs" />
                </button>
              </Tooltip>
              <Tooltip text="Copy" position="bottom">
                <button onClick={handleHistoryCopy} className="text-slate-400 hover:text-blue-500 transition-colors p-1">
                  <FontAwesomeIcon icon={faCopy} className="text-xs" />
                </button>
              </Tooltip>
            </div>
          )}

          {/* Analytics tab buttons — only when there's data */}
          {activeTab === 'analytics' && hasAnalyticsData && (
            <div className="flex items-center gap-2 animate-in fade-in duration-300">
              <Tooltip text="Clear" position="bottom">
                <button onClick={handleAnalyticsClear} className="text-slate-400 hover:text-red-500 transition-colors p-1">
                  <FontAwesomeIcon icon={faTrash} className="text-xs" />
                </button>
              </Tooltip>
              <Tooltip text="Copy" position="bottom">
                <button onClick={handleAnalyticsCopy} className="text-slate-400 hover:text-blue-500 transition-colors p-1">
                  <FontAwesomeIcon icon={faCopy} className="text-xs" />
                </button>
              </Tooltip>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        <div className={`h-full w-full ${activeTab !== 'history' ? 'hidden' : ''}`}>
          <ExecutionHistory showPipeline={showPipeline} />
        </div>
        <div className={`h-full w-full ${activeTab !== 'analytics' ? 'hidden' : ''}`}>
          <TableTabContent
            executionResult={executionResult}
            capturedDocTitle={executionResult?.capturedDocTitle || null}
            currentDocTitle={currentDocTitle}
            selectedScript={selectedScript}
            isHeaderPortalTarget={activeTab === 'analytics'}
            structuredOutputOverride={null}
          />
        </div>
      </div>
    </div>
  );
};
