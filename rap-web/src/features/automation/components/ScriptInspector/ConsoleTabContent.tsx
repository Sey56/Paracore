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
  const [isReplLoading, setIsReplLoading] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isMultiLine, setIsMultiLine] = useState(() => localStorage.getItem('paracore_repl_multiline') === 'true');

  // Unified value based on current mode
  const replValue = isMultiLine ? multiLineValue : singleLineValue;
  const setReplValue = isMultiLine ? setMultiLineValue : setSingleLineValue;

  // Initialize from LocalStorage
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

  // History of AI fixes in current session
  const [fixHistory, setFixHistory] = useState<{ script_code: string, explanation: string, error_message: string }[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const lastResultRef = useRef<ScriptExecutionResult | null>(null);
  const lastHeaderScriptNameRef = useRef<string | null>(null);
  const needsHeaderForCurrentRunRef = useRef(false);
  const lastIsRunningRef = useRef(false);

  // Append executionResult to localHistory when it changes
  useEffect(() => {
    // Only append if it's a NEW result object
    if (executionResult && executionResult !== lastResultRef.current) {
      lastResultRef.current = executionResult;

      if (executionResult.output) {
        setLocalHistory(prev => [...prev, { 
          type: 'output' as const, 
          text: String(executionResult.output), 
          timestamp: new Date(), 
          isRepl: executionResult.internal_data === 'REPL' // Marker for REPL results
        }].slice(-100));
      } else if (executionResult.internal_data === 'REPL') {
        // For REPL, if output is empty (no return value), we don't add an output entry
        // This keeps the console clean and professional.
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

  // Track isRunning to show a start message in history
  useEffect(() => {
    const transitionedToRunning = isRunning && !lastIsRunningRef.current;
    lastIsRunningRef.current = isRunning;

    if (transitionedToRunning) {
      needsHeaderForCurrentRunRef.current = true;
    }

    const currentName = selectedScript?.name || scriptName;

    if (isRunning && needsHeaderForCurrentRunRef.current && currentName && currentName !== "Global Console") {
      setLocalHistory(prev => [
        ...prev, 
        { type: 'status' as const, text: `> ${currentName}`, timestamp: new Date(), isRepl: false }
      ].slice(-100));
      needsHeaderForCurrentRunRef.current = false;
    }
  }, [isRunning, scriptName, selectedScript]); // Stable dependencies

  // V7: Bridging the "Flicker Gap" - Render the active result if it hasn't been committed to history yet
  const pendingResult = !isRunning && executionResult && executionResult !== lastResultRef.current ? executionResult : null;

  // Clear AI results and temporary state when selected script fundamentally changes
  useEffect(() => {
    setAiResult(null);
    setFixHistory([]);
    lastResultRef.current = null;
  }, [selectedScript?.absolutePath]);

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [localHistory.length, isRunning, isReplLoading, !!pendingResult]); // Stable size and types

  // Sync Histories to LocalStorage
  useEffect(() => {
    localStorage.setItem('paracore_console_history', JSON.stringify(localHistory));
  }, [localHistory]);

  useEffect(() => {
    localStorage.setItem('paracore_command_history', JSON.stringify(commandHistory));
  }, [commandHistory]);

  // Sync REPL State to LocalStorage
  useEffect(() => {
    localStorage.setItem('paracore_repl_single_value', singleLineValue);
  }, [singleLineValue]);

  useEffect(() => {
    localStorage.setItem('paracore_repl_multi_value', multiLineValue);
  }, [multiLineValue]);

  useEffect(() => {
    localStorage.setItem('paracore_repl_multiline', String(isMultiLine));
  }, [isMultiLine]);

  // Clear AI result when execution result is cleared or new one starts
  useEffect(() => {
    setAiResult(null);
  }, [executionResult, isRunning]);

  const handleCopy = () => {
    let contentToCopy = localHistory
      .map(item => (item.type === 'input' ? `> ${item.text}` : item.text))
      .join('\n');

    // Also include any "active" results that haven't been committed to history yet
    const activeResult = pendingResult || executionResult;
    if (activeResult) {
      const activeLines: string[] = [];
      if (activeResult.output) activeLines.push(String(activeResult.output));
      if (activeResult.error) activeLines.push(String(activeResult.error));

      const activeText = activeLines.join('\n');
      const lastHistoryItem = localHistory.length > 0 ? localHistory[localHistory.length - 1] : null;

      // Avoid duplication if the effect already committed this result
      if (activeText && lastHistoryItem?.text !== activeText) {
        if (contentToCopy) contentToCopy += "\n\n";
        contentToCopy += activeText;
      }
    }

    if (!contentToCopy) {
      contentToCopy = isRunning ? "Executing..." : "Ready";
    }

    navigator.clipboard.writeText(contentToCopy)
      .then(() => showNotification("Console content copied to clipboard", "info"))
      .catch(err => console.error("Failed to copy console content: ", err));
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
        showNotification("Please configure your LLM settings (Provider, Model, and API Key) in Settings to use AI Fix.", "warning");
        setIsExplaining(false);
        return;
      }

      // We send both path AND script_code (as fallback/context)
      const response = await api.post("/generation/explain_error", {
        script_code: combinedScriptContent || "",
        script_path: selectedScript.absolutePath,
        error_message: executionResult.error,
        context: {
          document: revitStatus.document || "Unknown",
          document_type: revitStatus.documentType || "Unknown",
          script_name: scriptName
        },
        llm_provider: llmProvider,
        llm_model: llmModel,
        llm_api_key_value: llmApiKeyValue,
        history: fixHistory
      });

      // Update AI Result
      setAiResult(response.data);
      if (!response.data.is_success) {
        showNotification(response.data.error_message || "AI failed to analyze the error.", "warning");
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Failed to call AI service.";
      showNotification(errorMsg, "error");
    } finally {
      setIsExplaining(false);
    }
  }, [selectedScript, executionResult, combinedScriptContent, revitStatus, scriptName, showNotification, fixHistory]);

  const handleApplyFix = useCallback(async () => {
    if (!selectedScript || (!aiResult?.fixed_code && !aiResult?.files)) return;

    setIsApplyingFix(true);
    try {
      // Determine payload for saving
      const payload: { script_path: string; files?: Record<string, string>; content?: string; filename?: string } = {
        script_path: selectedScript.absolutePath,
      };

      if (aiResult.files) {
        payload.files = aiResult.files;
      } else {
        payload.content = aiResult.fixed_code;
        payload.filename = aiResult.filename;
      }

      const response = await api.post("/api/save-script", payload);

      if (response.data.success) {
        showNotification("✨ Fix applied successfully!", "success");

        // Record attempt in our history
        if (aiResult) {
          setFixHistory(prev => [...prev, {
            script_code: aiResult.fixed_code || combinedScriptContent || "",
            explanation: aiResult.explanation,
            error_message: executionResult?.error || "Unknown compilation error"
          }]);
        }

        setAiResult(null);
        // Reload script to update UI and combined content
        await reloadScript(selectedScript);
      } else {
        showNotification(response.data.message || "Failed to apply fix.", "error");
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Error saving fixed script.";
      showNotification(errorMsg, "error");
    } finally {
      setIsApplyingFix(false);
    }
  }, [selectedScript, aiResult, showNotification, reloadScript, combinedScriptContent, executionResult]);

  const handleReplSubmit = async () => {
    if (!replValue.trim() || isReplLoading) return;

    const command = replValue.trim();

    // 0. Handle Help System locally
    if (command.toLowerCase() === 'help' || command === '?') {
      setLocalHistory(prev => [...prev,
      { type: 'input' as const, text: 'Help', timestamp: new Date(), isRepl: true },
      {
        type: 'output' as const, text: `📖 Paracore REPL Quick Reference:
--------------------------------------------------
✨ Discovery: GetElements("Doors"), GetMagicNames(), GetCategories()
🧠 Essentials: Doc, UIDoc, UIApp, ActiveView, Selection, Println(obj)
📊 Analytics: Table(data), PieChart(data), BarChart(data), Select(els)
🛠️ Modify: Transact("Label", () => { ... })
🔍 Identity: GetElement("Name")
📏 Units: 10.ToUnits("m2"), r.Area.FromUnits("m2")
🧹 Utility: help, clear (or cls)
💡 Tip: Last line of code is printed automatically!
----------------------------------
Try: GetMagicNames().Where(n => n.Contains("Wall"))`, timestamp: new Date(), isRepl: true
      }
      ].slice(-100));
      if (!isMultiLine) setReplValue("");
      return;
    }

    if (command.toLowerCase() === 'clear' || command.toLowerCase() === 'cls') {
      setLocalHistory([]);
      localStorage.removeItem('paracore_console_history');
      if (!isMultiLine) setReplValue("");
      return;
    }

    if (!isMultiLine) {
      setReplValue("");
    }
    setHistoryIndex(-1);
    setIsReplLoading(true);
    lastHeaderScriptNameRef.current = null; // Reset header tracking on REPL submit

    // Identify REPL Turn (Command for single-line, /// Label or Default for multi-line)
    let identifier = "";
    if (!isMultiLine) {
      identifier = command;
    } else {
      const lines = command.split('\n');
      const firstLine = lines[0].trim();
      if (firstLine.startsWith('///')) {
        identifier = firstLine.substring(3).trim() || "Multi-Line Execution";
      } else {
        identifier = "Multi-Line Execution";
      }
    }

    // Add input identifier to local history as status (matches script header style)
    setLocalHistory(prev => [...prev, { type: 'status' as const, text: `> ${identifier}`, timestamp: new Date(), isRepl: true }].slice(-100));

    // Add full code to command history for navigation (Capped at 50)
    setCommandHistory(prev => [command, ...prev.filter(c => c !== command)].slice(0, 50));

    try {
      const response = await api.post("/api/repl", {
        code: command,
        session_id: selectedScript?.absolutePath || "global"
      });

      if (response.data.is_success) {
        setExecutionResult((prev: any) => {
          const hasNewData = response.data.structured_output && response.data.structured_output.length > 0;
          return { 
            output: response.data.output || '',
            isSuccess: true,
            error: null,
            structuredOutput: hasNewData ? response.data.structured_output : (prev?.structuredOutput || []),
            internal_data: 'REPL',
            timestamp: Date.now(),
            scriptName: isMultiLine ? identifier : "REPL"
          } as any;
        });
      } else {
        setExecutionResult((prev: any) => ({ 
          output: response.data.output || '',
          isSuccess: false,
          error: response.data.error_message || 'Unknown error',
          structuredOutput: prev?.structuredOutput || [],
          internal_data: 'REPL',
          timestamp: Date.now(),
          scriptName: isMultiLine ? identifier : "REPL"
        } as any));
      }
    } catch (err: any) {
      setLocalHistory(prev => [...prev, { type: 'error' as const, text: `Error: ${err.message}`, timestamp: new Date(), isRepl: true }].slice(-100));
    } finally {
      setIsReplLoading(false);
      // Re-focus appropriate input after execution
      setTimeout(() => {
        if (isMultiLine && textareaRef.current) textareaRef.current.focus();
        else if (!isMultiLine && inputRef.current) inputRef.current.focus();
      }, 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // If multi-line, only handle Cmd/Ctrl + Enter as submission
    if (isMultiLine) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleReplSubmit();
      }
      return; // Let Enter do its thing in textarea
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleReplSubmit();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        setReplValue(commandHistory[newIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setReplValue(commandHistory[newIndex]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setReplValue("");
      }
    }
  };

  const handleClear = () => {
    setLocalHistory([]);
    setCommandHistory([]);
    setAiResult(null);
    lastHeaderScriptNameRef.current = null;
    localStorage.removeItem('paracore_console_history');
    localStorage.removeItem('paracore_command_history');
  };

  const lastHistoryItem = localHistory.length > 0 ? localHistory[localHistory.length - 1] : null;

  const showAiButton = !isRunning &&
    !isExplaining &&
    !aiResult &&
    lastHistoryItem?.type === 'error' &&
    !lastHistoryItem?.isRepl;

  if (aiResult) {
    return (
      <div className="absolute inset-0 z-10 p-4 w-full h-full box-border flex flex-col min-w-0">
        <div className="flex flex-col h-full w-full max-w-full min-w-0 p-4 bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-900 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 box-border">
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100 dark:border-gray-800 shrink-0">
            <h3 className="text-blue-600 dark:text-blue-400 font-bold flex items-center truncate">
              <FontAwesomeIcon icon={faMagicWandSparkles} className="mr-2" />
              AI Analysis & Fix
            </h3>
            <button
              onClick={() => setAiResult(null)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-2"
            >
              <FontAwesomeIcon icon={faTimes} />
            </button>
          </div>

          <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar w-full min-w-0">
            <div className="prose dark:prose-invert prose-sm max-w-none mb-6 text-gray-700 dark:text-gray-300 break-words">
              {!aiResult.is_success && (
                <div className="p-4 mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <h4 className="text-red-600 dark:text-red-400 font-bold mb-2 flex items-center">
                    <FontAwesomeIcon icon={faTimes} className="mr-2" />
                    Analysis Interrupted
                  </h4>
                  <p className="text-red-600 dark:text-red-400 text-sm">
                    {aiResult.error_message || "The AI service encountered an unexpected error."}
                  </p>
                </div>
              )}

              {aiResult.explanation.split('\n').map((line, i) => {
                if (line.startsWith('###')) return <h4 key={i} className="text-blue-600 dark:text-blue-400 mt-4 mb-2">{line.replace('###', '').trim()}</h4>;
                return <p key={i} className="mb-2">{line}</p>;
              })}
            </div>

            {(aiResult.files || aiResult.fixed_code) && (
              <div className="mt-4 w-full min-w-0 space-y-6">
                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mb-2">
                  <FontAwesomeIcon icon={faCode} className="mr-2" />
                  {aiResult.files && Object.keys(aiResult.files).length > 1
                    ? `FIXED CODE PROPOSAL (${Object.keys(aiResult.files).length} FILES)`
                    : "FIXED CODE PROPOSAL"}
                </div>

                {aiResult.files ? (
                  Object.entries(aiResult.files).map(([fname, fcode]) => (
                    <div key={fname} className="space-y-2">
                      <div className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border-l-4 border-blue-500 text-xs font-bold text-gray-700 dark:text-gray-200 rounded-r shadow-sm flex justify-between items-center">
                        <span>{fname}</span>
                        <span className="text-xs text-gray-400 font-normal uppercase">Modified</span>
                      </div>
                      <div className="rounded-lg border border-gray-200 dark:border-gray-700 text-xs w-full overflow-hidden">
                        <SyntaxHighlighter
                          language="csharp"
                          style={syntaxStyle}
                          customStyle={{ margin: 0, padding: '1rem', width: '100%', maxWidth: '100%', overflowX: 'auto' }}
                          codeTagProps={{ style: { whiteSpace: 'pre', wordBreak: 'normal' } }}
                        >
                          {fcode}
                        </SyntaxHighlighter>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 text-xs w-full overflow-hidden">
                    <SyntaxHighlighter
                      language="csharp"
                      style={syntaxStyle}
                      customStyle={{ margin: 0, padding: '1rem', width: '100%', maxWidth: '100%', overflowX: 'auto' }}
                      codeTagProps={{ style: { whiteSpace: 'pre', wordBreak: 'normal' } }}
                    >
                      {aiResult.fixed_code || ""}
                    </SyntaxHighlighter>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pt-4 mt-2 border-t border-gray-100 dark:border-gray-800 flex justify-end space-x-3 shrink-0">
            <button
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              onClick={() => setAiResult(null)}
            >
              Cancel
            </button>
            {(aiResult.fixed_code || aiResult.files) && (
              <button
                disabled={isApplyingFix}
                className="bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 py-1 px-3 rounded-md font-bold flex items-center border border-blue-200 dark:border-blue-800 transition-all active:scale-95 text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleApplyFix}
              >
                {isApplyingFix ? (
                  <><FontAwesomeIcon icon={faSpinner} spin className="mr-2" /> Applying...</>
                ) : (
                  <><FontAwesomeIcon icon={faCheck} className="mr-2" /> Apply Fix</>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const handleSaveSnippet = async () => {
    if (!multiLineValue.trim()) return;
    try {
      const filePath = await save({
        filters: [{ name: 'C# Script', extensions: ['cs'] }],
        defaultPath: 'MyReplSnippet.cs'
      });
      if (filePath) {
        await writeTextFile(filePath, multiLineValue);
        showNotification("Snippet saved successfully", "success");
      }
    } catch (err: any) {
      showNotification(`Failed to save snippet: ${err.message}`, "error");
    }
  };

  const handleLoadSnippet = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'C# Script', extensions: ['cs'] }]
      });
      if (selected && typeof selected === 'string') {
        const content = await readTextFile(selected);
        setMultiLineValue(content);
        showNotification("Snippet loaded", "success");
      }
    } catch (err: any) {
      showNotification(`Failed to load snippet: ${err.message}`, "error");
    }
  };

  return (
    <div className="tab-content pt-0 flex flex-col h-full relative overflow-hidden">
      <div className="flex-grow relative min-h-0 min-w-0 mb-2">
        <div
          className="absolute inset-0 overflow-auto rounded bg-slate-50/50 dark:bg-slate-900/40 p-3 font-mono text-sm select-text cursor-text"
          onClick={(e) => {
            const selection = window.getSelection();
            if (selection && selection.toString().length > 0) return;
            // Only focus if clicking the container directly or if no selection is being made
            if (isMultiLine) textareaRef.current?.focus();
            else inputRef.current?.focus();
          }}
        >
          {localHistory.map((item, i) => (
            <div key={i} className={`mb-1 break-words whitespace-pre-wrap ${item.type === 'input' ? 'text-blue-600 dark:text-blue-400 font-bold' :
              item.type === 'error' ? 'text-red-600 dark:text-red-400 font-bold' :
                item.type === 'status' ? 'text-blue-500/70 italic text-xs mt-2' :
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
                      customStyle={{
                        margin: 0,
                        padding: 0,
                        background: 'transparent',
                        fontSize: 'inherit',
                        lineHeight: 'inherit',
                        width: '100%',
                        overflow: 'visible',
                        border: 'none',
                        boxShadow: 'none'
                      }}
                      codeTagProps={{ style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all' } }}
                    >
                      {item.text}
                    </SyntaxHighlighter>
                  </div>
                </div>
              ) : (
                <>{item.text}</>
              )}
            </div>
          ))}

          {/* V7: Active Result (Not yet committed to history) */}
          {pendingResult && (
            <div className="mb-1 break-words whitespace-pre-wrap text-gray-800 dark:text-gray-200">
              {pendingResult.output && <div>{pendingResult.output}</div>}
              {pendingResult.error && <div className="text-red-600 dark:text-red-400 font-bold">{pendingResult.error}</div>}
            </div>
          )}

          {/* Loading Indicator for Script Execution */}
          {isRunning && (
            <div className={`mt-2 font-mono text-blue-500 animate-pulse flex items-center font-bold`}>
              <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
              Executing...
            </div>
          )}

          {isReplLoading && (
            <div className="text-blue-400 flex items-center mt-2">
              <span className="mr-2 opacity-50 text-gray-400">{'>'}</span>
              <FontAwesomeIcon icon={faSpinner} spin className="mr-2 h-3 w-3" />
              <span className="animate-pulse">Processing...</span>
            </div>
          )}

          <div ref={consoleEndRef} />
        </div>

        {/* AI Explanation Overlay */}
        {isExplaining && (
          <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-40 rounded-lg">
            <FontAwesomeIcon icon={faSpinner} spin className="text-blue-500 text-4xl mb-4" />
            <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 animate-pulse">
              AI is analyzing the error...
            </p>
          </div>
        )}
      </div>

      {/* REPL Input Bar */}
      <div className="px-0 pb-3">
        <div className="flex flex-col space-y-2">
          {/* Header/Toggle Row */}
          <div className="flex justify-between items-center px-3">
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">
              {isMultiLine ? "Multi-Line REPL" : "Single-Line REPL"}
            </span>
            <div className="flex items-center gap-3">
              {isMultiLine && (
                <div className="flex items-center gap-2 pr-2 border-r border-slate-200 dark:border-slate-800">
                  <button
                    onClick={handleLoadSnippet}
                    className="text-slate-400 hover:text-blue-500 transition-colors flex items-center text-xs"
                    title="Load Snippet (.cs)"
                  >
                    <FontAwesomeIcon icon={faFolderOpen} className="mr-1" />
                    Load
                  </button>
                  <button
                    onClick={handleSaveSnippet}
                    className="text-slate-400 hover:text-blue-500 transition-colors flex items-center text-xs"
                    title="Save Snippet (.cs)"
                  >
                    <FontAwesomeIcon icon={faSave} className="mr-1" />
                    Save
                  </button>
                </div>
              )}
              <button
                onClick={() => setIsMultiLine(!isMultiLine)}
                className="text-slate-400 hover:text-blue-500 transition-colors flex items-center text-xs"
                title={isMultiLine ? "Switch to Single-Line" : "Switch to Multi-Line"}
              >
                <FontAwesomeIcon icon={isMultiLine ? faCompress : faExpand} className="mr-1" />
                {isMultiLine ? "Collapse" : "Expand"}
              </button>
            </div>
          </div>

          <div className="relative w-full">
            {isMultiLine ? (
              <REPLCodeEditor
                ref={textareaRef}
                value={replValue}
                onChange={setReplValue}
                onKeyDown={handleKeyDown}
                disabled={isReplLoading || isRunning}
                placeholder="Write your C# code here... (Ctrl+Enter to run)"
              />
            ) : (
              <div className="relative px-3">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-blue-500 font-bold opacity-50 pointer-events-none select-none text-sm leading-none">
                  {'>'}
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  value={replValue}
                  onChange={(e) => setReplValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Command (e.g. GetElements<Wall>().Count)"
                  disabled={isReplLoading || isRunning}
                  spellCheck="false"
                  autoCorrect="off"
                  autoCapitalize="off"
                  className="w-full pl-7 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-900 dark:text-white dark:placeholder-slate-600 transition-all font-mono"
                  style={{ borderColor: 'var(--border-divider)' }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer Buttons for Console Tab */}
      <div className="px-3 pt-3 pb-3 flex justify-between items-center bg-white/80 dark:bg-slate-800/60 backdrop-blur-sm z-30">
        <div className="flex-shrink-0">
          {showAiButton && (
            <button
              title="Explain and Fix with AI"
              className="bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-900/30 dark:hover:bg-red-900/50 dark:text-red-400 py-1 px-3 rounded-md font-bold flex items-center border border-red-200 dark:border-red-800 transition-all active:scale-95 text-sm animate-in fade-in slide-in-from-bottom-2"
              onClick={handleExplainError}
            >
              <FontAwesomeIcon icon={faMagicWandSparkles} className="mr-2" />
              Explain & Fix
            </button>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button
            title="Clear Console"
            className="bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 py-1 px-3 rounded-md font-bold flex items-center border border-blue-200 dark:border-blue-800 transition-all active:scale-95 text-sm"
            onClick={handleClear}
          >
            <FontAwesomeIcon icon={faTrash} className="mr-2" />
            Clear
          </button>

          <button
            title="Copy to Clipboard"
            className="bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 py-1 px-3 rounded-md font-bold flex items-center border border-blue-200 dark:border-blue-800 transition-all active:scale-95 text-sm"
            onClick={handleCopy}
          >
            <FontAwesomeIcon icon={faCopy} className="mr-2" />
            Copy
          </button>

          {isMultiLine && (
            <button
              title="Run REPL (Ctrl+Enter)"
              disabled={isReplLoading || isRunning || !replValue.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white py-1 px-4 rounded-md font-bold flex items-center shadow-lg transition-all active:scale-95 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleReplSubmit}
            >
              <FontAwesomeIcon icon={faPlay} className="mr-2 h-3" />
              RUN
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
