import React, { useRef, useEffect, useState } from 'react';
import { useConsole, ConsoleItem } from '../../store/ConsoleContext';
import { useScriptExecution } from '../../hooks/useScriptExecution';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faClock } from '@fortawesome/free-solid-svg-icons';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs, atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '@/context/ThemeContext';

type LogFilter = 'all' | 'errors' | 'input-output';

export const ExecutionHistory: React.FC<{ showPipeline?: boolean }> = ({ showPipeline = true }) => {
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const {
    localHistory,
    isReplLoading,
  } = useConsole();
  const { runningScriptPath } = useScriptExecution();
  const { theme } = useTheme();
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  const [showTimestamps, setShowTimestamps] = useState(false);

  const syntaxStyle = theme === 'eclipse' ? atomDark : (theme === 'light' ? vs : vscDarkPlus);
  const isRunning = !!runningScriptPath;

  // Filter and prepare items
  const filteredHistory = (() => {
    let items = showPipeline
      ? localHistory
      : localHistory.map(item => ({
            ...item,
            text: item.text.split('\n').filter(line => !line.startsWith('Pipeline: [')).join('\n')
          })).filter(item => item.text.trim() !== '');

    if (logFilter === 'errors') return items.filter(item => item.type === 'error');
    if (logFilter === 'input-output') return items.filter(item => item.type === 'input' || item.type === 'output');
    return items;
  })();

  const errorCount = localHistory.filter(item => item.type === 'error').length;

  const didMountRef = useRef(false);
  useEffect(() => {
    if (consoleEndRef.current) {
      if (!didMountRef.current) {
        didMountRef.current = true;
        consoleEndRef.current.scrollIntoView({ behavior: "auto" });
        return;
      }
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [localHistory.length, isRunning, isReplLoading]);

  return (
    <div className="h-full w-full overflow-y-auto custom-scrollbar bg-slate-50/50 dark:bg-slate-900/40 font-mono text-sm select-text cursor-text relative">
      {/* Log filter bar */}
      {localHistory.length > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-1 px-3 py-1.5 bg-slate-50/95 dark:bg-slate-900/95 border-b border-border/50 backdrop-blur-sm">
          <div className="flex items-center gap-0.5">
            {(['all', 'errors', 'input-output'] as LogFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setLogFilter(f)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  logFilter === f
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {f === 'all' ? 'All' : f === 'errors' ? `Errors${errorCount > 0 ? ` (${errorCount})` : ''}` : 'I/O'}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <button
            onClick={() => setShowTimestamps(!showTimestamps)}
            className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              showTimestamps ? 'text-blue-500' : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Toggle timestamps"
          >
            <FontAwesomeIcon icon={faClock} className="text-[10px]" />
          </button>
        </div>
      )}
      <div className="min-h-full pb-16 p-3 pl-5 pr-0">
        {filteredHistory.map((item: ConsoleItem, i: number) => (
          <div key={i} className={`mb-1 px-3 break-words whitespace-pre-wrap ${
            item.type === 'input' ? 'text-blue-600 dark:text-blue-400 font-bold' :
            item.type === 'error' ? 'text-red-600 dark:text-red-400 font-bold' :
            item.type === 'status' ? 'text-indigo-600 dark:text-indigo-400 font-semibold italic text-xs mt-2' :
            'text-gray-800 dark:text-gray-200'
          }`}>
            {showTimestamps && item.timestamp && (
              <span className="text-[10px] text-muted-foreground mr-2 select-none">
                {item.timestamp.toLocaleTimeString()}
              </span>
            )}
            {item.type === 'input' ? (
              <div className="flex items-start">
                <span className="mr-2 opacity-50 text-gray-400 shrink-0 mt-1">{'>'}</span>
                <div className="flex-grow min-w-0">
                  <SyntaxHighlighter
                    language="csharp"
                    style={syntaxStyle}
                    PreTag="div"
                    customStyle={{ margin: 0, padding: 0, background: 'transparent', fontSize: 'inherit', fontFamily: 'inherit', lineHeight: 'inherit', width: '100%', overflow: 'visible', border: 'none', boxShadow: 'none' }}
                    codeTagProps={{ style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all' } }}
                  >
                    {item.text}
                  </SyntaxHighlighter>
                </div>
              </div>
            ) : (<>{item.text}</>)}
          </div>
        ))}

        {isRunning && (
          <div className="mt-2 font-mono text-blue-500 animate-pulse flex items-center font-bold px-3">
            <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
            Executing...
          </div>
        )}

        {isReplLoading && (
          <div className="text-blue-400 flex items-center mt-2 px-3">
            <span className="mr-2 opacity-50 text-gray-400">{'>'}</span>
            <FontAwesomeIcon icon={faSpinner} spin className="mr-2 h-3 w-3" />
            <span className="animate-pulse">Processing...</span>
          </div>
        )}

        <div ref={consoleEndRef} />
      </div>
    </div>
  );
};
