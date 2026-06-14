import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { flushSync } from 'react-dom';
import { useUI } from '@/hooks/useUI';
import { useAuth } from '@/features/auth';
import api from '@/api/axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane, faAsterisk, faUser, faRobot, faCheckCircle, faTimesCircle, faSpinner, faTrash, faSyncAlt, faCopy } from '@fortawesome/free-solid-svg-icons';
import { useNotifications } from '@/hooks/useNotifications';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { useScriptExecution } from '@/features/automation';
import { useScripts } from '@/features/automation';
import { useConsole } from '@/features/automation/store/ConsoleContext';
import type { ConsoleItemType } from '@/features/automation/store/ConsoleContext';
import { filterVisibleParameters } from '@/utils/parameterVisibility';

import { Modal } from '@/components/common/Modal';
import { useRapServerUrl } from '@/hooks/useRapServerUrl';
import OrchestrationPlanCard from './OrchestrationPlanCard';
import { buildReplPreview } from './ReplPreview';
import { Script, ScriptParameter } from '@/types/scriptModel';
import { Message, ToolCall, OrchestrationPlan, ThinkingStep } from '../types/agentTypes';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs, atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '@/context/ThemeContext';

const LOCAL_STORAGE_KEY_MESSAGES = 'agent_chat_messages';
const LOCAL_STORAGE_KEY_THREAD_ID = 'agent_chat_thread_id';

