import React, { useRef, useEffect, useState } from 'react';
import { useConsole, ConsoleItem } from '../../store/ConsoleContext';
import { useScriptExecution } from '../../hooks/useScriptExecution';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs, atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '@/context/ThemeContext';

/**
 * Elapsed wall clock, for the console's run markers.
 * Under a minute: "12.4s". Over: "1m 23s".
 */
const formatDuration = (s: number): string => {
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s - m * 60);
  return `${m}m ${r.toString().padStart(2, '0')}s`;
};

/**
 * How long a run's loading flag may stay down before the run is considered
 * over. One run can drop and re-raise a flag (the REPL flag goes down before a
 * script result lands), and restarting the clock on every edge made a
 * multi-phase run report only its last fragment.
 */
const RUN_GRACE_MS = 1500;

export const ExecutionHistory: React.FC<{ showPipeline?: boolean }> = ({ showPipeline = true }) => {
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const {
    localHistory,
    isReplLoading,
    replFontSize,
  } = useConsole();
  const { runningScriptPath } = useScriptExecution();
  const { theme } = useTheme();

  const syntaxStyle = theme === 'light' ? vs : atomDark;
  const isRunning = !!runningScriptPath;

  // Live wall clock for whatever is in flight. The console is the only place
  // the elapsed time of a long command is visible at all: a finishing takeoff
  // runs for minutes, and a bare spinner says nothing about how far in it is.
  //
  // This drives the RUNNING indicator only. The finished duration is measured
  // around the request itself (ExecutionResult.elapsedMs) and written into the
  // history as a marker entry — a transition-based number here would be a
  // second, less accurate source for the same fact.
  //
  // Ticks once a second — the interval is deliberately 1 Hz rather than
  // animation-rate, because this component re-renders the whole history list
  // and a fast tick would compete with the very run it is timing.
  const busy = isRunning || isReplLoading;
  const [elapsedSec, setElapsedSec] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (busy) {
      if (startedAtRef.current === null) {
        startedAtRef.current = Date.now();
        setElapsedSec(0);
      }
      const id = window.setInterval(() => {
        if (startedAtRef.current !== null) {
          setElapsedSec((Date.now() - startedAtRef.current) / 1000);
        }
      }, 1000);
      return () => window.clearInterval(id);
    }
    const id = window.setTimeout(() => {
      startedAtRef.current = null;
      setElapsedSec(0);
    }, RUN_GRACE_MS);
    return () => window.clearTimeout(id);
  }, [busy]);

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

  const currentFontSize = replFontSize || 14;
  const calculatedLineHeight = Math.round(currentFontSize * 1.5);

  return (
    <div
      className="h-full w-full overflow-y-auto custom-scrollbar bg-slate-50/50 dark:bg-slate-900/40 font-mono select-text cursor-text relative"
      style={{ fontSize: `${currentFontSize}px`, lineHeight: `${calculatedLineHeight}px` }}
    >
      <div className="min-h-full pb-16 p-3 pl-5 pr-0">
        {(showPipeline
          ? localHistory
          : localHistory.map(item => ({
              ...item,
              text: item.text.split('\n').filter(line => !line.startsWith('Pipeline: [')).join('\n')
            })).filter(item => item.elapsedMs != null || item.text.trim() !== '')
        ).map((item: ConsoleItem, i: number) => (
          <div key={i} className={`mb-1 px-3 break-words whitespace-pre-wrap ${
            item.type === 'input' ? 'text-blue-600 dark:text-blue-400 font-bold' :
            item.type === 'error' ? 'text-red-600 dark:text-red-400 font-bold' :
            item.type === 'status' ? 'text-indigo-600 dark:text-indigo-400 font-semibold italic text-xs mt-2' :
            'text-gray-800 dark:text-gray-200'
          }`}>
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
            ) : item.elapsedMs != null ? (
              // Trailing marker of the run above — an ordinary history entry, so
              // it can never drift onto the next run's output.
              <>{`took ${formatDuration(item.elapsedMs / 1000)}`}</>
            ) : (<>{item.text}</>)}
          </div>
        ))}

        {isRunning && (
          <div className="mt-2 font-mono text-blue-500 animate-pulse flex items-center font-bold px-3">
            <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
            Executing... {Math.floor(elapsedSec)}s
          </div>
        )}

        {isReplLoading && (
          <div className="text-blue-400 flex items-center mt-2 px-3">
            <span className="mr-2 opacity-50 text-gray-400">{'>'}</span>
            <FontAwesomeIcon icon={faSpinner} spin className="mr-2 h-3 w-3" />
            <span className="animate-pulse">Processing... {Math.floor(elapsedSec)}s</span>
          </div>
        )}

        <div ref={consoleEndRef} />
      </div>
    </div>
  );
};
