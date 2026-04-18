import React, { useRef, useEffect, useCallback } from 'react';
import { useConsole, ConsoleItem } from '../../store/ConsoleContext';
import { useScriptExecution } from '../../hooks/useScriptExecution';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner, faMagicWandSparkles, faTimes, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs, atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '@/context/ThemeContext';
import { useNotifications } from '@/hooks/useNotifications';
import api from '@/api/axios';
import { useScripts } from '../../hooks/useScripts';

export const ExecutionHistory: React.FC = () => {
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const { 
    localHistory, 
    isReplLoading, 
    aiResult, 
    setAiResult, 
    isExplaining, 
    setIsExplaining,
    multiLineValue,
    setMultiLineValue,
    activeSnippetPath
  } = useConsole();
  const { runningScriptPath, selectedScript } = useScriptExecution();
  const { combinedScriptContent, reloadScript } = useScripts();
  const { showNotification } = useNotifications();
  const { theme } = useTheme();
  
  const syntaxStyle = theme === 'eclipse' ? atomDark : (theme === 'light' ? vs : vscDarkPlus);
  const isRunning = !!runningScriptPath;

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [localHistory.length, isRunning, isReplLoading]);

  const lastHistoryItem = localHistory.length > 0 ? localHistory[localHistory.length - 1] : null;
  const showAiButton = !isRunning && !isExplaining && !aiResult && 
                       lastHistoryItem?.type === 'error' && 
                       !lastHistoryItem?.replType && 
                       !!selectedScript;

  const handleExplainError = useCallback(async () => {
    const lastErrorItem = [...localHistory].reverse().find(item => item.type === 'error');
    if (!lastErrorItem?.text) return;
    
    const path = selectedScript?.absolutePath || activeSnippetPath;
    const code = selectedScript ? combinedScriptContent : multiLineValue;

    if (!path || !code) return;

    setIsExplaining(true);
    try {
      const resp = await api.post("/generation/explain_error", { 
        script_code: code, 
        script_path: path, 
        error_message: lastErrorItem.text,
        llm_provider: localStorage.getItem('llmProvider'), 
        llm_model: localStorage.getItem('llmModel'), 
        llm_api_key_value: localStorage.getItem('llmApiKeyValue'),
        history: []
      });
      setAiResult(resp.data);
    } catch (err: any) { showNotification(err.message, "error"); } finally { setIsExplaining(false); }
  }, [selectedScript, localHistory, combinedScriptContent, multiLineValue, activeSnippetPath, setIsExplaining, setAiResult, showNotification]);

  const [isApplyingFix, setIsApplyingFix] = React.useState(false);
  const handleApplyFix = useCallback(async () => {
    const path = selectedScript?.absolutePath || activeSnippetPath;
    if (!path || (!aiResult?.fixed_code && !aiResult?.files)) return;
    
    setIsApplyingFix(true);
    try {
      const payload: any = { script_path: path };
      if (aiResult.files) payload.files = aiResult.files; 
      else { payload.content = aiResult.fixed_code; payload.filename = aiResult.filename; }
      const res = await api.post("/api/save-script", payload);
      if (res.data.success) { 
        showNotification("Applied", "success"); 
        setAiResult(null); 
        if (selectedScript) await reloadScript(selectedScript); 
        else if (aiResult.fixed_code) setMultiLineValue(aiResult.fixed_code);
      }
    } catch (err: any) { showNotification(err.message, "error"); } finally { setIsApplyingFix(false); }
  }, [selectedScript, aiResult, activeSnippetPath, showNotification, reloadScript, setMultiLineValue, setAiResult]);

  if (aiResult) {
    return (
      <div className="absolute inset-0 z-50 p-4 w-full h-full box-border flex flex-col bg-white dark:bg-slate-900">
        <div className="flex flex-col h-full w-full p-4 bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-900 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100 dark:border-gray-800 shrink-0">
            <h3 className="text-blue-600 dark:text-blue-400 font-bold flex items-center truncate"><FontAwesomeIcon icon={faMagicWandSparkles} className="mr-2" />AI Analysis</h3>
            <button onClick={() => setAiResult(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-2"><FontAwesomeIcon icon={faTimes} /></button>
          </div>
          <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar w-full min-w-0 text-gray-700 dark:text-gray-300">
            <div className="mb-4">
              {aiResult.explanation.split('\n').map((line: string, i: number) => line.startsWith('###') ? <h4 key={i} className="text-blue-600 dark:text-blue-400 mt-4 mb-2">{line.replace('###', '').trim()}</h4> : <p key={i} className="mb-2">{line}</p>)}
            </div>
            
            {(aiResult.fixed_code || (aiResult.files && Object.keys(aiResult.files).length > 0)) && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faCheckCircle} className="text-green-500" />
                  Proposed Fix
                </h4>
                {aiResult.fixed_code && (
                  <div className="mb-4 flex flex-col min-w-0">
                    <div className="text-xs bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-3 py-1.5 rounded-t-lg border border-slate-300 dark:border-slate-700 font-mono flex items-center w-max max-w-full truncate">{aiResult.filename || 'Script.cs'}</div>
                    <div className="overflow-auto custom-scrollbar w-full min-w-0 bg-slate-100 dark:bg-slate-900 border-x border-b border-slate-300 dark:border-slate-700 rounded-b-lg">
                      <SyntaxHighlighter language="csharp" style={syntaxStyle} customStyle={{ margin: 0, padding: '0.75rem', fontSize: '0.75rem', backgroundColor: 'transparent' }}>{aiResult.fixed_code}</SyntaxHighlighter>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="pt-4 mt-2 border-t border-gray-100 dark:border-gray-800 flex justify-end space-x-3 shrink-0">
            <button className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors" onClick={() => setAiResult(null)}>Cancel</button>
            <button disabled={isApplyingFix} className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-5 rounded-lg font-bold text-sm disabled:opacity-50 transition-all flex items-center gap-2" onClick={handleApplyFix}>
              {isApplyingFix ? <><FontAwesomeIcon icon={faSpinner} spin /> Applying...</> : "Apply Fix"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto custom-scrollbar bg-slate-50/50 dark:bg-slate-900/40 p-3 pl-5 pr-0 font-mono text-sm select-text cursor-text relative" style={{ scrollbarGutter: 'stable' }}>
      <div className="min-h-full pb-16">
        {localHistory.map((item: ConsoleItem, i: number) => (
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

        {showAiButton && (
          <div className="mt-4 px-3">
            <button className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400 py-1.5 px-4 rounded-md font-bold flex items-center border border-red-200 dark:border-red-800 transition-all active:scale-95 text-xs shadow-sm" onClick={handleExplainError}>
              <FontAwesomeIcon icon={faMagicWandSparkles} className="mr-2" />
              Explain & Fix
            </button>
          </div>
        )}
        
        <div ref={consoleEndRef} />
      </div>
    </div>
  );
};
