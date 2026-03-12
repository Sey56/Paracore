import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { ScriptExecutionResult } from "@/types/scriptModel";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faTrash, faMagicWandSparkles, faSpinner, faCheck, faTimes, faCode, faExpand, faCompress, faPlay, faSave, faFolderOpen } from '@fortawesome/free-solid-svg-icons';
import { useScriptExecution } from '../../index';
import { useScripts } from '../../index';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '@/context/ThemeContext';
import { REPLCodeEditor } from './REPLCodeEditor';
import { save, open } from '@tauri-apps/api/dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/api/fs';

interface ConsoleTabContentProps {
  isRunning: boolean;
  executionResult: ScriptExecutionResult | null;
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
  const { selectedScript, runScript, setExecutionResult } = useScriptExecution();
  const { combinedScriptContent, reloadScript } = useScripts();
  const { revitStatus } = useRevitStatus();
  const { showNotification } = useNotifications();
  const { theme } = useTheme();
  const syntaxStyle = theme === 'light' ? vs : vscDarkPlus;

  const [isExplaining, setIsExplaining] = useState(false);
  const [aiResult, setAiResult] = useState<{
    is_success: boolean,
    explanation: string,
    fixed_code?: string,
    filename?: string,
    files?: Record<string, string>,
    error_message?: string
  } | null>(null);
  const [isApplyingFix, setIsApplyingFix] = useState(false);
  const [singleLineValue, setSingleLineValue] = useState(() => localStorage.getItem('paracore_repl_single_value') || "");
  const [multiLineValue, setMultiLineValue] = useState(() => localStorage.getItem('paracore_repl_multi_value') || "");
  const [activeSnippetPath, setActiveSnippetPath] = useState<string | null>(() => localStorage.getItem('paracore_repl_active_path'));
  const [activeSnippetName, setActiveSnippetName] = useState<string | null>(() => localStorage.getItem('paracore_repl_active_name'));
  const [isReplLoading, setIsReplLoading] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isMultiLine, setIsMultiLine] = useState(() => localStorage.getItem('paracore_repl_multiline') === 'true');

  const replValue = isMultiLine ? multiLineValue : singleLineValue;
  const setReplValue = isMultiLine ? setMultiLineValue : setSingleLineValue;

  const [localHistory, setLocalHistory] = useState<{ type: 'input' | 'output' | 'error' | 'status', text: string, timestamp: Date, isRepl?: boolean }[]>(() => {
    const saved = localStorage.getItem('paracore_console_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((item: any) => ({ ...item, timestamp: new Date(item.timestamp) }));
      } catch { return []; }
    }
    return [];
  });

  const [commandHistory, setCommandHistory] = useState<string[]>(() => {
    const saved = localStorage.getItem('paracore_command_history');
    return saved ? JSON.parse(saved) : [];
  });

  const handleClear = useCallback(() => {
    setLocalHistory([]);
    setCommandHistory([]);
    setAiResult(null);
    lastHeaderScriptNameRef.current = null;
    localStorage.removeItem('paracore_console_history');
    localStorage.removeItem('paracore_command_history');
    showNotification("Console cleared", "info");
  }, [showNotification]);

  const [fixHistory, setFixHistory] = useState<{ script_code: string, explanation: string, error_message: string }[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastResultRef = useRef<ScriptExecutionResult | null>(null);
  const lastHeaderScriptNameRef = useRef<string | null>(null);
  const needsHeaderForCurrentRunRef = useRef(false);
  const lastIsRunningRef = useRef(false);

  useEffect(() => {
    if (executionResult && executionResult !== lastResultRef.current) {
      lastResultRef.current = executionResult;
      if (executionResult.output) {
        setLocalHistory(prev => [...prev, { 
          type: 'output' as const, 
          text: String(executionResult.output), 
          timestamp: new Date(), 
          isRepl: executionResult.internal_data === 'REPL'
        }].slice(-100));
      }
      if (executionResult.error) {
        setLocalHistory(prev => [...prev, { 
          type: 'error' as const, 
          text: String(executionResult.error), 
          timestamp: new Date(), 
          isRepl: executionResult.internal_data === 'REPL'
        }].slice(-100));
      }
    }
  }, [executionResult]);

  useEffect(() => {
    const transitionedToRunning = isRunning && !lastIsRunningRef.current;
    lastIsRunningRef.current = isRunning;
    if (transitionedToRunning) needsHeaderForCurrentRunRef.current = true;
    const currentName = selectedScript?.name || scriptName;
    if (isRunning && needsHeaderForCurrentRunRef.current && currentName && currentName !== "Global Console") {
      setLocalHistory(prev => [...prev, { type: 'status' as const, text: `> ${currentName}`, timestamp: new Date(), isRepl: false }].slice(-100));
      needsHeaderForCurrentRunRef.current = false;
    }
  }, [isRunning, scriptName, selectedScript]);

  const pendingResult = !isRunning && executionResult && executionResult !== lastResultRef.current ? executionResult : null;

  useEffect(() => {
    setAiResult(null);
    setFixHistory([]);
    lastResultRef.current = null;
  }, [selectedScript?.absolutePath]);

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [localHistory.length, isRunning, isReplLoading, !!pendingResult]);

  useEffect(() => { localStorage.setItem('paracore_console_history', JSON.stringify(localHistory)); }, [localHistory]);
  useEffect(() => { localStorage.setItem('paracore_command_history', JSON.stringify(commandHistory)); }, [commandHistory]);
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

  useEffect(() => { setAiResult(null); }, [executionResult, isRunning]);

  const handleCopy = () => {
    let contentToCopy = localHistory.map(item => (item.type === 'input' ? `> ${item.text}` : item.text)).join('\n');
    const activeResult = pendingResult || executionResult;
    if (activeResult) {
      const activeLines: string[] = [];
      if (activeResult.output) activeLines.push(String(activeResult.output));
      if (activeResult.error) activeLines.push(String(activeResult.error));
      const activeText = activeLines.join('\n');
      const lastHistoryItem = localHistory.length > 0 ? localHistory[localHistory.length - 1] : null;
      if (activeText && lastHistoryItem?.text !== activeText) {
        if (contentToCopy) contentToCopy += "\n\n";
        contentToCopy += activeText;
      }
    }
    if (!contentToCopy) contentToCopy = isRunning ? "Executing..." : "Ready";
    navigator.clipboard.writeText(contentToCopy).then(() => showNotification("Console content copied to clipboard", "info"));
  };

  const handleExplainError = useCallback(async () => {
    if (!selectedScript || !executionResult?.error) return;
    setIsExplaining(true);
    setAiResult(null);
    try {
      const llmProvider = localStorage.getItem('llmProvider');
      const llmModel = localStorage.getItem('llmModel');
      const llmApiKeyValue = localStorage.getItem('llmApiKeyValue');
      if (!llmProvider || !llmModel || !llmApiKeyValue) {
        showNotification("Please configure settings.", "warning");
        setIsExplaining(false);
        return;
      }
      const response = await api.post("/generation/explain_error", {
        script_code: combinedScriptContent || "",
        script_path: selectedScript.absolutePath,
        error_message: executionResult.error,
        context: { document: revitStatus.document || "Unknown", script_name: scriptName },
        llm_provider: llmProvider, llm_model: llmModel, llm_api_key_value: llmApiKeyValue,
        history: fixHistory
      });
      setAiResult(response.data);
    } catch (err: any) { showNotification(err.message, "error"); } finally { setIsExplaining(false); }
  }, [selectedScript, executionResult, combinedScriptContent, revitStatus, scriptName, showNotification, fixHistory]);

  const handleApplyFix = useCallback(async () => {
    if (!selectedScript || (!aiResult?.fixed_code && !aiResult?.files)) return;
    setIsApplyingFix(true);
    try {
      const payload: any = { script_path: selectedScript.absolutePath };
      if (aiResult.files) payload.files = aiResult.files;
      else { payload.content = aiResult.fixed_code; payload.filename = aiResult.filename; }
      const response = await api.post("/api/save-script", payload);
      if (response.data.success) {
        showNotification("✨ Fix applied!", "success");
        setAiResult(null);
        await reloadScript(selectedScript);
      }
    } catch (err: any) { showNotification(err.message, "error"); } finally { setIsApplyingFix(false); }
  }, [selectedScript, aiResult, showNotification, reloadScript]);

  const handleSaveSnippet = async (forceSaveAs: boolean = false) => {
    if (!multiLineValue.trim()) return;
    try {
      let targetPath = activeSnippetPath;
      if (forceSaveAs || !targetPath) {
        targetPath = await save({
          filters: [{ name: 'C# Script', extensions: ['cs'] }],
          defaultPath: activeSnippetName ? `${activeSnippetName}.cs` : 'MyReplSnippet.cs'
        });
      }
      if (targetPath) {
        await writeTextFile(targetPath, multiLineValue);
        setActiveSnippetPath(targetPath);
        const filename = targetPath.split(/[\\/]/).pop()?.replace('.cs', '') || "Snippet";
        setActiveSnippetName(filename);
        showNotification(forceSaveAs ? "Saved As" : "Saved", "success");
      }
    } catch (err: any) { showNotification(err.message, "error"); }
  };

  const handleLoadSnippet = async () => {
    try {
      const selected = await open({ multiple: false, filters: [{ name: 'C# Script', extensions: ['cs'] }] });
      if (selected && typeof selected === 'string') {
        const content = await readTextFile(selected);
        setMultiLineValue(content);
        setActiveSnippetPath(selected);
        const filename = selected.split(/[\\/]/).pop()?.replace('.cs', '') || "Snippet";
        setActiveSnippetName(filename);
        showNotification("Loaded", "success");
      }
    } catch (err: any) { showNotification(err.message, "error"); }
  };

  const handleReplSubmit = async () => {
    const command = isMultiLine ? multiLineValue.trim() : singleLineValue.trim();
    if (!command || isReplLoading) return;
    if (command.toLowerCase() === 'help' || command === '?') {
      setLocalHistory(prev => [...prev, { type: 'input' as const, text: 'Help', timestamp: new Date(), isRepl: true }, { type: 'output' as const, text: "📖 Help...", timestamp: new Date(), isRepl: true }].slice(-100));
      if (!isMultiLine) setReplValue(""); return;
    }
    if (command.toLowerCase() === 'clear' || command.toLowerCase() === 'cls') { handleClear(); return; }
    if (!isMultiLine) setReplValue("");
    setHistoryIndex(-1);
    setIsReplLoading(true);
    let identifier = activeSnippetName || "Multi-Line Execution";
    if (!isMultiLine) identifier = command;
    setLocalHistory(prev => [...prev, { type: 'status' as const, text: `> ${identifier}`, timestamp: new Date(), isRepl: true }].slice(-100));
    setCommandHistory(prev => [command, ...prev.filter(c => c !== command)].slice(0, 50));
    try {
      const response = await api.post("/api/repl", { code: command, session_id: selectedScript?.absolutePath || "global" });
      if (response.data.is_success) {
        setExecutionResult((prev: any) => ({ output: response.data.output || '', isSuccess: true, error: null, structuredOutput: response.data.structured_output?.length > 0 ? response.data.structured_output : (prev?.structuredOutput || []), internal_data: 'REPL', timestamp: Date.now(), scriptName: isMultiLine ? identifier : "REPL" }));
      } else {
        setExecutionResult((prev: any) => ({ output: response.data.output || '', isSuccess: false, error: response.data.error_message || 'Error', structuredOutput: prev?.structuredOutput || [], internal_data: 'REPL', timestamp: Date.now(), scriptName: isMultiLine ? identifier : "REPL" }));
      }
    } catch (err: any) {
      setLocalHistory(prev => [...prev, { type: 'error' as const, text: `Error: ${err.message}`, timestamp: new Date(), isRepl: true }].slice(-100));
    } finally {
      setIsReplLoading(false);
      setTimeout(() => { if (isMultiLine) textareaRef.current?.focus(); else inputRef.current?.focus(); }, 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isMultiLine) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleReplSubmit(); }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReplSubmit(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (historyIndex < commandHistory.length - 1) { const idx = historyIndex + 1; setHistoryIndex(idx); setReplValue(commandHistory[idx]); } }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (historyIndex > 0) { const idx = historyIndex - 1; setHistoryIndex(idx); setReplValue(commandHistory[idx]); } else if (historyIndex === 0) { setHistoryIndex(-1); setReplValue(""); } }
  };

  return (
    <div className="tab-content pt-0 flex flex-col h-full relative overflow-hidden px-4">
      <div className="flex-grow relative min-h-0 min-w-0 mb-4">
        <div className="absolute inset-0 overflow-auto rounded bg-slate-50/50 dark:bg-slate-900/40 p-3 font-mono text-sm select-text cursor-text"
          onClick={(e) => { if (!window.getSelection()?.toString()) { if (isMultiLine) textareaRef.current?.focus(); else inputRef.current?.focus(); } }}>
          {localHistory.map((item, i) => (
            <div key={i} className={`mb-1 break-words whitespace-pre-wrap ${item.type === 'input' ? 'text-blue-600 dark:text-blue-400 font-bold' : item.type === 'error' ? 'text-red-600 dark:text-red-400 font-bold' : item.type === 'status' ? 'text-blue-500/70 italic text-xs mt-2' : 'text-gray-800 dark:text-gray-200'}`}>
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
            <div className="mb-1 break-words whitespace-pre-wrap text-gray-800 dark:text-gray-200">
              {pendingResult.output && <div>{pendingResult.output}</div>}
              {pendingResult.error && <div className="text-red-600 dark:text-red-400 font-bold">{pendingResult.error}</div>}
            </div>
          )}
          {isRunning && <div className="mt-2 font-mono text-blue-500 animate-pulse flex items-center font-bold px-3"><FontAwesomeIcon icon={faSpinner} spin className="mr-2" />Executing...</div>}
          {isReplLoading && <div className="text-blue-400 flex items-center mt-2 px-3"><span className="mr-2 opacity-50 text-gray-400">{'>'}</span><FontAwesomeIcon icon={faSpinner} spin className="mr-2 h-3 w-3" /><span className="animate-pulse">Processing...</span></div>}
          <div ref={consoleEndRef} />
        </div>
        {isExplaining && <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-40 rounded-lg"><FontAwesomeIcon icon={faSpinner} spin className="text-blue-500 text-4xl mb-4" /><p className="text-lg font-semibold text-gray-700 dark:text-gray-300 animate-pulse">AI is analyzing...</p></div>}
      </div>

      <div className="pb-3 flex flex-col space-y-3">
        <div className="flex justify-between items-center px-1 h-8">
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
                <button onClick={handleLoadSnippet} className="text-slate-400 hover:text-blue-500 transition-colors flex items-center text-[11px] font-bold"><FontAwesomeIcon icon={faFolderOpen} className="mr-1.5 text-[10px]" />Load</button>
                <button onClick={() => handleSaveSnippet(false)} className="text-slate-400 hover:text-blue-500 transition-colors flex items-center text-[11px] font-bold"><FontAwesomeIcon icon={faSave} className="mr-1.5 text-[10px]" />Save</button>
                <button onClick={() => handleSaveSnippet(true)} className="text-slate-400 hover:text-blue-500 transition-colors flex items-center text-[11px] font-bold"><FontAwesomeIcon icon={faSave} className="mr-1.5 text-[10px] opacity-50" />As...</button>
              </>
            )}
            <button onClick={() => setIsMultiLine(!isMultiLine)} className="text-slate-400 hover:text-blue-500 transition-colors flex items-center text-[11px] font-bold"><FontAwesomeIcon icon={isMultiLine ? faCompress : faExpand} className="mr-1.5 text-[10px]" />{isMultiLine ? "Collapse" : "Expand"}</button>
          </div>
        </div>

        <div className="relative w-full">
          {isMultiLine ? (
            <REPLCodeEditor ref={textareaRef} value={replValue} onChange={setReplValue} onKeyDown={(e) => { if (e.key === 's' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSaveSnippet(false); } else handleKeyDown(e); }} disabled={isReplLoading || isRunning} placeholder="Code... (Ctrl+Enter)" />
          ) : (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500 font-bold opacity-50 pointer-events-none select-none text-sm">{'>'}</span>
              <input ref={inputRef} type="text" value={replValue} onChange={(e) => setReplValue(e.target.value)} onKeyDown={handleKeyDown} placeholder="Command..." disabled={isReplLoading || isRunning} className="w-full pl-7 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-900 dark:text-white transition-all font-mono" style={{ borderColor: 'var(--border-divider)' }} />
            </div>
          )}
        </div>
      </div>

      <div className="pt-3 pb-4 flex justify-between items-center bg-white/80 dark:bg-slate-800/60 backdrop-blur-sm z-30">
        <div className="flex-shrink-0">
          {showAiButton && <button className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400 py-1 px-3 rounded-md font-bold flex items-center border border-red-200 dark:border-red-800 transition-all active:scale-95 text-sm shadow-sm" onClick={handleExplainError}><FontAwesomeIcon icon={faMagicWandSparkles} className="mr-2" />Explain & Fix</button>}
        </div>
        <div className="flex items-center space-x-2">
          <button className="bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 py-1 px-3 rounded-md font-bold flex items-center border border-blue-200 dark:border-blue-800 transition-all active:scale-95 text-sm shadow-sm" onClick={handleClear}><FontAwesomeIcon icon={faTrash} className="mr-2" />Clear</button>
          <button className="bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 py-1 px-3 rounded-md font-bold flex items-center border border-blue-200 dark:border-blue-800 transition-all active:scale-95 text-sm shadow-sm" onClick={handleCopy}><FontAwesomeIcon icon={faCopy} className="mr-2" />Copy</button>
          {isMultiLine && <button disabled={isReplLoading || isRunning || !replValue.trim()} className="bg-blue-600 hover:bg-blue-700 text-white py-1 px-4 rounded-md font-bold flex items-center shadow-lg transition-all active:scale-95 text-sm disabled:opacity-50" onClick={handleReplSubmit}><FontAwesomeIcon icon={faPlay} className="mr-2 h-3" />RUN</button>}
        </div>
      </div>
    </div>
  );
};
