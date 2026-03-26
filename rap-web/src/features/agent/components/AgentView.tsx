import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useUI } from '@/hooks/useUI';
import { useAuth } from '@/features/auth';
import api from '@/api/axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane, faRobot, faUser, faCheckCircle, faTimesCircle, faSpinner, faTrash, faSyncAlt } from '@fortawesome/free-solid-svg-icons';
import { useNotifications } from '@/hooks/useNotifications';
import { useScriptExecution } from '@/features/automation';
import { useScripts } from '@/features/automation';
import { filterVisibleParameters } from '@/utils/parameterVisibility';

import { Modal } from '@/components/common/Modal';
import { useRapServerUrl } from '@/hooks/useRapServerUrl';
import OrchestrationPlanCard from './OrchestrationPlanCard';
import { Script, ScriptParameter } from '@/types/scriptModel';
import { Message, ToolCall, OrchestrationPlan } from '../types/agentTypes';

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
  } = useUI();
  const [isClearChatModalOpen, setIsClearChatModalOpen] = useState(false);

  const { cloudToken } = useAuth();
  const { showNotification } = useNotifications();
  const { selectedScript, setSelectedScript, runScript, executionResult, clearExecutionResult, userEditedScriptParameters } = useScriptExecution();
  const { scripts, toolLibraryPath } = useScripts();
  const rapServerUrl = useRapServerUrl();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const agentRunTriggeredRef = useRef<boolean>(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
            // Activate console tab so user can see output when it runs
            setActiveInspectorTab('console');
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
            
            // Format output identically to C# execution result
            const rawOutputPayload = {
              structuredOutput: res.data.structured_output,
              output: res.data.output,
              internal_data: res.data.internal_data,
            };
            
            // Send back to agent
            invokeAgent(
               [{ type: 'human', content: `System: Raw REPL Execution Result JSON:\n${JSON.stringify(rawOutputPayload)}`, id: `system-${Date.now()}` }],
               { isInternal: true, summary: null, raw_output: rawOutputPayload }
            );

            // Switch to console or table to show user results
            if (res.data.structured_output && res.data.structured_output.some((o: any) => o.type === 'table')) {
                setActiveInspectorTab('table');
            } else {
                setActiveInspectorTab('console');
            }
            
        } catch (err) {
            console.error("Failed to run REPL snippet:", err);
            showNotification("Failed to run snippet in Revit", "error");
            invokeAgent([{ type: 'human', content: `System: Execution failed due to server error.`, id: `system-${Date.now()}` }]);
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
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const toolCall = msg.tool_calls[0];
      const { script_metadata, csharp_code, justification, ...displayArgs } = toolCall.args;
      
      const isDynamicQuery = toolCall.name === 'execute_dynamic_query';
      const isResolved = toolCall.id ? resolvedToolCallIds.has(toolCall.id) : false;

      return (
        <div className="space-y-4 my-2">
          {justification && (
              <div className="flex items-start space-x-2 opacity-80">
                  <div className="w-1 h-full min-h-[1.2em] bg-[var(--accent)] rounded-full shrink-0" />
                  <p className="text-[13px] italic leading-relaxed text-[var(--text-main)]">{justification as string}</p>
              </div>
          )}

          {isDynamicQuery && csharp_code && (
              <div className="bg-[var(--bg-ground)] rounded-xl border border-[var(--border-divider)] shadow-sm overflow-hidden relative group">
                  <div className="flex items-center justify-between px-3 py-2 bg-[var(--bg-group)] border-b border-[var(--border-divider)]">
                     <div className="flex items-center space-x-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                        <span className="text-[10px] font-black tracking-widest text-[var(--text-muted)] uppercase">Paracore Execution</span>
                     </div>
                     {isResolved && (
                        <div className="flex items-center space-x-1.5 bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">
                           <FontAwesomeIcon icon={faCheckCircle} className="text-[9px] text-green-500" />
                           <span className="text-[9px] font-black tracking-tighter text-green-500 uppercase">Executed</span>
                        </div>
                     )}
                  </div>
                  <pre className="text-[12px] font-mono text-[var(--text-main)] whitespace-pre-wrap leading-loose p-4 overflow-x-auto custom-scrollbar">{csharp_code as string}</pre>
              </div>
          )}

          {!isDynamicQuery && Object.keys(displayArgs).length > 0 && (
            <div className="bg-[var(--bg-ground)] p-3 rounded-lg border border-[var(--border-divider)] text-[10px] font-mono opacity-70 overflow-x-auto text-[var(--text-main)]">
              {JSON.stringify(displayArgs, null, 2)}
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
    return <div className="text-[13.5px] leading-relaxed break-words whitespace-pre-wrap">{content}</div>;
  };

  const isHuman = (msg: Message) => msg.type === 'human' && !msg.content?.toString().startsWith('System:');

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden relative font-sans">
      {/* ── GROUNDED HEADER ── */}
      <div className="flex-shrink-0 flex justify-between items-center px-4 py-3 bg-[var(--bg-panel)] border-b border-[var(--border-divider)] z-20">
        <div className="flex items-center space-x-3">
          <div className="w-1 h-4 bg-blue-600 dark:bg-blue-500 rounded-full" />
          <div className="flex items-baseline space-x-2">
            <h1 className="text-sm font-black text-[var(--text-main)] tracking-tight uppercase">Paracore Agent</h1>
            <span className="text-[10px] font-bold text-[var(--text-muted)] tracking-[0.1em]">STATIONED</span>
          </div>
          <div className="flex items-center space-x-1 ml-2">
             <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
             <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">Active</span>
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
                <FontAwesomeIcon icon={faRobot} size="3x" className="text-[var(--text-muted)]" />
                <p className="text-sm font-bold tracking-widest uppercase text-[var(--text-muted)]">Awaiting Orders</p>
            </div>
        )}

        {messages.filter(m => m.type !== 'tool' && !(m.type === 'human' && typeof m.content === 'string' && m.content.startsWith('System:'))).map((msg) => {
          const human = isHuman(msg);
          
          return (
            <div key={msg.id} className={`flex ${human ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              <div className={`flex max-w-[90%] lg:max-w-[80%] space-x-3 ${human ? 'flex-row-reverse space-x-reverse' : ''}`}>
                
                {/* Avatar / Icon */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-sm border ${
                  human 
                    ? 'bg-[var(--accent)] border-[var(--accent)] text-white' 
                    : 'bg-[var(--bg-card)] border-[var(--border-divider)] text-[var(--accent)]'
                }`}>
                  <FontAwesomeIcon icon={human ? faUser : faRobot} size="xs" />
                </div>

                {/* Message Surface */}
                <div className={`
                    px-4 py-3 rounded-xl border transition-all shadow-sm
                    ${human 
                        ? 'bg-[var(--bg-group)] border-[var(--accent)] text-[var(--text-main)] shadow-[inset_0_0_0_1px_var(--accent)]' 
                        : 'bg-[var(--bg-panel)] border-[var(--border-divider)] text-[var(--text-main)]'
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
              <FontAwesomeIcon icon={faRobot} size="xs" className="text-[var(--accent)] animate-pulse" />
            </div>
            <div className="px-5 py-3.5 bg-[var(--bg-panel)] rounded-xl border border-[var(--border-divider)] shadow-sm flex space-x-1.5 items-center">
              <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {/* Global PROCEED Button */}
        {activePendingToolCall && (
          <div className="flex justify-center pt-2 pb-6 space-x-4">
            <button
              onClick={() => {
                if (!activePendingToolCall) return;
                handleToolResponse(activePendingToolCall, 'approve');
              }}
              className="group flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg shadow-lg hover:shadow-blue-500/30 transition-all active:scale-95 animate-in fade-in slide-in-from-bottom-4 duration-500"
            >
              <FontAwesomeIcon icon={faCheckCircle} className="group-hover:scale-110 transition-transform" />
              <span className="font-black text-[11px] uppercase tracking-widest">{activePendingToolCall.name === 'execute_dynamic_query' ? 'Approve & Run' : 'Proceed'}</span>
            </button>
            <button
              onClick={() => {
                if (!activePendingToolCall) return;
                handleToolResponse(activePendingToolCall, 'reject');
              }}
              className="group flex items-center space-x-2 bg-[var(--bg-card)] border border-[var(--border-divider)] text-[var(--text-muted)] hover:text-red-500 hover:border-red-500/50 px-5 py-2.5 rounded-lg shadow-sm transition-all active:scale-95 animate-in fade-in slide-in-from-bottom-4 duration-500"
            >
              <FontAwesomeIcon icon={faTimesCircle} className="group-hover:scale-110 transition-transform" />
              <span className="font-black text-[11px] uppercase tracking-widest">Reject</span>
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── GROUNDED INPUT AREA ── */}
      <div className="p-4 bg-[var(--bg-panel)] border-t border-[var(--border-divider)] z-20">
        <form 
          onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} 
          className="flex items-center space-x-3 bg-[var(--bg-ground)] p-1.5 rounded-xl border border-[var(--border-divider)] focus-within:border-[var(--accent)] focus-within:ring-2 focus-within:ring-[var(--accent)]/20 transition-all shadow-inner"
        >
          <div className="pl-3 text-[var(--accent)] opacity-40 flex-shrink-0">
             <FontAwesomeIcon icon={faRobot} size="sm" />
          </div>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tell me what you want to automate or query..."
            className="flex-1 bg-transparent px-2 py-2 text-sm focus:outline-none text-[var(--text-main)] placeholder-[var(--text-muted)]/50 font-medium"
            disabled={isLoading}
          />
          <button 
            type="submit" 
            disabled={isLoading || !input.trim()} 
            className="w-10 h-10 shrink-0 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-400 transition-all disabled:opacity-30 flex items-center justify-center shadow-md active:scale-95"
          >
            <FontAwesomeIcon icon={faPaperPlane} className="text-xs" />
          </button>
        </form>
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
