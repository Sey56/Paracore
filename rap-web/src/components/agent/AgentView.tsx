import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useUI } from '@/hooks/useUI';
import { useAuth } from '@/hooks/useAuth';
import api from '@/api/axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane, faRobot, faUser, faCheckCircle, faTimesCircle, faSpinner, faTrash, faSyncAlt } from '@fortawesome/free-solid-svg-icons';
import { useNotifications } from '@/hooks/useNotifications';
import { useScriptExecution } from '@/hooks/useScriptExecution';
import { useScripts } from '@/hooks/useScripts';
import { filterVisibleParameters } from '@/utils/parameterVisibility';

import type { Message, ToolCall, OrchestrationPlan } from '@/context/providers/UIContext';
import { Modal } from '@/components/common/Modal';
import WorkingSetPanel from './WorkingSetPanel';
import { useRapServerUrl } from '@/hooks/useRapServerUrl';
import OrchestrationPlanCard from './OrchestrationPlanCard';
import { Script, ScriptParameter } from '@/types/scriptModel';

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
  const [workingSet, setWorkingSet] = useState<Record<string, number[]>>({});

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
        }, {} as Record<string, string | number | boolean>) : undefined;

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
      if (response.data.working_set) setWorkingSet(response.data.working_set);

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
  }, [threadId, toolLibraryPath, cloudToken, setMessages, setThreadId, showNotification, selectedScript, userEditedScriptParameters, setSelectedScript, clearExecutionResult, setActiveInspectorTab, rapServerUrl, scripts, messages]);

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

  const handleToolResponse = (toolCall: ToolCall, userDecision: 'approve' | 'reject') => {
    const isScriptRun = toolCall.name.startsWith('run_');
    const parameters = isScriptRun ?
      (toolCall.name === 'run_script_by_name' ? toolCall.args.parameters : toolCall.args) :
      {};

    const toolMessageContent = {
      user_decision: userDecision,
      parameters: userDecision === 'approve' ? parameters : {},
    };

    setMessages(prev => [...prev, {
      type: 'tool',
      content: JSON.stringify(toolMessageContent),
      tool_call_id: toolCall.id,
    }]);

    if (isScriptRun && userDecision === 'approve') {
      if (selectedScript) {
        agentRunTriggeredRef.current = true;
        const currentParamsArray = userEditedScriptParameters[selectedScript.id] || [];
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
    } else if (userDecision === 'reject') {
      invokeAgent([{ type: 'human', content: `I have rejected the action.`, id: `user-${Date.now()}` }]);
    }
  };

  const handleClearChat = useCallback(() => {
    setMessages([]);
    setThreadId(null);
    setWorkingSet({});
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

  const renderMessageContent = (msg: Message) => {
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const toolCall = msg.tool_calls[0];
      const { script_metadata, ...displayArgs } = toolCall.args;

      return (
        <div className="space-y-2">
          <p className="font-semibold text-xs uppercase tracking-wider opacity-60">Action: {toolCall.name}</p>
          {Object.keys(displayArgs).length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-800/50 p-2 rounded border border-gray-100 dark:border-gray-700 text-[10px] font-mono opacity-80 overflow-x-auto">
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
    return <p className="whitespace-pre-wrap leading-relaxed">{content}</p>;
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h2 className="text-lg font-bold text-gray-800 dark:text-white">Paracore Agent</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">Powered by CoreScript.Engine</p>
        </div>
        <div className="flex space-x-2">
          <button onClick={() => setIsClearChatModalOpen(true)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-all">
            <FontAwesomeIcon icon={faTrash} size="sm" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-6">
        {messages.filter(m => m.type !== 'tool').map((msg) => (
          <div key={msg.id} className={`flex ${msg.type === 'human' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex max-w-[85%] space-x-3 ${msg.type === 'human' ? 'flex-row-reverse space-x-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${msg.type === 'human' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
                <FontAwesomeIcon icon={msg.type === 'human' ? faUser : faRobot} size="xs" />
              </div>
              <div className={`p-4 rounded-2xl shadow-sm text-sm ${msg.type === 'human' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-tl-none border border-gray-100 dark:border-gray-700'}`}>
                {typeof msg.content === 'string'
                  ? renderMessageContent(msg)
                  : Array.isArray(msg.content)
                    ? msg.content.map((i, idx) => <p key={idx}>{i.text}</p>)
                    : renderMessageContent(msg)}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start items-center space-x-3 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center">
              <FontAwesomeIcon icon={faRobot} size="xs" className="text-gray-400" />
            </div>
            <div className="p-4 bg-white dark:bg-gray-800 rounded-2xl rounded-tl-none border border-gray-100 dark:border-gray-700 flex space-x-1">
              <span className="w-1.5 h-1.5 bg-gray-300 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-gray-300 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-gray-300 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {/* Global PROCEED Button */}
        {activePendingToolCall && (
          <div className="flex justify-center pt-2">
            <button
              onClick={() => {
                if (!activePendingToolCall) return;
                handleToolResponse(activePendingToolCall, 'approve');
              }}
              className="group flex items-center space-x-3 bg-blue-600 hover:bg-blue-700 text-white px-12 py-4 rounded-full shadow-2xl hover:shadow-blue-500/40 transition-all active:scale-95 animate-in fade-in slide-in-from-bottom-4 duration-500 ring-4 ring-white dark:ring-gray-800"
            >
              <FontAwesomeIcon icon={faCheckCircle} className="group-hover:scale-125 transition-transform text-lg" />
              <span className="font-bold text-base tracking-tight italic">Proceed with {selectedScript?.name || 'Action'}</span>
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-6 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex space-x-3 bg-gray-50 dark:bg-gray-700/50 p-1 rounded-xl border border-gray-200 dark:border-gray-600 focus-within:ring-2 focus-within:ring-blue-500/50 transition-all">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Tell me what you want to automate in Revit..."
            className="flex-1 bg-transparent px-4 py-2.5 text-sm focus:outline-none dark:text-white"
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading || !input.trim()} className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 shadow-sm">
            <FontAwesomeIcon icon={faPaperPlane} size="sm" />
          </button>
        </form>
      </div>

      {/* Modals */}
      <Modal isOpen={isClearChatModalOpen} onClose={() => setIsClearChatModalOpen(false)} title="Clear History">
        <div className="p-6 text-center space-y-4">
          <p className="text-gray-600 dark:text-gray-400">This will permanently delete your conversation history. Continue?</p>
          <div className="flex justify-center space-x-3">
            <button onClick={() => setIsClearChatModalOpen(false)} className="px-6 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg font-medium text-sm">Cancel</button>
            <button onClick={handleClearChat} className="px-6 py-2 bg-red-600 text-white rounded-lg font-medium text-sm hover:bg-red-700">Clear All</button>
          </div>
        </div>
      </Modal>

      <WorkingSetPanel workingSet={workingSet} />
    </div>
  );
};