export const AgentView: React.FC = () => {
  const {
    activeScriptSource,
    messages,
    setMessages,
    threadId,
    setThreadId,
    setActiveInspectorTab,
    setAgentReplResults,
    setAgentCapturedDocTitle,
  } = useUI();
  const [isClearChatModalOpen, setIsClearChatModalOpen] = useState(false);

  const { cloudToken } = useAuth();
  const { showNotification } = useNotifications();
  const { revitStatus } = useRevitStatus();
  const { selectedScript, setSelectedScript, runScript, executionResult, clearExecutionResult, userEditedScriptParameters } = useScriptExecution();
  const { scripts, toolLibraryPath } = useScripts();
  const { setLocalHistory } = useConsole();
  const rapServerUrl = useRapServerUrl();
  const { theme } = useTheme();
  const syntaxStyle = theme !== 'light' ? vscDarkPlus : vs;

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

  const didMountRef = useRef(false);
  useEffect(() => {
    // Skip auto-scroll on initial mount (e.g. when switching tabs).
    // Only scroll when messages actually change or loading completes.
    if (!didMountRef.current) {
      didMountRef.current = true;
      // Still scroll to bottom on first paint, but instantly (no animation)
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      return;
    }
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

      const payload = {
        thread_id: threadId,
        message: messageContent,
        history: latestRawHistory ? undefined : messages,
        raw_history: latestRawHistory,
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
      };

      const baseUrl = rapServerUrl || '';
      const streamUrl = `${baseUrl}/agent/chat/stream`;

      const streamResponse = await fetch(streamUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!streamResponse.ok) {
        const errText = await streamResponse.text().catch(() => '');
        throw new Error(`Stream error ${streamResponse.status}: ${errText}`);
      }

      const reader = streamResponse.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Accumulate thinking steps during streaming (so we can render incrementally)
      const accumulatedSteps: ThinkingStep[] = [];
      let finalMessage = '';
      let finalRawHistory: string | undefined;
      let finalStatus: 'complete' | 'interrupted' | 'error' = 'complete';
      let finalToolCall: ToolCall | undefined;

      // Create the placeholder AI message once
      const placeholderId = `ai-${Date.now()}`;
      flushSync(() => {
        setMessages(prev => [...prev, {
          type: 'ai' as const,
          content: '',
          id: placeholderId,
          thinking_steps: [],
        }]);
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            let data: Record<string, unknown> = {};
            try { data = JSON.parse(line.slice(6)); } catch { continue; }

            if (currentEvent === 'thinking_step') {
              const idx = (data.step_index as number) ?? accumulatedSteps.length;
              const newStatus = (data.status as ThinkingStep['status']) || 'running';

              // Remove synthetic pending marker when a real step starts
              if (newStatus === 'running') {
                const synthIdx = accumulatedSteps.findIndex(s => s.tool_name === '__pending__');
                if (synthIdx >= 0) accumulatedSteps.splice(synthIdx, 1);
              }

              accumulatedSteps[idx] = {
                tool_name: (data.tool_name as string) || '',
                justification: (data.justification as string) || '',
                status: newStatus,
                csharp_code: data.csharp_code as string | undefined,
                category_name: data.category_name as string | undefined,
                query: data.query as string | undefined,
                result_summary: data.result_summary as string | undefined,
              };

              // When a step completes and nothing else is running, add a
              // synthetic pending marker so "Working..." stays visible while
              // the agent thinks between steps.
              if (newStatus === 'completed' || newStatus === 'error') {
                const hasRunning = accumulatedSteps.some(s => s.status === 'running');
                if (!hasRunning) {
                  accumulatedSteps.push({
                    tool_name: '__pending__',
                    justification: '',
                    status: 'running',
                  });
                }
              }

              const snapshot = [...accumulatedSteps];
              flushSync(() => {
                setMessages(prev => prev.map(m =>
                  m.id === placeholderId
                    ? { ...m, thinking_steps: snapshot }
                    : m
                ));
              });
            } else if (currentEvent === 'interrupted') {
              finalStatus = 'interrupted';
              finalRawHistory = data.raw_history_json as string;
              const tc = data.tool_call as Record<string, unknown> | undefined;
              if (tc) {
                finalToolCall = {
                  id: (tc.id as string) || `tool-call-${Date.now()}`,
                  name: tc.name as string,
                  args: (tc.arguments as ToolCall['args']) || {},
                };
              }
              if (data.thread_id) setThreadId(data.thread_id as string);
              // Sync accumulated steps from server as final
              if (data.thinking_steps) {
                accumulatedSteps.length = 0;
                accumulatedSteps.push(...(data.thinking_steps as ThinkingStep[]));
              }
            } else if (currentEvent === 'complete') {
              finalStatus = 'complete';
              finalMessage = (data.message as string) || '';
              finalRawHistory = data.raw_history_json as string;
              if (data.thread_id) setThreadId(data.thread_id as string);
              if (data.thinking_steps) {
                accumulatedSteps.length = 0;
                accumulatedSteps.push(...(data.thinking_steps as ThinkingStep[]));
              }
            } else if (currentEvent === 'error') {
              finalStatus = 'error';
              finalMessage = (data.message as string) || 'An error occurred.';
              if (data.thinking_steps) {
                accumulatedSteps.length = 0;
                accumulatedSteps.push(...(data.thinking_steps as ThinkingStep[]));
              }
            }
          }
        }
      }

      // ── Finalize messages ──────────────────────────────────────────────
      const finalSteps = accumulatedSteps.filter(s => s.tool_name !== '__pending__');

      if (finalStatus === 'interrupted' && finalToolCall) {
        // Remove placeholder, add tool call message with thinking steps
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== placeholderId);
          filtered.push({
            type: 'ai',
            content: `Agent requested tool: ${finalToolCall!.name}`,
            id: `ai-tool-${Date.now()}`,
            tool_calls: [finalToolCall!],
            raw_history: finalRawHistory,
            thinking_steps: finalSteps,
          });
          return filtered;
        });
      } else {
        // Complete / error — finalize placeholder with content + steps
        setMessages(prev => prev.map(m =>
          m.id === placeholderId
            ? { ...m, content: finalMessage, thinking_steps: finalSteps, raw_history: finalRawHistory }
            : m
        ));
        // Remove placeholder if still empty
        setMessages(prev => prev.filter(m => {
          if (m.id !== placeholderId) return true;
          return (typeof m.content === 'string' && m.content.trim().length > 0) || (m.thinking_steps?.length || 0) > 0;
        }));
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
        setMessages(prev => [...prev, {
            type: 'tool',
            content: 'REJECTED: User declined the action.',
            tool_call_id: toolCall.id,
        }]);
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

            const hasVisual = res.data.structured_output?.some((item: Record<string, unknown>) =>
                ['table', 'chart-bar', 'chart-pie', 'chart-line'].includes(String(item.type))
            );
            const capturedDoc = revitStatus.document ? revitStatus.document.split(/[\\/]/).pop() || null : null;
            if (hasVisual) {
              setAgentReplResults(res.data.structured_output);
              setAgentCapturedDocTitle(capturedDoc);
              setActiveInspectorTab('table');
            } else {
              setAgentReplResults([]);
              setAgentCapturedDocTitle(null);
            }

            // Push Println / text output to the History tab so it's visible
            // alongside the table/chart output that goes to the Analytics tab.
            const textOutput = (res.data.output || '').trim();
            if (textOutput) {
              setLocalHistory(prev => [...prev, {
                type: 'output' as ConsoleItemType,
                text: textOutput,
                timestamp: new Date(),
              }].slice(-100));
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
               [{ type: 'human', content: `System: REPL execution completed. Do NOT call execute_dynamic_query again — your response must be TEXT ONLY with no tool calls. Summarize the results or report that no data was found.`, id: `system-${Date.now()}` }],
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

  const rejectedToolCallIds = useMemo(() => {
    return new Set(messages.filter(m => m.type === 'tool' && typeof m.content === 'string' && m.content.startsWith('REJECTED')).map(m => m.tool_call_id));
  }, [messages]);

  // ── Thinking Step open state (persists across re-renders) ──────────
  const [openThinkingSteps, setOpenThinkingSteps] = useState<Set<string>>(new Set());

  const toggleThinkingStep = useCallback((key: string) => {
    setOpenThinkingSteps(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

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
                strong: ({node, ...props}) => <strong className="font-bold text-[var(--danger)]" {...props} />,
                code: ({node, className, children, ...props}: any) => (
                  <code className="bg-[var(--danger-muted)] text-[var(--danger)] px-1.5 py-0.5 rounded text-[11px] font-mono border border-[var(--danger)]/20" {...props}>
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

    // ── Thinking Steps (agent exploration/search/read) ────────────────
    const hasThinkingSteps = msg.thinking_steps && msg.thinking_steps.length > 0;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const toolCall = msg.tool_calls[0];
      const { script_metadata, csharp_code, justification, ...displayArgs } = toolCall.args;
      
      const isDynamicQuery = toolCall.name === 'execute_dynamic_query';
      const isResolved = toolCall.id ? resolvedToolCallIds.has(toolCall.id) : false;
      const isRejected = toolCall.id ? rejectedToolCallIds.has(toolCall.id) : false;

      const toolCompletedSteps = hasThinkingSteps
        ? msg.thinking_steps!.filter(s => s.status !== 'running' && s.tool_name !== '__pending__')
        : [];
      const toolIcons: Record<string, string> = {
        explore_revit_data: '🔍', search_schema: '📋', read_extension_methods: '📖',
      };
      const toolSummary = [...new Set(toolCompletedSteps.map(s =>
        toolIcons[s.tool_name] + ' ' + (s.tool_name === 'explore_revit_data' ? 'Explored' : s.tool_name === 'search_schema' ? 'Schema' : 'Docs')
      ))];

      return (
        <div className="space-y-3 w-full max-w-2xl">
          {/* ── Agent Activity (collapsible — like Claude Desktop) ── */}
          {toolCompletedSteps.length > 0 && (
          <details className="group bg-[var(--bg-panel)]/50 rounded-lg border border-[var(--border)]/50 overflow-hidden">
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer list-none hover:bg-[var(--bg-hover)]/30 transition-colors select-none">
              <div className="flex items-center gap-2 text-[11.5px] min-w-0">
                <span className="shrink-0">📋</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  Agent activity · {toolCompletedSteps.length} step{toolCompletedSteps.length !== 1 ? 's' : ''}
                </span>
                <span className="text-[var(--text-secondary)] opacity-70 truncate">
                  — {toolSummary.join(' · ')}
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-secondary)] opacity-50 group-open:hidden ml-2 shrink-0">expand</span>
              <span className="text-[10px] text-[var(--text-secondary)] opacity-50 hidden group-open:inline ml-2 shrink-0">collapse</span>
            </summary>
            <div className="border-t border-[var(--border)]/30 px-3 py-2 space-y-1.5 text-[12px]">
              {toolCompletedSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-2 py-1">
                  <span className="shrink-0 mt-0.5">{toolIcons[step.tool_name] || '⚙'}</span>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-[var(--text-primary)]">
                      {step.tool_name === 'explore_revit_data' ? 'Explored data' :
                       step.tool_name === 'search_schema' ? 'Searched schema' :
                       step.tool_name === 'read_extension_methods' ? 'Read docs' : step.tool_name}
                    </span>
                    <span className="text-[var(--text-secondary)] ml-1.5">{step.justification}</span>
                    {step.csharp_code && (
                      <details className="mt-1">
                        <summary className="text-[10px] text-[var(--text-secondary)] cursor-pointer hover:text-[var(--accent)] list-none">
                          ▶ code
                        </summary>
                        <div className="mt-1 bg-[var(--bg-card)] rounded overflow-x-auto p-2 text-[11px] font-mono whitespace-pre-wrap">
                          {step.csharp_code}
                        </div>
                      </details>
                    )}
                    {step.status === 'error' && (
                      <span className="text-[11px] text-[var(--danger)] ml-1.5">failed</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </details>
          )}

          {justification && (
              <div className="text-[13.5px] leading-relaxed break-words whitespace-pre-wrap -mt-0.5">
                  {justification as string}
              </div>
          )}

          {csharp_code ? (
              <div className="bg-[var(--bg-panel)] rounded-xl border border-[var(--border)]/30 shadow-sm overflow-hidden mt-2">
                  <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-card)] border-b border-[var(--border)]/30">
                     <div className="flex items-center space-x-2">
                        <FontAwesomeIcon icon={faRobot} className="text-[var(--accent)] text-[14px]" />
                        <span className="text-[12px] font-medium text-[var(--text-primary)]">Action Proposed</span>
                     </div>
                     {isRejected ? (
                        <div className="flex items-center space-x-1.5 bg-[var(--danger-muted)] px-2.5 py-1 rounded-md border border-[var(--danger)]/20">
                           <FontAwesomeIcon icon={faTimesCircle} className="text-[10px] text-[var(--danger)]" />
                           <span className="text-[10px] font-bold tracking-wide text-[var(--danger)] uppercase">Rejected</span>
                        </div>
                     ) : isResolved ? (
                        <div className="flex items-center space-x-2">
                           <div className="flex items-center space-x-1.5 bg-[var(--success-muted)] px-2.5 py-1 rounded-md border border-[var(--success)]/20">
                              <FontAwesomeIcon icon={faCheckCircle} className="text-[10px] text-[var(--success)]" />
                              <span className="text-[10px] font-bold tracking-wide text-green-500 uppercase">Executed</span>
                           </div>
                           <button
                             onClick={(e) => {
                               e.stopPropagation();
                               navigator.clipboard.writeText(csharp_code as string);
                               showNotification("Code copied to clipboard!", "success");
                             }}
                             title="Copy code for manual execution in the REPL Playground"
                             className="px-3 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors bg-[var(--bg-hover)] border border-[var(--border)] hover:border-[var(--accent)] rounded-md shadow-sm"
                           >
                             <FontAwesomeIcon icon={faCopy} className="mr-1.5" />
                             Copy
                           </button>
                        </div>
                     ) : (
                        <div className="flex items-center space-x-2">
                           <button
                             onClick={() => handleToolResponse(toolCall, 'reject')}
                             className="px-3 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--danger)] transition-colors bg-transparent border border-transparent hover:border-[var(--danger)]/20 rounded-md"
                           >
                             Reject
                           </button>
                           <button
                             onClick={(e) => {
                               e.stopPropagation();
                               navigator.clipboard.writeText(csharp_code as string);
                               showNotification("Code copied to clipboard!", "success");
                             }}
                             title="Copy code for manual execution in the REPL Playground"                             className="px-3 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors bg-[var(--bg-hover)] border border-[var(--border)] hover:border-[var(--accent)] rounded-md shadow-sm"
                           >
                             <FontAwesomeIcon icon={faCopy} className="mr-1.5" />
                             Copy
                           </button>
                           <button
                             onClick={() => handleToolResponse(toolCall, 'approve')}
                             className="px-3 py-1.5 text-[11px] font-bold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors rounded-md shadow-sm"
                           >
                             Approve & Run
                           </button>
                        </div>
                     )}
                  </div>
                  
                  <details className="group">
                    <summary className="px-4 py-2.5 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider cursor-pointer hover:bg-[var(--bg-hover)] transition-colors list-none flex items-center select-none">
                      <span className="mr-2 opacity-50 group-open:rotate-90 transition-transform">▶</span>
                      View Source Code
                    </summary>
                    <div className="border-t border-[var(--border)]/50 bg-[var(--bg-card)] overflow-x-auto custom-scrollbar text-[12.5px] leading-relaxed code-viewer-override">
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
             <div className="bg-[var(--bg-panel)] rounded-xl border border-[var(--border)]/30 shadow-sm overflow-hidden mt-2">
                 <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-card)] border-b border-[var(--border)]/30">
                    <div className="flex items-center space-x-2">
                       <FontAwesomeIcon icon={faRobot} className="text-[var(--accent)] text-[14px]" />
                       <span className="text-[12px] font-medium text-[var(--text-primary)]">Tool Invoked: {toolCall.name}</span>
                    </div>
                     {isRejected ? (
                        <div className="flex items-center space-x-1.5 bg-[var(--danger-muted)] px-2.5 py-1 rounded-md border border-[var(--danger)]/20">
                           <FontAwesomeIcon icon={faTimesCircle} className="text-[10px] text-[var(--danger)]" />
                           <span className="text-[10px] font-bold tracking-wide text-[var(--danger)] uppercase">Rejected</span>
                        </div>
                     ) : isResolved ? (
                       <div className="flex items-center space-x-2">
                          <div className="flex items-center space-x-1.5 bg-[var(--success-muted)] px-2.5 py-1 rounded-md border border-[var(--success)]/20">
                             <FontAwesomeIcon icon={faCheckCircle} className="text-[10px] text-[var(--success)]" />
                             <span className="text-[10px] font-bold tracking-wide text-green-500 uppercase">Resolved</span>
                          </div>
                       </div>
                    ) : (
                       <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleToolResponse(toolCall, 'reject')}
                            className="px-3 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--danger)] transition-colors bg-transparent border border-transparent hover:border-[var(--danger)]/20 rounded-md"
                          >
                            Reject
                          </button>
                          <button
                            onClick={() => handleToolResponse(toolCall, 'approve')}
                            className="px-3 py-1.5 text-[11px] font-bold text-[var(--text-primary)] bg-[var(--bg-hover)] border border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors rounded-md shadow-sm"
                          >
                            Proceed
                          </button>
                       </div>
                    )}
                 </div>
                 <div className="p-4 text-[11px] font-mono opacity-80 overflow-x-auto text-[var(--text-primary)]">
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
    const hasTextContent = typeof content === 'string' && content.trim().length > 0;

    // Separate running steps from completed/error steps
    const completedSteps = hasThinkingSteps
      ? msg.thinking_steps!.filter(s => s.status !== 'running')
      : [];
    const hasRunningStep = hasThinkingSteps
      ? msg.thinking_steps!.some(s => s.status === 'running')
      : false;

    // Working indicator (shown for empty state or when a step is in progress)
    const workingIndicator = (
      <div className="flex items-center space-x-2.5 text-[12px] text-[var(--text-secondary)]">
        <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        <span className="font-medium">Working...</span>
      </div>
    );

    // Nothing at all yet
    if (!hasThinkingSteps && !hasTextContent) return workingIndicator;

    // Only running steps, no completed ones yet — show working
    if (hasRunningStep && completedSteps.length === 0 && !hasTextContent) return workingIndicator;

    // Tool icons for the summary line
    const toolIcons: Record<string, string> = {
      explore_revit_data: '🔍', search_schema: '📋', read_extension_methods: '📖',
    };
    const summaryNames = completedSteps.map(s =>
      toolIcons[s.tool_name] + ' ' + (s.tool_name === 'explore_revit_data' ? 'Explored' : s.tool_name === 'search_schema' ? 'Schema' : s.tool_name === 'read_extension_methods' ? 'Docs' : s.tool_name)
    );
    // Deduplicate summary names
    const uniqueNames = [...new Set(summaryNames)];

    return (
        <div className="space-y-3 w-full max-w-2xl">
          {/* ── Agent Activity (collapsible parent — like Claude Desktop) ── */}
          {completedSteps.length > 0 && (
          <details className="group bg-[var(--bg-panel)]/50 rounded-lg border border-[var(--border)]/50 overflow-hidden">
            <summary className="flex items-center justify-between px-3 py-2 cursor-pointer list-none hover:bg-[var(--bg-hover)]/30 transition-colors select-none">
              <div className="flex items-center gap-2 text-[11.5px] min-w-0">
                <span className="shrink-0">📋</span>
                <span className="font-semibold text-[var(--text-primary)]">
                  Agent activity · {completedSteps.length} step{completedSteps.length !== 1 ? 's' : ''}
                </span>
                <span className="text-[var(--text-secondary)] opacity-70 truncate">
                  — {uniqueNames.join(' · ')}
                </span>
              </div>
              <span className="text-[10px] text-[var(--text-secondary)] opacity-50 group-open:hidden ml-2 shrink-0">expand</span>
              <span className="text-[10px] text-[var(--text-secondary)] opacity-50 hidden group-open:inline ml-2 shrink-0">collapse</span>
            </summary>
            <div className="border-t border-[var(--border)]/30 px-3 py-2 space-y-1.5 text-[12px]">
              {completedSteps.map((step, i) => (
                <div key={i} className="flex items-start gap-2 py-1">
                  <span className="shrink-0 mt-0.5">{toolIcons[step.tool_name] || '⚙'}</span>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-[var(--text-primary)]">
                      {step.tool_name === 'explore_revit_data' ? 'Explored data' :
                       step.tool_name === 'search_schema' ? 'Searched schema' :
                       step.tool_name === 'read_extension_methods' ? 'Read docs' : step.tool_name}
                    </span>
                    <span className="text-[var(--text-secondary)] ml-1.5">{step.justification}</span>
                    {step.csharp_code && (
                      <details className="mt-1">
                        <summary className="text-[10px] text-[var(--text-secondary)] cursor-pointer hover:text-[var(--accent)] list-none">
                          ▶ code
                        </summary>
                        <div className="mt-1 bg-[var(--bg-card)] rounded overflow-x-auto p-2 text-[11px] font-mono whitespace-pre-wrap">
                          {step.csharp_code}
                        </div>
                      </details>
                    )}
                    {step.status === 'error' && (
                      <span className="text-[11px] text-[var(--danger)] ml-1.5">failed</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </details>
          )}

          {/* Show working indicator below activity while a new step runs */}
          {hasRunningStep && workingIndicator}
          {hasTextContent && (
          <div className="text-[13.5px] leading-relaxed break-words">
            <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              ul: ({node, ...props}) => <ul className="list-disc pl-5 my-2 space-y-1" {...props} />,
              ol: ({node, ...props}) => <ol className="list-decimal pl-5 my-2 space-y-1" {...props} />,
              li: ({node, ...props}) => <li className="pl-1" {...props} />,
              strong: ({node, ...props}) => <strong className="font-bold text-[var(--text-primary)]" {...props} />,
              em: ({node, ...props}) => <em className="italic opacity-90" {...props} />,
              p: ({node, ...props}) => <p className="mb-3 last:mb-0" {...props} />,
              a: ({node, ...props}) => <a className="text-[var(--accent)] hover:underline underline-offset-2" {...props} />,
              table: ({node, ...props}) => <div className="my-3 overflow-x-auto rounded-xl border border-[var(--border)]/30 shadow-sm"><table className="w-full border-collapse text-[12.5px]" {...props} /></div>,
              thead: ({node, ...props}) => <thead className="bg-[var(--bg-card)]" {...props} />,
              tbody: ({node, ...props}) => <tbody className="divide-y divide-[var(--border)]" {...props} />,
              tr: ({node, ...props}) => <tr className="even:bg-[var(--bg-hover)]/50" {...props} />,
              th: ({node, ...props}) => <th className="px-3 py-2 text-left text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider whitespace-nowrap" {...props} />,
              td: ({node, ...props}) => <td className="px-3 py-2 text-[var(--text-primary)] whitespace-nowrap border-l border-[var(--border)]/30 first:border-l-0" {...props} />,
              code: ({node, className, children, ...props}: any) => {
                const match = /language-(\w+)/.exec(className || '');
                const isInline = !match && !String(children).includes('\n');
                return isInline ? (
                  <code className="bg-[var(--bg-hover)] text-[var(--text-primary)] px-1.5 py-0.5 rounded text-[11px] font-mono border border-[var(--border)]/20" {...props}>
                    {children}
                  </code>
                ) : (
                  <div className="my-3 rounded-lg overflow-hidden border border-[var(--border)]/30 shadow-sm text-[12.5px] custom-scrollbar bg-[var(--bg-card)] code-viewer-override">
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
          )}
        </div>
    );
  };

  const isHuman = (msg: Message) => msg.type === 'human' && !msg.content?.toString().startsWith('System:');

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden relative font-sans">
      {/* ── HEADER ── */}
      <div className="flex-shrink-0 flex justify-between items-center px-4 h-12 bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-gray-700">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] flex-shrink-0" />
          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">Paracore Agent</span>
        </div>
        <button
          onClick={() => setIsClearChatModalOpen(true)}
          title="Clear Session"
          className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
        >
          <FontAwesomeIcon icon={faTrash} className="text-xs" />
        </button>
      </div>

      {/* ── MESSAGES CANAL ── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-6">
        {messages.filter(m => m.type !== 'tool' && !isHuman(m) && !(m.type === 'human' && typeof m.content === 'string' && m.content.startsWith('System:'))).length === 0 && Array.isArray(messages) && messages.filter(m => m.type === 'human' && !m.content?.toString().startsWith('System:')).length === 0 && (
            <div className="flex flex-col items-center justify-center h-full opacity-30 text-center space-y-4">
                <img src="/RAP.png" alt="Paracore" className="h-14 w-auto drop-shadow-md opacity-70 mb-2" />
                <p className="text-sm font-bold tracking-widest uppercase text-[var(--text-secondary)]">Awaiting Orders</p>
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
          // Hide avatar for placeholder messages that only have thinking steps
          const hasContent = typeof msg.content === 'string'
            ? msg.content.trim().length > 0
            : Array.isArray(msg.content) && msg.content.length > 0;
          const showAvatar = human || hasContent || (msg.tool_calls?.length || 0) > 0 || !!msg.plan;

          return (
            <div key={msg.id} className={`flex ${human ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              <div className={`flex max-w-[90%] lg:max-w-[80%] space-x-3 ${human ? 'flex-row-reverse space-x-reverse' : ''}`}>

                {/* Avatar / Icon */}
                {showAvatar && (
                <div className={`mt-1 w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${
                  human
                    ? 'bg-transparent text-[var(--text-secondary)] border-transparent opacity-50'
                    : 'bg-[var(--bg-panel)] border-[var(--border)]/30 text-[var(--accent)] shadow-sm'
                }`}>
                  {human ? (
                    <FontAwesomeIcon icon={faUser} size="sm" />
                  ) : (
                    <FontAwesomeIcon icon={faRobot} className="text-[var(--accent)]" />
                  )}
                </div>
                )}

                {/* Message Surface */}
                <div className={`
                    py-1.5 transition-all
                    ${human 
                        ? 'px-4 bg-[var(--bg-panel)] text-[var(--text-primary)] rounded-2xl rounded-tr-sm shadow-sm'
                        : 'text-[var(--text-primary)] max-w-full'
                    }
                `}>
                  {renderMessageContent(msg)}
                </div>

              </div>
            </div>
          );
        })}


        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* ── GROUNDED INPUT AREA ── */}
      <div className="px-4 py-2 bg-transparent z-20 max-w-4xl mx-auto w-full">
        <form 
          onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} 
          className="flex items-end space-x-3"
        >
          <div className="flex-1 bg-[var(--bg-panel)] rounded-2xl border border-[var(--border)]/30 focus-within:border-[var(--accent)]/50 transition-colors shadow-sm overflow-hidden flex items-center">
             <textarea
               ref={textareaRef}
               value={input}
               onChange={(e) => setInput(e.target.value)}
               onKeyDown={handleKeyDown}
               placeholder="What do you want to automate today?"
               className="w-full bg-transparent px-4 py-3 text-[13.5px] focus:outline-none text-[var(--text-primary)] placeholder-[var(--text-secondary)]/50 font-medium resize-none min-h-[44px] max-h-[250px] custom-scrollbar leading-relaxed"
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
        <div className="text-center mt-2 opacity-50 text-[10px] text-[var(--text-secondary)]">
          Shift+Enter for new line • Press Enter to send
        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={isClearChatModalOpen} onClose={() => setIsClearChatModalOpen(false)} title="Clear Session">
        <div className="p-6 text-center space-y-4">
          <p className="text-sm font-medium text-[var(--text-primary)] opacity-80">This will permanently delete your conversation history for this session. Continue?</p>
          <div className="flex justify-center space-x-3">
            <button onClick={() => setIsClearChatModalOpen(false)} className="px-6 py-2 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg font-bold text-[11px] uppercase tracking-widest">Cancel</button>
            <button onClick={handleClearChat} className="px-6 py-2 bg-danger text-white rounded-lg font-bold text-[11px] uppercase tracking-widest hover:opacity-90">Clear All</button>
          </div>
        </div>
      </Modal>


    </div>
  );
};
