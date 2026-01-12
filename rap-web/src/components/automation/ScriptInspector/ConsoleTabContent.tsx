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
  const [aiResult, setAiResult] = useState<{ explanation: string, fixed_code?: string, filename?: string } | null>(null);
  const [isApplyingFix, setIsApplyingFix] = useState(false);

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
    if (!selectedScript || !executionResult?.error || !combinedScriptContent) return;

    setIsExplaining(true);
    setAiResult(null);

    try {
      const llmProvider = localStorage.getItem('llmProvider') || 'gemini';
      const llmModel = localStorage.getItem('llmModel') || 'gemini-2.0-flash-exp';
      const llmApiKeyValue = localStorage.getItem('llmApiKeyValue');

      if (!llmApiKeyValue) {
        showNotification("Please set your Gemini API Key in Settings to use AI Fix.", "warning");
        setIsExplaining(false);
        return;
      }

      const response = await api.post("/generation/explain_error", {
        script_code: combinedScriptContent,
        error_message: executionResult.error,
        context: {
          document: revitStatus.document || "Unknown",
          document_type: revitStatus.documentType || "Unknown",
          script_name: scriptName
        },
        llm_provider: llmProvider,
        llm_model: llmModel,
        llm_api_key_value: llmApiKeyValue
      });

      if (response.data.is_success) {
        setAiResult(response.data);
      } else {
        showNotification(response.data.error_message || "AI failed to explain the error.", "error");
      }
    } catch (err: any) {
      showNotification(err.message || "Failed to call AI service.", "error");
    } finally {
      setIsExplaining(false);
    }
  }, [selectedScript, executionResult, combinedScriptContent, revitStatus, scriptName, showNotification]);

  const handleApplyFix = useCallback(async () => {
    if (!selectedScript || !aiResult?.fixed_code) return;

    setIsApplyingFix(true);
    try {
      const response = await api.post("/api/save-script", {
        script_path: selectedScript.absolutePath,
        type: selectedScript.type,
        content: aiResult.fixed_code,
        filename: aiResult.filename
      });

      if (response.data.success) {
        showNotification("✨ Fix applied successfully!", "success");
        setAiResult(null);
        // Reload script to update UI and combined content
        await reloadScript(selectedScript);
        // Auto-run after fix? Maybe let user decide. For now, just reload.
      } else {
        showNotification(response.data.message || "Failed to apply fix.", "error");
      }
    } catch (err: any) {
      showNotification(err.message || "Error saving fixed script.", "error");
    } finally {
      setIsApplyingFix(false);
    }
  }, [selectedScript, aiResult, showNotification, reloadScript]);

  const showAiButton = executionResult && !executionResult.isSuccess && !isRunning && !isExplaining && !aiResult;

  return (
    <div className="tab-content py-4 flex flex-col h-full relative overflow-hidden">
      <div className="flex-grow flex flex-col min-h-0 relative">
        <pre className="font-mono text-sm flex-grow overflow-y-auto whitespace-pre-wrap text-left indent-0 text-gray-800 dark:text-gray-200 p-2 rounded bg-gray-50/50 dark:bg-gray-900/30">
          {isRunning && <code className="p-0 m-0">Executing script...</code>}
          {executionResult?.output ? (
            <code className={`${executionResult.isSuccess ? '' : 'text-red-600 dark:text-red-400'} p-0 m-0`}>
              {String(executionResult.output).split('\n').map(line => line.trim()).join('\n')}
            </code>
          ) : !isRunning ? (
            <code className="p-0 m-0">
              Ready to execute script: {scriptName}
            </code>
          ) : null}
          {executionResult?.error && (
            <code className="text-red-600 dark:text-red-400 block mt-2 font-bold">
              ERROR: {executionResult.error}
            </code>
          )}
          <div ref={consoleEndRef} />
        </pre>

        {/* AI Explanation Overlay */}
        {isExplaining && (
          <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-lg">
            <FontAwesomeIcon icon={faSpinner} spin className="text-blue-500 text-4xl mb-4" />
            <p className="text-lg font-semibold text-gray-700 dark:text-gray-300 animate-pulse">
              AI is analyzing the error...
            </p>
          </div>
        )}

        {aiResult && (
          <div className="absolute inset-0 bg-white dark:bg-gray-900 z-20 flex flex-col p-4 border border-blue-200 dark:border-blue-900 rounded-lg shadow-xl overflow-hidden">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-blue-600 dark:text-blue-400 font-bold flex items-center">
                <FontAwesomeIcon icon={faMagicWandSparkles} className="mr-2" />
                AI Analysis & Fix
              </h3>
              <button 
                onClick={() => setAiResult(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
            
            <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
              <div className="prose dark:prose-invert prose-sm max-w-none mb-6 text-gray-700 dark:text-gray-300">
                {/* Simple markdown-ish rendering for the explanation */}
                {aiResult.explanation.split('\n').map((line, i) => {
                  if (line.startsWith('###')) return <h4 key={i} className="text-blue-600 dark:text-blue-400 mt-4 mb-2">{line.replace('###', '').trim()}</h4>;
                  return <p key={i} className="mb-2">{line}</p>;
                })}
              </div>

              {aiResult.fixed_code && (
                <div className="mt-4">
                  <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mb-2">
                    <FontAwesomeIcon icon={faCode} className="mr-2" />
                    FIXED CODE PROPOSAL
                  </div>
                  <div className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 text-xs">
                    <SyntaxHighlighter
                      language="csharp"
                      style={vscDarkPlus}
                      customStyle={{ margin: 0, padding: '1rem' }}
                    >
                      {aiResult.fixed_code}
                    </SyntaxHighlighter>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 mt-2 border-t border-gray-100 dark:border-gray-800 flex justify-end space-x-3">
              <button
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                onClick={() => setAiResult(null)}
              >
                Cancel
              </button>
              {aiResult.fixed_code && (
                <button
                  disabled={isApplyingFix}
                  className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-lg font-bold flex items-center shadow-md transition-all active:scale-95"
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
        )}
      </div>

      {/* Footer Buttons for Console Tab */}
      <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-800 z-30">
        <div className="flex space-x-2">
          <button
            title="Clear Console"
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 py-2 px-4 rounded-lg font-medium flex items-center transition-colors"
            onClick={clearExecutionResult}
          >
            <FontAwesomeIcon icon={faTrash} className="mr-2" />
            Clear
          </button>
          
          {showAiButton && (
            <button
              title="Explain and Fix with AI"
              className="bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 py-2 px-4 rounded-lg font-bold flex items-center border border-blue-200 dark:border-blue-800 transition-all animate-in fade-in slide-in-from-bottom-2"
              onClick={handleExplainError}
            >
              <FontAwesomeIcon icon={faMagicWandSparkles} className="mr-2" />
              Explain & Fix
            </button>
          )}
        </div>

        <button
          title="Copy to Clipboard"
          className="bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 py-2 px-4 rounded-lg font-medium flex items-center transition-colors"
          onClick={handleCopy}
        >
          <FontAwesomeIcon icon={faCopy} className="mr-2" />
          Copy
        </button>
      </div>
    </div>
  );
};
