import React, { useRef, useEffect, useState, useCallback } from 'react';
import type { ScriptExecutionResult } from "@/types/scriptModel";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faTrash, faMagicWandSparkles, faSpinner, faCheck, faTimes, faCode } from '@fortawesome/free-solid-svg-icons';
import { useScriptExecution } from '@/hooks/useScriptExecution';
import { useScripts } from '@/hooks/useScripts';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

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
  const { selectedScript, runScript } = useScriptExecution();
  const { combinedScriptContent, reloadScript } = useScripts();
  const { revitStatus } = useRevitStatus();
  const { showNotification } = useNotifications();

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

  // History of AI fixes in current session
  const [fixHistory, setFixHistory] = useState<{ script_code: string, explanation: string, error_message: string }[]>([]);

  // Clear session history and AI results when selected script fundamentally changes
  useEffect(() => {
    setAiResult(null);
    setFixHistory([]);
  }, [selectedScript?.absolutePath]);

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [executionResult]);

  // Clear AI result when execution result is cleared or new one starts
  useEffect(() => {
    setAiResult(null);
  }, [executionResult, isRunning]);

  const handleCopy = () => {
    let contentToCopy = "";
    if (executionResult?.output) {
      contentToCopy += String(executionResult.output).split('\n').map(line => line.trim()).join('\n');
    }
    if (executionResult?.error) {
      if (contentToCopy) {
        contentToCopy += "\n";
      }
      contentToCopy += String(executionResult.error).trim();
    }

    if (!contentToCopy && isRunning) {
      contentToCopy = "Executing script...";
    }

    if (!contentToCopy && !isRunning && !executionResult) {
      contentToCopy = `Ready to execute script: ${scriptName}`;
    }

    if (contentToCopy) {
      navigator.clipboard.writeText(contentToCopy)
        .then(() => showNotification("Console content copied to clipboard", "info"))
        .catch(err => console.error("Failed to copy console content: ", err));
    }
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

      // For single file, we might have content loaded in combinedScriptContent, 
      // but for multi-file we prefer backend loading via path.
      // We send both path/type AND script_code (as fallback/context)
      const response = await api.post("/generation/explain_error", {
        script_code: combinedScriptContent || "",
        script_path: selectedScript.absolutePath,
        type: selectedScript.type,
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

      // V3 Enhancement: Always set aiResult so we can show a structured error page if it fails
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
      // Determine payload based on single vs multi-file result
      const payload: { script_path: string; type: string; files?: Record<string, string>; content?: string; filename?: string } = {
        script_path: selectedScript.absolutePath,
        type: selectedScript.type,
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

        // Record this attempt in our history so next 'Explain' knows what we just tried
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
        // Auto-run after fix? Maybe let user decide. For now, just reload.
      } else {
        showNotification(response.data.message || "Failed to apply fix.", "error");
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : "Error saving fixed script.";
      showNotification(errorMsg, "error");
    } finally {
      setIsApplyingFix(false);
    }
  }, [selectedScript, aiResult, showNotification, reloadScript]);

  const showAiButton = executionResult && !executionResult.isSuccess && !isRunning && !isExplaining && !aiResult;

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
              {/* Error State Heading */}
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

              {/* Simple markdown-ish rendering for the explanation */}
              {aiResult.explanation.split('\n').map((line, i) => {
                if (line.startsWith('###')) return <h4 key={i} className="text-blue-600 dark:text-blue-400 mt-4 mb-2">{line.replace('###', '').trim()}</h4>;
                return <p key={i} className="mb-2">{line}</p>;
              })}
            </div>

            {/* Render Fixed Code(s) */}
            {(aiResult.files || aiResult.fixed_code) && (
              <div className="mt-4 w-full min-w-0 space-y-6">
                <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mb-2">
                  <FontAwesomeIcon icon={faCode} className="mr-2" />
                  {aiResult.files && Object.keys(aiResult.files).length > 1
                    ? `FIXED CODE PROPOSAL (${Object.keys(aiResult.files).length} FILES)`
                    : "FIXED CODE PROPOSAL"}
                </div>

                {aiResult.files ? (
                  // Multi-file Display
                  Object.entries(aiResult.files).map(([fname, fcode]) => (
                    <div key={fname} className="space-y-2">
                      <div className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border-l-4 border-blue-500 text-xs font-bold text-gray-700 dark:text-gray-200 rounded-r shadow-sm flex justify-between items-center">
                        <span>{fname}</span>
                        <span className="text-[10px] text-gray-400 font-normal uppercase">Modified</span>
                      </div>
                      <div className="rounded-lg border border-gray-200 dark:border-gray-700 text-xs w-full overflow-hidden">
                        <SyntaxHighlighter
                          language="csharp"
                          style={vscDarkPlus}
                          customStyle={{ margin: 0, padding: '1rem', width: '100%', maxWidth: '100%', overflowX: 'auto' }}
                          codeTagProps={{ style: { whiteSpace: 'pre', wordBreak: 'normal' } }}
                        >
                          {fcode}
                        </SyntaxHighlighter>
                      </div>
                    </div>
                  ))
                ) : (
                  // Single-file Fallback
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 text-xs w-full overflow-hidden">
                    <SyntaxHighlighter
                      language="csharp"
                      style={vscDarkPlus}
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

  return (
    <div className="tab-content py-4 flex flex-col h-full relative overflow-hidden">
      <div className="flex-grow relative min-h-0 min-w-0">
        <div className="absolute inset-0 overflow-auto rounded bg-gray-50/50 dark:bg-gray-900/30 p-2">
          <pre className="font-mono text-sm whitespace-pre text-left indent-0 text-gray-800 dark:text-gray-200">
            {isRunning && <code className="p-0 m-0">Executing script...</code>}
            {executionResult?.output ? (
              <code className={`${executionResult.isSuccess ? "" : "text-red-600 dark:text-red-400"} p-0 m-0`}>
                {String(executionResult.output)}
              </code>
            ) : !isRunning ? (
              <code className="p-0 m-0">
                Ready to execute script: {scriptName}
              </code>
            ) : null}
            {executionResult?.error && (
              <code className="text-red-600 dark:text-red-400 block mt-4 font-bold border-t border-red-100 dark:border-red-900/30 pt-2">
                {executionResult.error}
              </code>
            )}
            <div ref={consoleEndRef} />
          </pre>
        </div>

        {/* AI Explanation Overlay - Inside relative flex-grow but outside absolute inset-0 */}
        {isExplaining && (
          <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-40 rounded-lg">
            <FontAwesomeIcon icon={faSpinner} spin className="text-blue-500 text-4xl mb-4" />
            <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 animate-pulse">
              AI is analyzing the error...
            </p>
          </div>
        )}
      </div>

      {/* Footer Buttons for Console Tab */}
      <div className="pt-4 mt-auto border-t border-gray-200 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-800 z-30">
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
            onClick={clearExecutionResult}
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
        </div>
      </div>
    </div>
  );
};
