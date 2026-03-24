import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { ExecutionResult } from "@/types/common";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faTrash, faMagicWandSparkles, faSpinner, faCheck, faTimes, faCode, faExpand, faCompress, faPlay, faSave, faFolderOpen, faCheckCircle, faFile } from '@fortawesome/free-solid-svg-icons';
import { useScriptExecution } from '../../index';
import { useScripts } from '../../index';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs, atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '@/context/ThemeContext';
import { REPLCodeEditor } from './REPLCodeEditor';
import { save, open } from '@tauri-apps/api/dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/api/fs';
import { trackEvent } from '@/utils/telemetry';

// V11: Decoupled REPL Laboratory with Deep/Selective Clear
interface ConsoleTabContentProps {
  isRunning: boolean;
  executionResult: ExecutionResult | null;
  scriptName: string;
  clearExecutionResult: () => void;
}

export const ConsoleTabContent: React.FC<ConsoleTabContentProps> = ({
  isRunning,
  executionResult,
  scriptName,
  clearExecutionResult,
}) => {
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const { selectedScript, setExecutionResult } = useScriptExecution();
  const { combinedScriptContent, reloadScript } = useScripts();
  const { revitStatus } = useRevitStatus();
  const { showNotification } = useNotifications();
  const { theme } = useTheme();
  const syntaxStyle = theme === 'eclipse' ? atomDark : (theme === 'light' ? vs : vscDarkPlus);

  const [isExplaining, setIsExplaining] = useState(false);
  const [aiResult, setAiResult] = useState<{ is_success: boolean, explanation: string, fixed_code?: string, filename?: string, files?: Record<string, string>, error_message?: string } | null>(null);
  const [isApplyingFix, setIsApplyingFix] = useState(false);
  
  const [singleLineValue, setSingleLineValue] = useState(() => localStorage.getItem('paracore_repl_single_value') || "");
  const [multiLineValue, setMultiLineValue] = useState(() => localStorage.getItem('paracore_repl_multi_value') || "");
  const [activeSnippetPath, setActiveSnippetPath] = useState<string | null>(() => localStorage.getItem('paracore_repl_active_path'));
  const [activeSnippetName, setActiveSnippetName] = useState<string | null>(() => localStorage.getItem('paracore_repl_active_name'));
  const [isReplLoading, setIsReplLoading] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isMultiLine, setIsMultiLine] = useState(() => localStorage.getItem('paracore_repl_multiline') === 'true');

  const [singleCommandHistory, setSingleCommandHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem('paracore_repl_single_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [multiCommandHistory, setMultiCommandHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem('paracore_repl_multi_history');
    return saved ? JSON.parse(saved) : [];
  });

  const [localHistory, setLocalHistory] = useState<{ type: 'input' | 'output' | 'error' | 'status', text: string, timestamp: Date, replType?: 'single' | 'multi' }[]>(() => {
    const saved = localStorage.getItem('paracore_console_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((item: { type: 'input' | 'output' | 'error' | 'status', text: string, timestamp: string | number | Date, replType?: 'single' | 'multi' }) => ({ ...item, timestamp: new Date(item.timestamp) }));
      } catch { return []; }
    }
    return [];
  });

  const handleClear = useCallback(() => {
    setLocalHistory([]);
    setAiResult(null);
    clearExecutionResult(); // Deep Clear: Includes Analytics Tab
    localStorage.removeItem('paracore_console_history');
    // Command histories (single-line & multi-line) are intentionally preserved
    showNotification("Console and Analytics cleared", "info");
  }, [showNotification, clearExecutionResult]);

  useEffect(() => { localStorage.setItem('paracore_console_history', JSON.stringify(localHistory)); }, [localHistory]);
  useEffect(() => { localStorage.setItem('paracore_repl_single_history', JSON.stringify(singleCommandHistory)); }, [singleCommandHistory]);
  useEffect(() => { localStorage.setItem('paracore_repl_multi_history', JSON.stringify(multiCommandHistory)); }, [multiCommandHistory]);
  useEffect(() => { localStorage.setItem('paracore_repl_single_value', singleLineValue); }, [singleLineValue]);
  useEffect(() => { localStorage.setItem('paracore_repl_multi_value', multiLineValue); }, [multiLineValue]);
  useEffect(() => { localStorage.setItem('paracore_repl_multiline', String(isMultiLine)); }, [isMultiLine]);
  useEffect(() => {
    if (activeSnippetPath) localStorage.setItem('paracore_repl_active_path', activeSnippetPath);
    else localStorage.removeItem('paracore_repl_active_path');
  }, [activeSnippetPath]);
  useEffect(() => {
    if (activeSnippetName) localStorage.setItem('paracore_repl_active_name', activeSnippetName);
    else localStorage.removeItem('paracore_repl_active_name');
  }, [activeSnippetName]);

  const handleReplSubmit = async () => {
    const command = isMultiLine ? multiLineValue.trim() : singleLineValue.trim();
    if (!command || isReplLoading) return;

    // Clear any open AI explanation overlay so the console is visible
    setAiResult(null);

    const currentReplType = (isMultiLine ? 'multi' : 'single') as 'multi' | 'single';

    if (command.toLowerCase() === 'help' || command === '?') {
      setLocalHistory(prev => [...prev,
      { type: 'input' as const, text: 'Help', timestamp: new Date(), replType: currentReplType },
      { type: 'output' as const, text: "🚀 PARCORE REPL QUICK START:\n" + 
                                       "✨ Discovery: GetElements(\"Walls\"), ListParams(wall), ListBIPs(wall)\n" +
                                       "🧠 Essentials: Selection[0], Println(x), vars, reset\n" +
                                       "📊 Analytics: Table(elements), BarChart(data), ListProperties(el)\n" +
                                       "🛠️ Modify: Transact(\"Name\", () => { ... }), Delete(elements)\n" +
                                       "📏 Units: 10.InputUnit(\"m2\"), area.OutputUnit(\"sqm\")\n" +
                                       "🧹 System: help, clear, cls", timestamp: new Date(), replType: currentReplType }
      ].slice(-100));
      if (!isMultiLine) setSingleLineValue(""); 
      return;
    }

    if (command.toLowerCase() === 'clear' || command.toLowerCase() === 'cls') {
      // Selective Clear: Console History Only
      setLocalHistory([]);
      localStorage.removeItem('paracore_console_history');
      if (!isMultiLine) setSingleLineValue("");
      showNotification("Console history cleared", "info");
      return;
    }
    
    if (!isMultiLine) setSingleLineValue("");
    setHistoryIndex(-1);
    setIsReplLoading(true);
    const identifier = isMultiLine ? (activeSnippetName || "Multi-Line REPL") : command;
    setLocalHistory(prev => [...prev, { type: 'status' as const, text: `> ${identifier}`, timestamp: new Date(), replType: currentReplType }].slice(-100));
    
    if (isMultiLine) setMultiCommandHistory(prev => [command, ...prev.filter(c => c !== command)].slice(0, 50));
    else setSingleCommandHistory(prev => [command, ...prev.filter(c => c !== command)].slice(0, 50));

    trackEvent('repl_executed', { repl_type: currentReplType });

    try {
      const response = await api.post("/api/repl", { code: command, session_id: "global" });
      if (response.data.is_success) {
        setExecutionResult({ 
          output: response.data.output || '', 
          isSuccess: true, 
          error: null, 
          structuredOutput: response.data.structured_output || [], 
          internalData: `REPL_${currentReplType.toUpperCase()}`, 
          timestamp: Date.now(), 
          scriptName: isMultiLine ? identifier : "REPL" 
        });
      } else {
        setExecutionResult({ 
          output: response.data.output || '', 
          isSuccess: false, 
          error: response.data.error_message || 'Error', 
          structuredOutput: [], 
          internalData: `REPL_${currentReplType.toUpperCase()}`, 
          timestamp: Date.now(), 
          scriptName: isMultiLine ? identifier : "REPL" 
        });
      }
    } catch (err: unknown) {
      setLocalHistory(prev => [...prev, { type: 'error' as const, text: `Error: ${(err as Error).message}`, timestamp: new Date(), replType: currentReplType }].slice(-100));
    } finally {
      setIsReplLoading(false);
      setTimeout(() => { if (isMultiLine) textareaRef.current?.focus(); else inputRef.current?.focus(); }, 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isMultiLine) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleReplSubmit(); }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReplSubmit(); }
    else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const history = isMultiLine ? multiCommandHistory : singleCommandHistory;
      if (historyIndex < history.length - 1) {
        const idx = historyIndex + 1;
        setHistoryIndex(idx);
        if (!isMultiLine) setSingleLineValue(history[idx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const history = isMultiLine ? multiCommandHistory : singleCommandHistory;
      if (historyIndex > 0) {
        const idx = historyIndex - 1;
        setHistoryIndex(idx);
        if (!isMultiLine) setSingleLineValue(history[idx]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        if (!isMultiLine) setSingleLineValue("");
      }
    }
  };

  const [fixHistory, setFixHistory] = useState<{ script_code: string, explanation: string, error_message: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastResultRef = useRef<ExecutionResult | null>(null);
  const lastHeaderScriptNameRef = useRef<string | null>(null);
  const needsHeaderForCurrentRunRef = useRef(false);
  const lastIsRunningRef = useRef(false);

  useEffect(() => {
    if (executionResult && executionResult !== lastResultRef.current) {
      lastResultRef.current = executionResult;
      
      const internalData = executionResult.internalData || "";
      const isRepl = internalData.startsWith('REPL');
      const replType: 'single' | 'multi' | undefined = isRepl ? (internalData.includes('MULTI') ? 'multi' : 'single') : undefined;

      if (executionResult.output) {
        setLocalHistory(prev => [...prev, { type: 'output' as const, text: String(executionResult.output), timestamp: new Date(), replType }].slice(-100));
      }
      if (executionResult.error) {
        setLocalHistory(prev => [...prev, { type: 'error' as const, text: String(executionResult.error), timestamp: new Date(), replType }].slice(-100));
      }
    }
  }, [executionResult]);

  useEffect(() => {
    const transitionedToRunning = isRunning && !lastIsRunningRef.current;
    lastIsRunningRef.current = isRunning;
    if (transitionedToRunning) needsHeaderForCurrentRunRef.current = true;
    const currentName = selectedScript?.name || scriptName;
    if (isRunning && needsHeaderForCurrentRunRef.current && currentName && currentName !== "Global Console") {
      setLocalHistory(prev => [...prev, { type: 'status' as const, text: `> ${currentName}`, timestamp: new Date() }].slice(-100));
      needsHeaderForCurrentRunRef.current = false;
    }
  }, [isRunning, scriptName, selectedScript]);

  const pendingResult = !isRunning && executionResult && executionResult !== lastResultRef.current ? executionResult : null;

  useEffect(() => { setAiResult(null); setFixHistory([]); lastResultRef.current = null; }, [selectedScript?.absolutePath]);
  const hasPendingResult = !!pendingResult;
  useEffect(() => { if (consoleEndRef.current) consoleEndRef.current.scrollIntoView({ behavior: "smooth" }); }, [localHistory.length, isRunning, isReplLoading, hasPendingResult]);
  useEffect(() => { setAiResult(null); }, [executionResult, isRunning]);

  const handleCopy = () => {
    let contentToCopy = localHistory.map(item => (item.type === 'input' ? `> ${item.text}` : item.text)).join('\n');
    const activeResult = pendingResult || executionResult;
    if (activeResult) {
      const activeText = (activeResult.output ? String(activeResult.output) : "") + (activeResult.error ? "\n" + String(activeResult.error) : "");
      if (activeText && localHistory[localHistory.length - 1]?.text !== activeText) contentToCopy += "\n\n" + activeText;
    }
    if (!contentToCopy) contentToCopy = isRunning ? "Executing..." : "Ready";
    navigator.clipboard.writeText(contentToCopy).then(() => showNotification("Copied", "info"));
  };

  const handleExplainError = useCallback(async () => {
    // Read the very last error from the local console history to be completely
    // precise about what the user is looking at.
    const lastErrorItem = [...localHistory].reverse().find(item => item.type === 'error');
    if (!lastErrorItem?.text) return;
    
    // Determine the source code to explain: 
    // Either the selected script, or if it's a REPL error, the multi-line editor content
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
        history: fixHistory
      });
      setAiResult(resp.data);
    } catch (err: unknown) { showNotification((err as Error).message, "error"); } finally { setIsExplaining(false); }
  }, [selectedScript, localHistory, combinedScriptContent, multiLineValue, activeSnippetPath, fixHistory, showNotification]);

  const handleApplyFix = useCallback(async () => {
    const path = selectedScript?.absolutePath || activeSnippetPath;
    if (!path || (!aiResult?.fixed_code && !aiResult?.files)) return;
    
    setIsApplyingFix(true);
    try {
      const payload: Record<string, unknown> = { script_path: path };
      if (aiResult.files) payload.files = aiResult.files; else { payload.content = aiResult.fixed_code; payload.filename = aiResult.filename; }
      const res = await api.post("/api/save-script", payload);
      if (res.data.success) { 
        showNotification("Applied", "success"); 
        setAiResult(null); 
        
        if (selectedScript) {
          await reloadScript(selectedScript); 
        } else if (aiResult.fixed_code) {
          // If it was a REPL snippet, update the editor directly
          setMultiLineValue(aiResult.fixed_code);
        }
      }
    } catch (err: unknown) { showNotification((err as Error).message, "error"); } finally { setIsApplyingFix(false); }
  }, [selectedScript, aiResult, activeSnippetPath, showNotification, reloadScript]);

  const handleSaveSnippet = async (forceSaveAs: boolean = false) => {
    if (!multiLineValue.trim()) return;
    try {
      let targetPath = activeSnippetPath;
      if (forceSaveAs || !targetPath) targetPath = await save({ filters: [{ name: 'C# Script', extensions: ['cs'] }], defaultPath: activeSnippetName ? `${activeSnippetName}.cs` : 'MyReplSnippet.cs' });
      if (targetPath) {
        await writeTextFile(targetPath, multiLineValue);
        setActiveSnippetPath(targetPath);
        const filename = targetPath.split(/[\\/]/).pop()?.replace('.cs', '') || "Snippet";
        setActiveSnippetName(filename);
        showNotification(forceSaveAs ? "Saved As" : "Saved", "success");
      }
    } catch (err: unknown) { showNotification((err as Error).message, "error"); }
  };

  const handleNewSnippet = () => {
    setMultiLineValue("");
    setActiveSnippetPath(null);
    setActiveSnippetName(null);
  };

  const handleLoadSnippet = async () => {
    try {
      const sel = await open({ multiple: false, filters: [{ name: 'C# Script', extensions: ['cs'] }] });
      if (sel && typeof sel === 'string') {
        const content = await readTextFile(sel);
        setMultiLineValue(content);
        setActiveSnippetPath(sel);
        const filename = sel.split(/[\\/]/).pop()?.replace('.cs', '') || "Snippet";
        setActiveSnippetName(filename);
        showNotification("Loaded", "success");
      }
    } catch (err: unknown) { showNotification((err as Error).message, "error"); }
  };

  const lastHistoryItem = localHistory.length > 0 ? localHistory[localHistory.length - 1] : null;
  
  // Logic for showing the AI button:
  // 1. Must be an error.
  // 2. Must NOT be any kind of REPL error (replType is undefined for standard scripts).
  // 3. Must have a selected script to apply the fix to.
  const showAiButton = !isRunning && !isExplaining && !aiResult && 
                       lastHistoryItem?.type === 'error' && 
                       !lastHistoryItem?.replType && 
                       !!selectedScript;

  if (aiResult) {
    return (
      <div className="absolute inset-0 z-10 p-4 w-full h-full box-border flex flex-col min-w-0">
        <div className="flex flex-col h-full w-full max-w-full min-w-0 p-4 bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-900 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 box-border">
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100 dark:border-gray-800 shrink-0">
            <h3 className="text-blue-600 dark:text-blue-400 font-bold flex items-center truncate"><FontAwesomeIcon icon={faMagicWandSparkles} className="mr-2" />AI Analysis</h3>
            <button onClick={() => setAiResult(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-2"><FontAwesomeIcon icon={faTimes} /></button>
          </div>
          <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar w-full min-w-0 text-gray-700 dark:text-gray-300">
            {/* Explanation section */}
            <div className="mb-4">
              {aiResult.explanation.split('\n').map((line, i) => line.startsWith('###') ? <h4 key={i} className="text-blue-600 dark:text-blue-400 mt-4 mb-2">{line.replace('###', '').trim()}</h4> : <p key={i} className="mb-2">{line}</p>)}
            </div>
            
            {/* Code review section */}
            {(aiResult.fixed_code || (aiResult.files && Object.keys(aiResult.files).length > 0)) && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                  <FontAwesomeIcon icon={faCheckCircle} className="text-green-500" />
                  Proposed Fix
                </h4>
                
                {aiResult.fixed_code && (
                  <div className="mb-4 flex flex-col min-w-0">
                    <div className="text-xs bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-3 py-1.5 rounded-t-lg border border-slate-300 dark:border-slate-700 font-mono flex items-center w-max max-w-full">
                      <span className="truncate">{aiResult.filename || 'Script.cs'}</span>
                    </div>
                    <div className="overflow-auto custom-scrollbar w-full min-w-0 bg-slate-100 dark:bg-slate-900 border-x border-b border-slate-300 dark:border-slate-700 rounded-b-lg code-viewer-override">
                      <SyntaxHighlighter
                        language="csharp"
                        style={syntaxStyle}
                        customStyle={{ margin: 0, padding: '0.75rem', fontSize: '0.75rem', backgroundColor: 'transparent', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}
                        codeTagProps={{ style: { fontFamily: 'inherit' } }}
                        wrapLines={true}
                      >
                        {aiResult.fixed_code}
                      </SyntaxHighlighter>
                    </div>
                  </div>
                )}

                {aiResult.files && Object.entries(aiResult.files).map(([filename, content], idx) => (
                  <div key={idx} className="mb-4 flex flex-col min-w-0">
                    <div className="text-xs bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-3 py-1.5 rounded-t-lg border border-slate-300 dark:border-slate-700 font-mono flex items-center w-max max-w-full">
                      <span className="truncate">{filename}</span>
                    </div>
                    <div className="overflow-auto custom-scrollbar w-full min-w-0 bg-slate-100 dark:bg-slate-900 border-x border-b border-slate-300 dark:border-slate-700 rounded-b-lg code-viewer-override">
                      <SyntaxHighlighter
                        language="csharp"
                        style={syntaxStyle}
                        customStyle={{ margin: 0, padding: '0.75rem', fontSize: '0.75rem', backgroundColor: 'transparent', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}
                        codeTagProps={{ style: { fontFamily: 'inherit' } }}
                        wrapLines={true}
                      >
                        {content}
                      </SyntaxHighlighter>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="pt-4 mt-2 border-t border-gray-100 dark:border-gray-800 flex justify-end space-x-3 shrink-0">
            <button className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors" onClick={() => setAiResult(null)}>Cancel</button>
            {(aiResult.fixed_code || (aiResult.files && Object.keys(aiResult.files).length > 0)) && (
              <button disabled={isApplyingFix} className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-5 rounded-lg font-bold shadow-md shadow-blue-500/20 active:scale-95 text-sm disabled:opacity-50 transition-all flex items-center gap-2" onClick={handleApplyFix}>
                {isApplyingFix ? <><FontAwesomeIcon icon={faSpinner} spin /> Applying...</> : "Apply Fix"}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tab-content pt-0 flex flex-col h-full relative overflow-hidden">
      <div className="flex-grow flex-shrink min-h-[100px] relative min-w-0 mb-4 px-0">
        <div 
          className="h-full w-full overflow-y-auto custom-scrollbar rounded bg-slate-50/50 dark:bg-slate-900/40 p-3 pl-5 pr-0 font-mono text-sm select-text cursor-text"
          style={{ scrollbarGutter: 'stable' }}>
          <div 
            className="min-h-full pb-12"
            onClick={() => { if (!window.getSelection()?.toString()) { if (isMultiLine) textareaRef.current?.focus(); else inputRef.current?.focus(); } }}
          >
            {localHistory.map((item, i) => (
              <div key={i} className={`mb-1 px-3 break-words whitespace-pre-wrap ${item.type === 'input' ? 'text-blue-600 dark:text-blue-400 font-bold' : item.type === 'error' ? 'text-red-600 dark:text-red-400 font-bold' : item.type === 'status' ? 'text-indigo-600 dark:text-indigo-400 font-semibold italic text-xs mt-2' : 'text-gray-800 dark:text-gray-200'}`}>
                {item.type === 'input' ? (
                  <div className="flex items-start">
                    <span className="mr-2 opacity-50 text-gray-400 shrink-0 mt-1">{'>'}</span>
                    <div className="flex-grow min-w-0">
                      <SyntaxHighlighter language="csharp" style={syntaxStyle} PreTag="div" customStyle={{ margin: 0, padding: 0, background: 'transparent', fontSize: 'inherit', fontFamily: 'inherit', lineHeight: 'inherit', width: '100%', overflow: 'visible', border: 'none', boxShadow: 'none' }} codeTagProps={{ style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all' } }}>{item.text}</SyntaxHighlighter>
                    </div>
                  </div>
                ) : (<>{item.text}</>)}
              </div>
            ))}
            {pendingResult && (
              <div className="mb-1 px-3 break-words whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                {pendingResult.output && <div>{pendingResult.output}</div>}
                {pendingResult.error && <div className="text-red-600 dark:text-red-400 font-bold">{pendingResult.error}</div>}
              </div>
            )}
            {isRunning && <div className="mt-2 font-mono text-blue-500 animate-pulse flex items-center font-bold px-3"><FontAwesomeIcon icon={faSpinner} spin className="mr-2" />Executing...</div>}
            {isReplLoading && <div className="text-blue-400 flex items-center mt-2 px-3"><span className="mr-2 opacity-50 text-gray-400">{'>'}</span><FontAwesomeIcon icon={faSpinner} spin className="mr-2 h-3 w-3" /><span className="animate-pulse">Processing...</span></div>}
            <div ref={consoleEndRef} />
          </div>
        </div>
        {isExplaining && <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-40 rounded-lg"><FontAwesomeIcon icon={faSpinner} spin className="text-blue-500 text-4xl mb-4" /><p className="text-lg font-semibold text-gray-700 dark:text-gray-300 animate-pulse">AI is analyzing...</p></div>}
      </div>

      <div className="pb-2 flex flex-col space-y-2 pl-5 pr-0 flex-shrink-0 z-20">
        <div className="flex justify-between items-center pr-5 h-6">
          <div className="flex items-center gap-2 overflow-hidden">
            {isMultiLine && activeSnippetName ? (
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <FontAwesomeIcon icon={faCode} className="text-[10px]" />
                <span className="text-[11px] font-bold tracking-wider italic truncate">{activeSnippetName}</span>
              </div>
            ) : (
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 shrink-0">{isMultiLine ? "Multi-Line REPL" : "Single-Line REPL"}</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {isMultiLine && (
              <>
                <button onClick={handleNewSnippet} className="text-slate-400 hover:text-green-500 transition-colors flex items-center text-[11px] font-bold"><FontAwesomeIcon icon={faFile} className="mr-1.5 text-[10px]" />New</button>
                <button onClick={handleLoadSnippet} className="text-slate-400 hover:text-blue-500 transition-colors flex items-center text-[11px] font-bold"><FontAwesomeIcon icon={faFolderOpen} className="mr-1.5 text-[10px]" />Load</button>
                <button onClick={() => handleSaveSnippet(false)} className={`transition-colors flex items-center text-[11px] font-bold ${activeSnippetPath ? 'text-slate-400 hover:text-blue-500' : 'text-slate-300 dark:text-slate-600 cursor-default'}`} disabled={!activeSnippetPath}><FontAwesomeIcon icon={faSave} className="mr-1.5 text-[10px]" />Save</button>
                <button onClick={() => handleSaveSnippet(true)} className="text-slate-400 hover:text-blue-500 transition-colors flex items-center text-[11px] font-bold"><FontAwesomeIcon icon={faSave} className="mr-1.5 text-[10px] opacity-50" />As...</button>
              </>
            )}
            <button onClick={() => setIsMultiLine(!isMultiLine)} className="text-slate-400 hover:text-blue-500 transition-colors flex items-center text-[11px] font-bold"><FontAwesomeIcon icon={isMultiLine ? faCompress : faExpand} className="mr-1.5 text-[10px]" />{isMultiLine ? "Collapse" : "Expand"}</button>
          </div>
        </div>

        <div className="relative w-full">
          {isMultiLine ? (
            <REPLCodeEditor ref={textareaRef} value={multiLineValue} onChange={setMultiLineValue} onKeyDown={(e) => { if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSaveSnippet(false); } else handleKeyDown(e); }} disabled={isReplLoading || isRunning} placeholder="Code... (Ctrl+Enter)" />
          ) : (
            <div className="relative pr-5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500 font-bold opacity-50 pointer-events-none select-none text-sm">{'>'}</span>
              <input ref={inputRef} type="text" value={singleLineValue} onChange={(e) => setSingleLineValue(e.target.value)} onKeyDown={handleKeyDown} placeholder="Command..." disabled={isReplLoading || isRunning} className="w-full pl-7 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-900 dark:text-white transition-all font-mono" style={{ borderColor: 'var(--border-divider)' }} />
            </div>
          )}
        </div>
      </div>

      <div className="pt-3 pb-4 flex justify-between items-center bg-white/80 dark:bg-slate-800/60 backdrop-blur-sm z-30 px-5">
        <div className="flex-shrink-0">
          {showAiButton && <button className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400 py-1 px-3 rounded-md font-bold flex items-center border border-red-200 dark:border-red-800 transition-all active:scale-95 text-sm shadow-sm" onClick={handleExplainError}><FontAwesomeIcon icon={faMagicWandSparkles} className="mr-2" />Explain & Fix</button>}
        </div>
        <div className="flex items-center space-x-2">
          <button className="bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 py-1 px-3 rounded-md font-bold flex items-center border border-blue-200 dark:border-blue-800 transition-all active:scale-95 text-sm shadow-sm" onClick={handleClear}><FontAwesomeIcon icon={faTrash} className="mr-2" />Clear</button>
          <button className="bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 py-1 px-3 rounded-md font-bold flex items-center border border-blue-200 dark:border-blue-800 transition-all active:scale-95 text-sm shadow-sm" onClick={handleCopy}><FontAwesomeIcon icon={faCopy} className="mr-2" />Copy</button>
          {isMultiLine && <button disabled={isReplLoading || isRunning || !multiLineValue.trim()} className="bg-blue-600 hover:bg-blue-700 text-white py-1 px-4 rounded-md font-bold flex items-center shadow-lg transition-all active:scale-95 text-sm disabled:opacity-50" onClick={handleReplSubmit}><FontAwesomeIcon icon={faPlay} className="mr-2 h-3" />RUN</button>}
        </div>
      </div>
    </div>
  );
};
