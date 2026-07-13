import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faRobot } from '@fortawesome/free-solid-svg-icons';
import { Message, ToolCall, OrchestrationPlan, ThinkingStep } from '../../types/agentTypes';
import { ToolCallMessage } from './ToolCallMessage';
import { MarkdownMessage } from './MarkdownMessage';
import { WorkingIndicator } from './WorkingIndicator';
import { Script } from '@/types/scriptModel';
import OrchestrationPlanCard from '../OrchestrationPlanCard';

interface MessageBubbleProps {
  msg: Message;
  isHuman: boolean;
  resolvedToolCallIds: Set<string>;
  rejectedToolCallIds: Set<string>;
  staleToolCallIds: Set<string>;
  onApprove: (tc: ToolCall) => void;
  onReject: (tc: ToolCall) => void;
  // Plan props
  activePlan: OrchestrationPlan | null;
  onExecutePlan: (plan: OrchestrationPlan) => void;
  onSwitchTab: (tab: any) => void;
  onCompute: (stepIdx: number, paramName: string) => void;
  onUpdateParameter: (stepIdx: number, paramName: string, value: any) => void;
  scripts: Script[];
  messages: Message[];
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  msg, isHuman, resolvedToolCallIds, rejectedToolCallIds, staleToolCallIds,
  onApprove, onReject, activePlan, onExecutePlan, onSwitchTab, onCompute, onUpdateParameter, scripts, messages,
}) => {
  const hasContent = typeof msg.content === 'string'
    ? msg.content.trim().length > 0
    : Array.isArray(msg.content) && msg.content.length > 0;
  const showAvatar = isHuman || hasContent || (msg.tool_calls?.length || 0) > 0 || !!msg.plan;

  return (
    <div key={msg.id} className={`flex ${isHuman ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div className={`flex max-w-[90%] lg:max-w-[80%] space-x-3 ${isHuman ? 'flex-row-reverse space-x-reverse' : ''}`}>
        {showAvatar && (
          <div className={`mt-1 w-7 h-7 rounded-full flex items-center justify-center shrink-0 border ${
            isHuman ? 'bg-transparent text-[var(--text-secondary)] border-transparent opacity-50' : 'bg-[var(--bg-panel)] border-[var(--border)]/30 text-[var(--accent)] shadow-sm'
          }`}>
            {isHuman ? <FontAwesomeIcon icon={faUser} size="sm" /> : <FontAwesomeIcon icon={faRobot} className="text-[var(--accent)]" />}
          </div>
        )}
        <div className={`py-1.5 transition-all ${isHuman ? 'px-4 bg-[var(--bg-panel)] text-[var(--text-primary)] rounded-2xl rounded-tr-sm shadow-sm' : 'text-[var(--text-primary)] max-w-full'}`}>
          {renderContent(msg, resolvedToolCallIds, rejectedToolCallIds, staleToolCallIds, onApprove, onReject, activePlan, onExecutePlan, onSwitchTab, onCompute, onUpdateParameter, scripts, messages)}
        </div>
      </div>
    </div>
  );
};

function renderContent(
  msg: Message,
  resolvedToolCallIds: Set<string>,
  rejectedToolCallIds: Set<string>,
  staleToolCallIds: Set<string>,
  onApprove: (tc: ToolCall) => void,
  onReject: (tc: ToolCall) => void,
  activePlan: OrchestrationPlan | null,
  onExecutePlan: (plan: OrchestrationPlan) => void,
  onSwitchTab: (tab: any) => void,
  onCompute: (stepIdx: number, paramName: string) => void,
  onUpdateParameter: (stepIdx: number, paramName: string, value: any) => void,
  scripts: Script[],
  messages: Message[],
) {
  // Error tool messages
  if (msg.type === 'tool' && typeof msg.content === 'string') {
    const c = msg.content;
    if (c.startsWith('ERROR:') || c.startsWith('**Execution Failed')) {
      return (
        <div className="text-[12.5px] leading-relaxed break-words">
          <div className="font-bold text-[var(--danger)]">{c}</div>
        </div>
      );
    }
  }

  // Tool call messages
  if (msg.tool_calls && msg.tool_calls.length > 0) {
    const tc = msg.tool_calls[0];
    return (
      <ToolCallMessage
        toolCall={tc}
        thinkingSteps={msg.thinking_steps || []}
        isResolved={tc.id ? resolvedToolCallIds.has(tc.id) : false}
        isRejected={tc.id ? rejectedToolCallIds.has(tc.id) : false}
        isStale={tc.id ? staleToolCallIds.has(tc.id) : false}
        onApprove={() => onApprove(tc)}
        onReject={() => onReject(tc)}
      />
    );
  }

  // Plan messages
  if (msg.plan) {
    const isExecuting = activePlan === msg.plan;
    return (
      <div className="space-y-2">
        <p className="whitespace-pre-wrap">
          {typeof msg.content === 'string' ? msg.content : Array.isArray(msg.content) ? (msg.content as { text: string }[]).map(i => i.text).join('\n') : ''}
        </p>
        <OrchestrationPlanCard
          plan={msg.plan}
          isPending={messages[messages.length - 1].id === msg.id && !isExecuting}
          onExecute={() => { if (msg.plan) onExecutePlan(msg.plan); }}
          onSwitchTab={onSwitchTab}
          onCompute={(stepIdx, paramName) => {
            const step = msg.plan?.steps[stepIdx];
            if (!step) return;
            const localScript = scripts.find(s => s.id.toLowerCase().endsWith(step.script_id.replace('.cs', '').toLowerCase()));
            if (localScript) { onCompute(stepIdx, paramName); }
          }}
          onUpdateParameter={onUpdateParameter}
        />
      </div>
    );
  }

  // Standard content
  const content = typeof msg.content === 'string' ? msg.content : Array.isArray(msg.content) ? (msg.content as { text: string }[]).map(i => i.text).join('\n') : '';
  return <MarkdownMessage content={content} thinkingSteps={msg.thinking_steps || []} />;
}
