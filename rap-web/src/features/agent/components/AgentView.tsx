import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useUI } from '@/hooks/useUI';
import { useAuth } from '@/features/auth';
import api from '@/api/axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane, faAsterisk, faUser, faCheckCircle, faTimesCircle, faSpinner, faTrash, faSyncAlt, faCopy } from '@fortawesome/free-solid-svg-icons';
import { useNotifications } from '@/hooks/useNotifications';
import { useScriptExecution } from '@/features/automation';
import { useScripts } from '@/features/automation';
import { filterVisibleParameters } from '@/utils/parameterVisibility';

import { Modal } from '@/components/common/Modal';
import { useRapServerUrl } from '@/hooks/useRapServerUrl';
import OrchestrationPlanCard from './OrchestrationPlanCard';
import { Script, ScriptParameter } from '@/types/scriptModel';
import { Message, ToolCall, OrchestrationPlan } from '../types/agentTypes';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs, atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '@/context/ThemeContext';

const LOCAL_STORAGE_KEY_MESSAGES = 'agent_chat_messages';
const LOCAL_STORAGE_KEY_THREAD_ID = 'agent_chat_thread_id';

function buildReplPreview(structuredOutput: Record<string, unknown>[], plainOutput: string): string | null {
  const parts: string[] = [];

  if (Array.isArray(structuredOutput) && structuredOutput.length > 0) {
    for (const item of structuredOutput) {
      if (item.type === 'table') {
        try {
          const data = typeof item.data === 'string' ? JSON.parse(item.data) : item.data;
          if (Array.isArray(data) && data.length > 0) {
            const totalRows = data.length;
            const headers = Object.keys(data[0] as Record<string, unknown>);
            const rows = data.slice(0, 5).map((r: Record<string, unknown>) => headers.map(h => String((r as Record<string, unknown>)[h] ?? '')));
            const tableLines = [
              '| ' + headers.join(' | ') + ' |',
              '|' + headers.map(() => '---').join('|') + '|',
              ...rows.map(r => '| ' + r.join(' | ') + ' |'),
            ];
            parts.push(`**${item.title || 'Table'}** (${totalRows} rows, showing first ${rows.length}):\n${tableLines.join('\n')}`);
            if (totalRows > 5) {
              parts.push(`*...and ${totalRows - 5} more rows.*  \n*Run the generated code in the **REPL Playground** to see the full table in the **Analytics** tab.*`);
            }
          } else {
            parts.push(`**${item.title || 'Table'}**: empty (no data).`);
          }
        } catch { parts.push(`**${item.title || 'Table'}**: result available in Analytics tab.`); }
      } else if (['bargraph', 'piegraph', 'linegraph'].includes(String(item.type))) {
        parts.push(`*${item.title || item.type} rendered in the Analytics tab.*`);
      }
    }
  }

  if (plainOutput && String(plainOutput).trim()) {
    const text = String(plainOutput).trim();
    const lines = text.split('\n');
    if (lines.length <= 5) {
      parts.push(`**Output:**\n\`\`\`\n${text}\n\`\`\``);
    } else {
      parts.push(`**Output** (${lines.length} lines, showing first 5):\n\`\`\`\n${lines.slice(0, 5).join('\n')}\n... and ${lines.length - 5} more lines\n\`\`\``);
    }
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}

export const AgentView: React.FC = () => {
  const {
    activeScriptSource,
    messages,
    setMessages,
    threadId,
    setThreadId,
    setActiveInspectorTab,
    setAgentReplResults,
  } = useUI();
  const [isClearChatModalOpen, setIsClearChatModalOpen] = useState(false);

  const { cloudToken } = useAuth();
  const { showNotification } = useNotifications();
  const { selectedScript, setSelectedScript, runScript, executionResult, clearExecutionResult, userEditedScriptParameters } = useScriptExecution();
  const { scripts, toolLibraryPath } = useScripts();
  const rapServerUrl = useRapServerUrl();
  const { theme } = useTheme();
  const syntaxStyle = theme === 'eclipse' ? atomDark : (theme === 'midnight' || theme === 'dark' ? vscDarkPlus : vs);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const agentRunTriggeredRef = useRef<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'; // reset to calculate accurately
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  // PLAN ORCHESTRATION STATE
  const [activePlan, setActivePlan] = useState<OrchestrationPlan | null>(null);
  const [currentPlanStepIndex, setCurrentPlanStepIndex] = useState(-1);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const invokeAgent = useCallback(async (newMessages: Message[], options?: { isInternal?: boolean; summary?: string | null; raw_output?: Record<string, unknown> | null }) => {
    setIsLoading(true);

    if (!options?.isInternal && newMessages.some(m => m.type === 'human')) {
      setMessages(prev => [...prev, ...newMessages]);
      setInput('');
    }

    try {
      const llmProvider = localStorage.getItem('llmProvider');
      const llmModel = localStorage.getItem('llmModel');
      const llmApiKeyName = localStorage.getItem('llmApiKeyName');
      const llmApiKeyValue = localStorage.getItem('llmApiKeyValue');

      if (!llmProvider || !llmModel || !llmApiKeyValue) {
        showNotification("LLM configuration is missing. Check your settings.", "error");
        setIsLoading(false);
        return;
      }

      const lastHumanMessage = newMessages.findLast(m => m.type === 'human');
      const messageContent = lastHumanMessage ? lastHumanMessage.content : '';

      // Get latest raw history for high-fidelity persistence
      const latestRawHistory = messages.findLast(m => m.raw_history)?.raw_history;

      const currentParamsArray = selectedScript ? userEditedScriptParameters[selectedScript.id] : undefined;
      const currentParamsDict = currentParamsArray ?
        currentParamsArray.reduce((acc, param) => {
          if (param.name) {
            acc[param.name] = param.value ?? '';
          }
          return acc;
        }, {} as Record<string, string | number | boolean | string[] | number[]>) : undefined;

      const effectiveUrl = rapServerUrl ? `${rapServerUrl}/agent/chat` : "/agent/chat";
      const response = await api.post(effectiveUrl, {
        thread_id: threadId,
        message: messageContent,
        history: messages,
        raw_history: latestRawHistory, // The Steel Shield
        agent_scripts_path: toolLibraryPath,
        token: cloudToken,
        llm_provider: llmProvider,
        llm_model: llmModel,
        llm_api_key_name: llmApiKeyName,
        llm_api_key_value: llmApiKeyValue,
        user_edited_parameters: currentParamsDict,
        raw_output_for_summary: options?.raw_output,
        tool_call_id: newMessages[0].type === 'tool' ? (newMessages[0] as { tool_call_id: string }).tool_call_id : undefined,
        tool_output: newMessages[0].type === 'tool' ? newMessages[0].content : undefined,
      });


      if (!response.data) {
        showNotification("Received an empty response from the agent.", "error");
        return;
      }

      if (response.data.thread_id) setThreadId(response.data.thread_id);

      if (response.data.status === 'complete' && response.data.message) {
        const agentMessage: Message = {
          type: 'ai',
          content: response.data.message,
          id: `ai-${Date.now()}`,
          plan: response.data.current_plan,
          raw_history: response.data.raw_history_json // Capture the Steel Shield
        };
        setMessages(prev => [...prev, agentMessage]);


        if (response.data.active_script) {
          const scriptInfo = response.data.active_script;
          if (selectedScript?.id !== scriptInfo.id) {
            setSelectedScript(scriptInfo, 'agent_executed_full_output');
          }
        }


      }
      else if (response.data.status === 'interrupted' && response.data.tool_call) {
        // --- SOVEREIGN CONDUCTOR LOGIC ---
        const t_name = response.data.tool_call.name;
        const isSelectionTool = t_name === 'set_active_script';
        const isRunTool = t_name.startsWith('run_') && t_name !== 'run_script_by_name';
        
        if (isSelectionTool || isRunTool) {
          let scriptToSelect = null;
          if (response.data.active_script) {
            scriptToSelect = response.data.active_script;
          } else {
            const s_id = isSelectionTool ? (response.data.tool_call.arguments.script_id) : t_name.replace('run_', '');
            scriptToSelect = scripts.find((s: Script) => {
              const manualSlug = s.id.toLowerCase().replace(/\\/g, '/').replace('.cs', '').split('/').join('_').replace(/ /g, '_').replace(/\./g, '_');
              const targetSlug = s_id.toLowerCase().replace(/\\/g, '_').replace('.cs', '');
              return manualSlug.endsWith(targetSlug);
            });
          }

          if (scriptToSelect) {
            const args = response.data.tool_call.arguments || {};
            const prefilled = isSelectionTool ? (args.prefilled_parameters || {}) : args;
            const selected = {
              ...scriptToSelect,
              sourcePath: scriptToSelect.absolutePath,
              parameters: (scriptToSelect.parameters || []).map((p: ScriptParameter) => ({
                ...p,
                value: prefilled[p.name] !== undefined ? prefilled[p.name] : p.value
              }))
            };
            if (selectedScript?.id !== scriptToSelect.id) {
              setSelectedScript(selected, 'agent');
            }
            setActiveInspectorTab('parameters');
          }
        } else if (t_name === 'execute_dynamic_query') {
            // Agent REPL execution is now isolated. We no longer hijack the user's Inspector tabs.
        }

        const toolCallMessage: Message = {
          type: 'ai',
          content: response.data.message || `Agent requested tool: ${response.data.tool_call.name}`,
          id: `ai-tool-${Date.now()}`,
          plan: response.data.current_plan, // ATTACH PLAN HERE
          tool_calls: [{
            id: response.data.tool_call.id || `tool-call-${Date.now()}`,
            name: response.data.tool_call.name,
            args: response.data.tool_call.arguments
          }],
          raw_history: response.data.raw_history_json // Capture the Steel Shield
        };
        setMessages(prev => [...prev, toolCallMessage]);

      }
    } catch (error: unknown) {
      console.error("Agent invoke error:", error);
      showNotification("Failed to communicate with the agent.", "error");
    } finally {
      setIsLoading(false);
    }
  }, [threadId, toolLibraryPath, cloudToken, setMessages, setThreadId, showNotification, selectedScript, userEditedScriptParameters, setSelectedScript, setActiveInspectorTab, rapServerUrl, scripts, messages]);

  const executePlanStep = useCallback((plan: OrchestrationPlan, stepIndex: number) => {
    let steps = plan.steps;
    if (typeof steps === 'string') {
      try { steps = JSON.parse(steps); } catch (e) { console.error("Failed to parse plan steps:", e); }
    }

    if (!Array.isArray(steps)) {
      showNotification("Error: Invalid plan steps format.", "error");
      return;
    }

    const step = steps[stepIndex];
    if (!step) return;

    console.log(`[AgentView] Executing Plan Step ${stepIndex + 1}: ${step.script_id}`);

    // Resolve script locally
    const localScript = scripts.find((s: Script) => {
      const ms = s.id.toLowerCase().replace(/\\/g, '/').replace('.cs', '').split('/').join('_').replace(/ /g, '_').replace(/\./g, '_');
      const ts = step.script_id.toLowerCase().replace(/\\/g, '_').replace('.cs', '');
      return ms.endsWith(ts);
    });

    if (localScript) {
      agentRunTriggeredRef.current = true;
      const finalParams = localScript.parameters.map((p: ScriptParameter) => ({
        ...p,
        value: step.deduced_parameters[p.name] !== undefined ? step.deduced_parameters[p.name] : p.value
      }));

      setSelectedScript({ ...localScript, parameters: finalParams }, 'agent');
      setActiveInspectorTab('parameters');

      // Actually run after a tiny delay to ensure selection caught up
      setTimeout(() => {
        runScript(localScript, finalParams);
      }, 100);
    } else {
      showNotification(`Error: Script ${step.script_id} not found for plan step.`, "error");
      setActivePlan(null);
      setCurrentPlanStepIndex(-1);
    }
  }, [scripts, setSelectedScript, setActiveInspectorTab, runScript, showNotification]);

  useEffect(() => {
    if (executionResult && agentRunTriggeredRef.current) {
      const hasTableOutput = executionResult.structuredOutput?.some(item => item.type === 'table');
      setActiveInspectorTab(hasTableOutput ? 'table' : 'console');

      const rawOutputPayload = {
        structuredOutput: executionResult.structuredOutput,
        output: executionResult.output,
        internal_data: executionResult.internalData,
      };

      // Handle Plan Progression
      if (activePlan) {
        const nextIndex = currentPlanStepIndex + 1;
        if (nextIndex < activePlan.steps.length) {
          setCurrentPlanStepIndex(nextIndex);
          executePlanStep(activePlan, nextIndex);
        } else {
          // Plan finished!
          invokeAgent(
            [{ type: 'human', content: `System: Automation plan "${activePlan.action}" finished successfully. summarize results.`, id: `system-${Date.now()}` }],
            { isInternal: true, summary: null, raw_output: rawOutputPayload }
          );
          setActivePlan(null);
          setCurrentPlanStepIndex(-1);
        }
      } else {
        // Standard single-script summary
        invokeAgent(
          [{ type: 'human', content: "System: Script execution was successful.", id: `system-${Date.now()}` }],
          { isInternal: true, summary: null, raw_output: rawOutputPayload }
        );
      }

      agentRunTriggeredRef.current = false;
    }
  }, [executionResult, invokeAgent, setActiveInspectorTab, activePlan, currentPlanStepIndex, executePlanStep]);

  const sendMessage = (messageText: string) => {
    if (!messageText.trim()) return;
    invokeAgent([{ type: 'human', content: messageText, id: `user-${Date.now()}` }]);
  };

  const handleToolResponse = async (toolCall: ToolCall, userDecision: 'approve' | 'reject') => {
    const isScriptRun = toolCall.name.startsWith('run_');
    const isDynamicQuery = toolCall.name === 'execute_dynamic_query';
    
    // UI optimistic update
    setMessages(prev => [...prev, {
      type: 'tool',
      content: JSON.stringify({ user_decision: userDecision }),
      tool_call_id: toolCall.id,
    }]);

    if (userDecision === 'reject') {
        invokeAgent([{ type: 'human', content: `I have rejected the action. Let's try a different approach.`, id: `user-${Date.now()}` }]);
        return;
    }

    if (isDynamicQuery) {
        setIsLoading(true);
        try {
            const effectiveUrl = rapServerUrl ? `${rapServerUrl}/api/repl` : "/api/repl";
            const res = await api.post(effectiveUrl, {
                code: toolCall.args.csharp_code,
                session_id: threadId || "temp_session"
            });
            
            if (!res.data.is_success) {
                // Build retry count from recent tool failures
                let retryCount = 1;
                for (let i = messages.length - 1; i >= 0; i--) {
                    if (messages[i].type === 'tool' && typeof messages[i].content === 'string' && (messages[i].content as string).startsWith('ERROR:')) {
                        retryCount++;
                    } else if (messages[i].type === 'human') {
                        break;
                    }
                }

                const errorMsg = res.data.error_message || res.data.output || 'Unknown REPL execution error';
                const errorContent = `**Execution Failed** (retry ${retryCount}/3)\n\`\`\`\n${errorMsg}\n\`\`\``;

                setMessages(prev => [...prev, {
                    type: 'tool',
                    content: errorContent,
                    tool_call_id: toolCall.id,
                }]);

                const systemMsg = retryCount >= 3
                    ? `System: REPL execution failed 3 times. Last error: ${errorMsg}. Do NOT retry. Explain the issue to the user and suggest they check their Revit model or refine the query.`
                    : `System: REPL execution FAILED (retry ${retryCount}/3). Error: ${errorMsg}. Please correct the C# code and call execute_dynamic_query again with the fixed version.`;

                await invokeAgent([{ type: 'human', content: systemMsg, id: `system-${Date.now()}` }]);
                setIsLoading(false);
                return;
            }

            // ── Success path (unchanged) ──
            const rawOutputPayload = {
              structuredOutput: res.data.structured_output,
              output: res.data.output,
              internal_data: res.data.internal_data,
            };

            const hasTable = res.data.structured_output?.some((item: Record<string, unknown>) => item.type === 'table');
            if (hasTable) {
              setAgentReplResults(res.data.structured_output);
              setActiveInspectorTab('table');
            }

            const previewContent = buildReplPreview(res.data.structured_output, res.data.output);
            if (previewContent) {
              setMessages(prev => [...prev, {
                type: 'tool',
                content: previewContent,
                tool_call_id: toolCall.id,
              }]);
            }

            await invokeAgent(
               [{ type: 'human', content: `System: REPL execution completed. Result available in the Analytics tab.`, id: `system-${Date.now()}` }],
               { isInternal: true, summary: null, raw_output: rawOutputPayload }
            );
            
        } catch (err) {
            console.error("Failed to run REPL snippet:", err);
            showNotification("Failed to run snippet in Revit", "error");
            await invokeAgent([{ type: 'human', content: `System: Execution failed due to server error.`, id: `system-${Date.now()}` }]);
        } finally {
            setIsLoading(false);
        }
        return;
    }

    if (isScriptRun) {
      if (selectedScript) {
        agentRunTriggeredRef.current = true;
        const currentParamsArray = userEditedScriptParameters[selectedScript.id] || [];
        const parameters = toolCall.name === 'run_script_by_name' ? toolCall.args.parameters : toolCall.args;
        const finalParams = selectedScript.parameters.map(p => {
          const uiMatch = currentParamsArray.find(up => up.name === p.name);
          const toolArgs = parameters as Record<string, string | number | boolean>;
          return {
            ...p,
            value: uiMatch ? uiMatch.value : (toolArgs[p.name] ?? p.value)
          }
        });
        runScript(selectedScript, finalParams);
      } else {
        showNotification("Error: No script is selected.", "error");
      }
    }
  };

  const handleClearChat = useCallback(() => {
    setMessages([]);
    setThreadId(null);
    setInput('');
    setIsClearChatModalOpen(false);
    localStorage.removeItem(LOCAL_STORAGE_KEY_MESSAGES);
    localStorage.removeItem(LOCAL_STORAGE_KEY_THREAD_ID);
  }, [setMessages, setThreadId]);

  const { activePendingToolCall } = useMemo(() => {
    const resolvedIds = new Set(messages.filter(m => m.type === 'tool').map(m => m.tool_call_id));
    let activeCall: ToolCall | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.type === 'ai' && msg.tool_calls) {
        const unresolved = msg.tool_calls.find((tc: ToolCall) => !resolvedIds.has(tc.id));
        if (unresolved) { activeCall = unresolved; break; }
      }
    }
    return { activePendingToolCall: activeCall };
  }, [messages]);

  const resolvedToolCallIds = useMemo(() => {
    return new Set(messages.filter(m => m.type === 'tool').map(m => m.tool_call_id));
  }, [messages]);

  const renderMessageContent = (msg: Message) => {
    if (msg.type === 'tool' && typeof msg.content === 'string') {
      const content = msg.content;
      if (content.startsWith('ERROR:') || content.startsWith('**Execution Failed')) {
        return (
          <div className="text-[12.5px] leading-relaxed break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                strong: ({node, ...props}) => <strong className="font-bold text-rose-600 dark:text-rose-400" {...props} />,
                code: ({node, className, children, ...props}: any) => (
                  <code className="bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 px-1.5 py-0.5 rounded text-[11px] font-mono border border-rose-200 dark:border-rose-800/50" {...props}>
                    {children}
                  </code>
                ),
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
        );
      }
    }

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const toolCall = msg.tool_calls[0];
      const { script_metadata, csharp_code, justification, ...displayArgs } = toolCall.args;
      
      const isDynamicQuery = toolCall.name === 'execute_dynamic_query';
      const isResolved = toolCall.id ? resolvedToolCallIds.has(toolCall.id) : false;

      return (
        <div className="space-y-3 w-full max-w-2xl">
          {justification && (
              <div className="text-[13.5px] leading-relaxed break-words whitespace-pre-wrap -mt-0.5">
                  {justification as string}
              </div>
          )}

          {csharp_code ? (
              <div className="bg-[var(--bg-panel)] rounded-xl border border-[var(--border-divider)] shadow-sm overflow-hidden mt-2">
                  <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-card)] border-b border-[var(--border-divider)]/50">
                     <div className="flex items-center space-x-2">
                        <div className="w-5 h-5 rounded-full bg-[var(--bg-group)] flex items-center justify-center border border-[var(--border-divider)] shadow-sm shrink-0">
                           <FontAwesomeIcon icon={faAsterisk} className="text-[10px] text-[var(--accent)]" />
                        </div>
                        <span className="text-[12px] font-medium text-[var(--text-main)]">Action Proposed</span>
                     </div>
                     {isResolved ? (
                        <div className="flex items-center space-x-1.5 bg-green-500/10 px-2.5 py-1 rounded-md border border-green-500/20">
                           <FontAwesomeIcon icon={faCheckCircle} className="text-[10px] text-green-500" />
                           <span className="text-[10px] font-bold tracking-wide text-green-500 uppercase">Executed</span>
                        </div>
                     ) : (
                        <div className="flex items-center space-x-2">
                           <button
                             onClick={() => handleToolResponse(toolCall, 'reject')}
                             className="px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] hover:text-red-500 transition-colors bg-transparent border border-transparent hover:border-red-500/20 rounded-md"
                           >
                             Reject
                           </button>
                           <button
                             onClick={(e) => {
                               e.stopPropagation();
                               navigator.clipboard.writeText(csharp_code as string);
                               showNotification("Code copied to clipboard!", "success");
                             }}
                             title="Copy code for manual execution in the REPL Playground"                             className="px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors bg-[var(--bg-group)] border border-[var(--border-divider)] hover:border-[var(--accent)] rounded-md shadow-sm"
                           >
                             <FontAwesomeIcon icon={faCopy} className="mr-1.5" />
                             Copy
                           </button>
                           <button
                             onClick={() => handleToolResponse(toolCall, 'approve')}
                             className="px-3 py-1.5 text-[11px] font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors rounded-md shadow-sm"
                           >
                             Approve & Run
                           </button>
                        </div>
                     )}
                  </div>
                  
                  <details className="group">
                    <summary className="px-4 py-2.5 text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider cursor-pointer hover:bg-[var(--bg-group)] transition-colors list-none flex items-center select-none">
                      <span className="mr-2 opacity-50 group-open:rotate-90 transition-transform">▶</span>
                      View Source Code
                    </summary>
                    <div className="border-t border-[var(--border-divider)]/50 bg-slate-100 dark:bg-slate-900 overflow-x-auto custom-scrollbar text-[12.5px] leading-relaxed code-viewer-override">
                        <SyntaxHighlighter
                          key={theme}
                          style={syntaxStyle as any}
                          language="csharp"
                          PreTag="div"
                          customStyle={{ 
                            margin: 0, 
                            padding: '16px', 
                            backgroundColor: 'transparent',
                            wordBreak: 'break-word',
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                          }}
                          codeTagProps={{ style: { fontFamily: 'inherit' } }}
                          wrapLines={true}
                        >
                          {String(csharp_code).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                    </div>
                  </details>
              </div>
          ) : Object.keys(displayArgs).length > 0 && (
             <div className="bg-[var(--bg-panel)] rounded-xl border border-[var(--border-divider)] shadow-sm overflow-hidden mt-2">
                 <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-card)] border-b border-[var(--border-divider)]/50">
                    <div className="flex items-center space-x-2">
                       <div className="w-5 h-5 rounded-full bg-[var(--bg-group)] flex items-center justify-center border border-[var(--border-divider)] shadow-sm shrink-0">
                          <FontAwesomeIcon icon={faAsterisk} className="text-[10px] text-[var(--accent)]" />
                       </div>
                       <span className="text-[12px] font-medium text-[var(--text-main)]">Tool Invoked: {toolCall.name}</span>
                    </div>
                    {isResolved ? (
                       <div className="flex items-center space-x-1.5 bg-green-500/10 px-2.5 py-1 rounded-md border border-green-500/20">
                          <FontAwesomeIcon icon={faCheckCircle} className="text-[10px] text-green-500" />
                          <span className="text-[10px] font-bold tracking-wide text-green-500 uppercase">Resolved</span>
                       </div>
                    ) : (
                       <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleToolResponse(toolCall, 'reject')}
                            className="px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] hover:text-red-500 transition-colors bg-transparent border border-transparent hover:border-red-500/20 rounded-md"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => handleToolResponse(toolCall, 'approve')}
                            className="px-3 py-1.5 text-[11px] font-bold text-[var(--text-main)] bg-[var(--bg-group)] border border-[var(--border-divider)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors rounded-md shadow-sm"
                          >
                            Proceed
                          </button>
                       </div>
                    )}
                 </div>
                 <div className="p-4 text-[11px] font-mono opacity-80 overflow-x-auto text-[var(--text-main)]">
                   {JSON.stringify(displayArgs, null, 2)}
                 </div>
             </div>
          )}
        </div>
      );
    }

    if (msg.plan) {
      const isExecuting = activePlan === msg.plan;
      return (
        <div className="space-y-2">
          <p className="whitespace-pre-wrap">
            {typeof msg.content === 'string'
              ? msg.content
              : Array.isArray(msg.content)
                ? msg.content.map(i => i.text).join('\n')
                : ''}
          </p>
          <OrchestrationPlanCard
            plan={msg.plan}
            isPending={messages[messages.length - 1].id === msg.id && !isExecuting}
            onExecute={() => {
              if (!msg.plan) return;
              setActivePlan(msg.plan);
              setCurrentPlanStepIndex(0);
              executePlanStep(msg.plan, 0);
            }}
            onSwitchTab={(tab) => setActiveInspectorTab(tab)}
            onCompute={(stepIdx, paramName) => {
              const step = msg.plan?.steps[stepIdx];
              if (!step) return;
              const localScript = scripts.find(s => s.id.toLowerCase().endsWith(step.script_id.replace('.cs', '').toLowerCase()));
              if (localScript) {
                setSelectedScript(localScript, 'agent');
                setActiveInspectorTab('parameters');
              }
            }}
            onUpdateParameter={(stepIdx, paramName, value) => {
              setMessages(prev => prev.map(m => {
                if (m.id === msg.id && m.plan) {
                  const newSteps = [...m.plan.steps];
                  newSteps[stepIdx] = {
                    ...newSteps[stepIdx],
                    deduced_parameters: {
                      ...newSteps[stepIdx].deduced_parameters,
                      [paramName]: value
                    },
                    satisfied_parameters: Array.from(new Set([...newSteps[stepIdx].satisfied_parameters, paramName])),
                    missing_parameters: newSteps[stepIdx].missing_parameters.filter((p: string) => p !== paramName)
                  };
                  return { ...m, plan: { ...m.plan, steps: newSteps } };
                }
                return m;
              }));
            }}
          />
        </div>
      );
    }

    const content = typeof msg.content === 'string'
      ? msg.content
      : Array.isArray(msg.content)
        ? (msg.content as { text: string }[]).map((i) => i.text || '').join('\n')
        : '';
        
    return (
        <div className="text-[13.5px] leading-relaxed break-words">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              ul: ({node, ...props}) => <ul className="list-disc pl-5 my-2 space-y-1" {...props} />,
              ol: ({node, ...props}) => <ol className="list-decimal pl-5 my-2 space-y-1" {...props} />,
              li: ({node, ...props}) => <li className="pl-1" {...props} />,
              strong: ({node, ...props}) => <strong className="font-bold text-[var(--text-main)]" {...props} />,
              em: ({node, ...props}) => <em className="italic opacity-90" {...props} />,
              p: ({node, ...props}) => <p className="mb-3 last:mb-0" {...props} />,
              a: ({node, ...props}) => <a className="text-[var(--accent)] hover:underline underline-offset-2" {...props} />,
              table: ({node, ...props}) => <div className="my-3 overflow-x-auto rounded-xl border border-[var(--border-divider)] shadow-sm"><table className="w-full border-collapse text-[12.5px]" {...props} /></div>,
              thead: ({node, ...props}) => <thead className="bg-slate-100 dark:bg-slate-800/80" {...props} />,
              tbody: ({node, ...props}) => <tbody className="divide-y divide-[var(--border-divider)]" {...props} />,
              tr: ({node, ...props}) => <tr className="even:bg-slate-50/50 dark:even:bg-slate-800/30" {...props} />,
              th: ({node, ...props}) => <th className="px-3 py-2 text-left text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap" {...props} />,
              td: ({node, ...props}) => <td className="px-3 py-2 text-[var(--text-main)] whitespace-nowrap border-l border-[var(--border-divider)]/30 first:border-l-0" {...props} />,
              code: ({node, className, children, ...props}: any) => {
                const match = /language-(\w+)/.exec(className || '');
                const isInline = !match && !String(children).includes('\n');
                return isInline ? (
                  <code className="bg-[var(--bg-group)] text-[var(--text-main)] px-1.5 py-0.5 rounded text-[11px] font-mono border border-[var(--border-divider)]" {...props}>
                    {children}
                  </code>
                ) : (
                  <div className="my-3 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700/60 shadow-sm text-[12.5px] custom-scrollbar bg-slate-100 dark:bg-slate-900 code-viewer-override">
                    <SyntaxHighlighter
                      key={theme}
                      style={syntaxStyle as any}
                      language={match ? match[1] : 'csharp'}
                      PreTag="div"
                      customStyle={{ 
                        margin: 0, 
                        padding: '14px', 
                        backgroundColor: 'transparent',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                      }}
                      codeTagProps={{ style: { fontFamily: 'inherit' } }}
                      showLineNumbers
                      wrapLines={true}
                      {...props}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  </div>
                )
              }
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
    );
  };

  const isHuman = (msg: Message) => msg.type === 'human' && !msg.content?.toString().startsWith('System:');

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden relative font-sans">
      {/* ── GROUNDED HEADER ── */}
      <div className="flex-shrink-0 flex justify-between items-center px-4 py-3 z-20 mt-3 mb-2 mx-4 bg-[var(--bg-ground)] rounded-2xl border border-[var(--border-divider)] shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-full bg-[var(--bg-panel)] flex items-center justify-center shadow-md border border-[var(--border-divider)]">
             <FontAwesomeIcon icon={faAsterisk} size="sm" className="text-[var(--accent)]" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-[13px] font-black text-[var(--text-main)] tracking-tight uppercase leading-tight">Paracore</h1>
            <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-wider uppercase leading-none">Agent</span>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setIsClearChatModalOpen(true)} 
            title="Clear Session" 
            className="p-1.5 text-[var(--text-muted)] hover:text-red-500 transition-colors"
          >
            <FontAwesomeIcon icon={faTrash} className="text-xs" />
          </button>
        </div>
      </div>

      {/* ── MESSAGES CANAL ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 lg:p-6 space-y-6">
        {messages.filter(m => m.type !== 'tool' && !isHuman(m) && !(m.type === 'human' && typeof m.content === 'string' && m.content.startsWith('System:'))).length === 0 && Array.isArray(messages) && messages.filter(m => m.type === 'human' && !m.content?.toString().startsWith('System:')).length === 0 && (
            <div className="flex flex-col items-center justify-center h-full opacity-30 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-[var(--bg-panel)] flex items-center justify-center border border-[var(--border-divider)]/50 shadow-sm opacity-60 mb-2">
                    <FontAwesomeIcon icon={faAsterisk} size="2x" className="text-[var(--accent)]" />
                </div>
                <p className="text-sm font-bold tracking-widest uppercase text-[var(--text-muted)]">Awaiting Orders</p>
            </div>
        )}

        {messages.filter(m => {
          if (m.type === 'tool') {
            const c = typeof m.content === 'string' ? m.content : '';
            return c.startsWith('ERROR:') || c.startsWith('**Execution Failed');
          }
          if (m.type === 'human' && typeof m.content === 'string' && m.content.startsWith('System:')) return false;
          return true;
        }).map((msg) => {
          const human = isHuman(msg);
          
          return (
            <div key={msg.id} className={`flex ${human ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              <div className={`flex max-w-[90%] lg:max-w-[80%] space-x-3 ${human ? 'flex-row-reverse space-x-reverse' : ''}`}>
                
                {/* Avatar / Icon */}
                <div className={`mt-1 w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${
                  human 
                    ? 'bg-transparent text-[var(--text-muted)] border-transparent opacity-50' 
                    : 'bg-[var(--bg-panel)] border-[var(--border-divider)] text-[var(--accent)] shadow-sm'
                }`}>
                  <FontAwesomeIcon icon={human ? faUser : faAsterisk} size="sm" className={human ? "" : "opacity-90"} />
                </div>

                {/* Message Surface */}
                <div className={`
                    py-1.5 transition-all
                    ${human 
                        ? 'px-4 bg-[var(--bg-panel)] text-[var(--text-main)] rounded-2xl rounded-tr-sm shadow-sm border border-[var(--border-divider)]' 
                        : 'text-[var(--text-main)] max-w-full'
                    }
                `}>
                  {renderMessageContent(msg)}
                </div>

              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex justify-start items-center space-x-3 animate-in fade-in slide-in-from-bottom-2">
            <div className="w-8 h-8 rounded-lg bg-[var(--bg-panel)] border border-[var(--border-divider)] flex items-center justify-center shadow-sm">
              <FontAwesomeIcon icon={faAsterisk} size="xs" className="text-[var(--accent)] animate-pulse" />
            </div>
            <div className="px-5 py-3.5 bg-[var(--bg-panel)] rounded-xl border border-[var(--border-divider)] shadow-sm flex space-x-1.5 items-center">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* ── GROUNDED INPUT AREA ── */}
      <div className="p-4 bg-transparent z-20 max-w-4xl mx-auto w-full">
        <form 
          onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} 
          className="flex items-end space-x-3"
        >
          <div className="flex-1 bg-[var(--bg-panel)] rounded-2xl border border-[var(--border-divider)] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_15px_-3px_rgba(var(--accent-rgb),0.2)] transition-all shadow-sm overflow-hidden flex items-center">
             <textarea
               ref={textareaRef}
               value={input}
               onChange={(e) => setInput(e.target.value)}
               onKeyDown={handleKeyDown}
               placeholder="What do you want to automate today?"
               className="w-full bg-transparent px-4 py-3 text-[13.5px] focus:outline-none text-[var(--text-main)] placeholder-[var(--text-muted)]/50 font-medium resize-none min-h-[44px] max-h-[250px] custom-scrollbar leading-relaxed"
               disabled={isLoading}
               rows={1}
             />
          </div>
          <button 
            type="submit" 
            disabled={isLoading || !input.trim()} 
            className="w-[46px] h-[46px] shrink-0 bg-[var(--accent)] text-white rounded-[14px] hover:opacity-90 transition-all disabled:opacity-30 disabled:hover:opacity-30 flex items-center justify-center shadow-lg active:scale-95"
          >
            <FontAwesomeIcon icon={faPaperPlane} className="text-sm shadow-sm" />
          </button>
        </form>
        <div className="text-center mt-2 opacity-50 text-[10px] text-[var(--text-muted)]">
          Shift+Enter for new line • Press Enter to send
        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={isClearChatModalOpen} onClose={() => setIsClearChatModalOpen(false)} title="Clear Session">
        <div className="p-6 text-center space-y-4">
          <p className="text-sm font-medium text-[var(--text-main)] opacity-80">This will permanently delete your conversation history for this session. Continue?</p>
          <div className="flex justify-center space-x-3">
            <button onClick={() => setIsClearChatModalOpen(false)} className="px-6 py-2 bg-[var(--bg-card)] border border-[var(--border-divider)] text-[var(--text-main)] rounded-lg font-bold text-[11px] uppercase tracking-widest">Cancel</button>
            <button onClick={handleClearChat} className="px-6 py-2 bg-red-600 text-white rounded-lg font-bold text-[11px] uppercase tracking-widest hover:bg-red-700">Clear All</button>
          </div>
        </div>
      </Modal>


    </div>
  );
};
