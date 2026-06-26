import React, { useRef, useEffect } from 'react';
import { useConsole, ConsoleItem } from '../../store/ConsoleContext';
import { useScriptExecution } from '../../hooks/useScriptExecution';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs, atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '@/context/ThemeContext';

export const ExecutionHistory: React.FC<{ showPipeline?: boolean }> = ({ showPipeline = true }) => {
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const {
    localHistory,
    isReplLoading,
  } = useConsole();
  const { runningScriptPath } = useScriptExecution();
  const { theme } = useTheme();

  const syntaxStyle = theme === 'eclipse' ? atomDark : (theme === 'light' ? vs : vscDarkPlus);
  const isRunning = !!runningScriptPath;

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
    <div className="h-full w-full overflow-y-auto custom-scrollbar bg-slate-50/50 dark:bg-slate-900/40 p-3 pl-5 pr-0 font-mono text-sm select-text cursor-text relative">
      <div className="min-h-full pb-16">
        {(showPipeline
          ? localHistory
          : localHistory.map(item => ({
              ...item,
              text: item.text.split('\n').filter(line => !line.startsWith('Pipeline: [')).join('\n')
            })).filter(item => item.text.trim() !== '')
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
