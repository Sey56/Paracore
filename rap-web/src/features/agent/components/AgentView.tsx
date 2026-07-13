import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '@/features/auth';
import { useUI } from '@/hooks/useUI';
import { useScripts } from '@/features/automation';
import { useScriptExecution } from '@/features/automation';
import { Modal } from '@/components/common/Modal';
import { Message, ToolCall, OrchestrationPlan } from '../types/agentTypes';

import { useSessionManager } from '../hooks/useSessionManager';
import { useStreamingChat } from '../hooks/useStreamingChat';
import { useToolExecution } from '../hooks/useToolExecution';
import { SessionHeader } from './SessionHeader';
import { ChatInput } from './ChatInput';
import { MessageBubble } from './chat/MessageBubble';

export const AgentView: React.FC = () => {
  const {
    activeScriptSource, setActiveInspectorTab,
    setAgentReplResults, setAgentCapturedDocTitle,
  } = useUI();

  const { isEnterprise } = useAuth();
  const { selectedScript, userEditedScriptParameters, setSelectedScript } = useScriptExecution();
  const { scripts, toolLibraryPath } = useScripts();

  // Session management
  const session = useSessionManager();
  const {
    sessions, activeSessionId, activeSession,
    messages, setMessages, threadId, setThreadId,
    cumulativeUsage, setCumulativeUsage,
    handleNewSession, handleSwitchSession, handleDeleteSession,
  } = session;

  // Streaming chat
  const { invokeAgent, abortRef } = useStreamingChat({
    threadId, setThreadId, setMessages, setCumulativeUsage,
    selectedScript, userEditedScriptParameters, toolLibraryPath, scripts,
  });

  // Tool execution + plan orchestration
  const { handleToolResponse, executePlanStep, activePlan, setActivePlan, currentPlanStepIndex, setCurrentPlanStepIndex } = useToolExecution({
    messages, setMessages, threadId, invokeAgent: (msgs: Message[], newMsgs: Message[], opts?: any) => invokeAgent(msgs, newMsgs, opts),
  });

  // Input state
  const [input, setInput] = useState('');
  const [isDeleteSessionModalOpen, setIsDeleteSessionModalOpen] = useState(false);

  // Abort on unmount
  useEffect(() => {
    return () => { if (abortRef.current) abortRef.current.abort(); };
  }, []);

  // Auto-scroll
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = (text: string) => {
    if (!text.trim()) return;
    invokeAgent(messages, [{ type: 'human', content: text, id: `user-${Date.now()}` }]);
    setInput('');
  };

  // Derived tool call state
  const resolvedToolCallIds = useMemo(() =>
    new Set(messages.filter(m => m.type === 'tool').map(m => m.tool_call_id).filter(Boolean) as string[]), [messages]);

  const rejectedToolCallIds = useMemo(() =>
    new Set(messages.filter(m => m.type === 'tool' && typeof m.content === 'string' && m.content.startsWith('REJECTED')).map(m => m.tool_call_id).filter(Boolean) as string[]), [messages]);

  const staleToolCallIds = useMemo(() => {
    const stale = new Set<string>();
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.type === 'ai' && msg.tool_calls) {
        const hasSubsequentHuman = messages.slice(i + 1).some(m => m.type === 'human' && !m.content?.toString().startsWith('System:'));
        if (hasSubsequentHuman) {
          for (const tc of msg.tool_calls) if (tc.id) stale.add(tc.id);
        }
      }
    }
    return stale;
  }, [messages]);

  const isHuman = (msg: Message) => msg.type === 'human' && !msg.content?.toString().startsWith('System:');

  const visibleMessages = messages.filter(m => {
    if (m.type === 'tool') {
      const c = typeof m.content === 'string' ? m.content : '';
      return c.startsWith('ERROR:') || c.startsWith('**Execution Failed');
    }
    if (m.type === 'human' && typeof m.content === 'string' && m.content.startsWith('System:')) return false;
    return true;
  });

  const hasAnyHumanMessages = messages.some(m => m.type === 'human' && !m.content?.toString().startsWith('System:'));

  return (
    <div className="flex flex-col h-full bg-transparent overflow-hidden relative font-sans">
      <SessionHeader
        sessions={sessions} activeSessionId={activeSessionId} activeSession={activeSession}
        cumulativeUsage={cumulativeUsage}
        onNewSession={handleNewSession} onSwitchSession={handleSwitchSession}
        onDeleteSession={handleDeleteSession}
        onOpenDeleteModal={() => setIsDeleteSessionModalOpen(true)}
      />

      <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4 space-y-6">
        {!hasAnyHumanMessages && (
          <div className="flex flex-col items-center justify-center h-full opacity-30 text-center space-y-4">
            <img src="/RAP.png" alt="Paracore" className="h-14 w-auto drop-shadow-md opacity-70 mb-2" />
            <p className="text-sm font-bold tracking-widest uppercase text-[var(--text-secondary)]">Awaiting Orders</p>
          </div>
        )}

        {visibleMessages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isHuman={isHuman(msg)}
            resolvedToolCallIds={resolvedToolCallIds}
            rejectedToolCallIds={rejectedToolCallIds}
            staleToolCallIds={staleToolCallIds}
            onApprove={(tc) => handleToolResponse(tc, 'approve')}
            onReject={(tc) => handleToolResponse(tc, 'reject')}
            activePlan={activePlan}
            onExecutePlan={(plan) => { setActivePlan(plan); setCurrentPlanStepIndex(0); executePlanStep(plan, 0); }}
            onSwitchTab={setActiveInspectorTab}
            onCompute={(stepIdx, paramName) => {
              const planMsgs = messages.filter(m => m.plan);
              const planMsg = planMsgs[planMsgs.length - 1];
              if (planMsg?.plan) {
                const step = planMsg.plan.steps[stepIdx];
                if (step) {
                  const localScript = scripts.find(s => s.id.toLowerCase().endsWith(step.script_id.replace('.cs', '').toLowerCase()));
                  if (localScript) { setSelectedScript(localScript, 'agent'); setActiveInspectorTab('parameters'); }
                }
              }
            }}
            onUpdateParameter={(stepIdx, paramName, value) => {
              setMessages(prev => prev.map(m => {
                if (m.plan) {
                  const newSteps = [...m.plan.steps];
                  newSteps[stepIdx] = {
                    ...newSteps[stepIdx],
                    deduced_parameters: { ...newSteps[stepIdx].deduced_parameters, [paramName]: value },
                    satisfied_parameters: Array.from(new Set([...newSteps[stepIdx].satisfied_parameters, paramName])),
                    missing_parameters: newSteps[stepIdx].missing_parameters.filter((p: string) => p !== paramName)
                  };
                  return { ...m, plan: { ...m.plan, steps: newSteps } };
                }
                return m;
              }));
            }}
            scripts={scripts}
            messages={messages}
          />
        ))}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      <ChatInput input={input} setInput={setInput} onSend={() => sendMessage(input)} />

      <Modal isOpen={isDeleteSessionModalOpen} onClose={() => setIsDeleteSessionModalOpen(false)}
        title={sessions.length > 1 ? 'Delete Session' : 'Clear Chat'}>
        <div className="p-6 text-center space-y-4">
          <p className="text-sm font-medium text-[var(--text-primary)] opacity-80">
            {sessions.length > 1 ? 'This will permanently delete this session and all its messages. Continue?' : 'This will clear all messages in the current chat. Continue?'}
          </p>
          <div className="flex justify-center space-x-3">
            <button onClick={() => setIsDeleteSessionModalOpen(false)}
              className="px-6 py-2 bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg font-bold text-[11px] uppercase tracking-widest">Cancel</button>
            <button onClick={() => { setIsDeleteSessionModalOpen(false); handleDeleteSession(activeSessionId); }}
              className="px-6 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-bold text-[11px] uppercase tracking-widest">
              {sessions.length > 1 ? 'Delete' : 'Clear'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
