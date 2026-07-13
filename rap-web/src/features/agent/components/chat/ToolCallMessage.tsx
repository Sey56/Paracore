import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRobot, faCheckCircle, faTimesCircle, faCopy } from '@fortawesome/free-solid-svg-icons';
import { ToolCall } from '../../types/agentTypes';
import { ThinkingStepsSection } from './ThinkingStepsSection';
import { useNotifications } from '@/hooks/useNotifications';
import { useTheme } from '@/context/ThemeContext';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ThinkingStep } from '../../types/agentTypes';

interface ToolCallMessageProps {
  toolCall: ToolCall;
  thinkingSteps: ThinkingStep[];
  isResolved: boolean;
  isRejected: boolean;
  isStale: boolean;
  onApprove: () => void;
  onReject: () => void;
}

export const ToolCallMessage: React.FC<ToolCallMessageProps> = ({
  toolCall, thinkingSteps, isResolved, isRejected, isStale, onApprove, onReject,
}) => {
  const { showNotification } = useNotifications();
  const { theme } = useTheme();
  const syntaxStyle = theme !== 'light' ? vscDarkPlus : vs;

  const { script_metadata, csharp_code, justification, ...displayArgs } = toolCall.args;
  const completedSteps = thinkingSteps.filter(s => s.status !== 'running' && s.tool_name !== '__pending__');

  const statusBadge = isRejected ? (
    <div className="flex items-center space-x-1.5 bg-[var(--danger-muted)] px-2.5 py-1 rounded-md border border-[var(--danger)]/20 shrink-0 ml-4">
      <FontAwesomeIcon icon={faTimesCircle} className="text-[10px] text-[var(--danger)]" />
      <span className="text-[10px] font-bold tracking-wide text-[var(--danger)] uppercase">Rejected</span>
    </div>
  ) : isResolved ? (
    <div className="flex items-center space-x-2 shrink-0 ml-4">
      <div className="flex items-center space-x-1.5 bg-[var(--success-muted)] px-2.5 py-1 rounded-md border border-[var(--success)]/20">
        <FontAwesomeIcon icon={faCheckCircle} className="text-[10px] text-[var(--success)]" />
        <span className="text-[10px] font-bold tracking-wide text-green-500 uppercase">Executed</span>
      </div>
      <CopyButton onClick={() => { navigator.clipboard.writeText(csharp_code as string); showNotification("Code copied!", "success"); }} />
    </div>
  ) : isStale ? (
    <div className="flex items-center space-x-2 shrink-0 ml-4">
      <div className="flex items-center space-x-1.5 bg-gray-100 dark:bg-gray-700/30 px-2.5 py-1 rounded-md border border-gray-300/50 dark:border-gray-600/50">
        <span className="text-[10px] font-bold tracking-wide text-gray-400 dark:text-gray-500 uppercase">Skipped</span>
      </div>
      <CopyButton onClick={() => { navigator.clipboard.writeText(csharp_code as string); showNotification("Code copied!", "success"); }} />
    </div>
  ) : (
    <div className="flex items-center space-x-2 shrink-0 ml-4">
      <button onClick={onReject} className="px-3 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--danger)] transition-colors bg-transparent border border-transparent hover:border-[var(--danger)]/20 rounded-md">Reject</button>
      <CopyButton onClick={() => { navigator.clipboard.writeText(csharp_code as string); showNotification("Code copied!", "success"); }} />
      <button onClick={onApprove} className="px-3 py-1.5 text-[11px] font-bold text-white bg-[var(--accent)] hover:bg-[var(--accent-hover)] transition-colors rounded-md shadow-sm">Approve & Run</button>
    </div>
  );

  return (
    <div className="space-y-3 w-full max-w-2xl">
      <ThinkingStepsSection steps={completedSteps} />

      {justification && (
        <div className="text-[13.5px] leading-relaxed break-words whitespace-pre-wrap -mt-0.5">{justification as string}</div>
      )}

      {csharp_code ? (
        <div className="bg-[var(--bg-panel)] rounded-xl border border-[var(--border)]/30 shadow-sm overflow-hidden mt-2 min-w-0 w-full">
          <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-card)] border-b border-[var(--border)]/30">
            <div className="flex items-center space-x-2 shrink-0">
              <FontAwesomeIcon icon={faRobot} className="text-[var(--accent)] text-[14px]" />
              <span className="text-[12px] font-medium text-[var(--text-primary)]">Action Proposed</span>
            </div>
            {statusBadge}
          </div>
          <details className="group w-full overflow-hidden [contain:inline-size]">
            <summary className="px-4 py-2.5 text-[11px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider cursor-pointer hover:bg-[var(--bg-hover)] transition-colors list-none flex items-center select-none">
              <span className="mr-2 opacity-50 group-open:rotate-90 transition-transform">▶</span> View Source Code
            </summary>
            <div className="border-t border-[var(--border)]/50 bg-[var(--bg-card)] overflow-x-auto custom-scrollbar text-[12.5px] leading-relaxed code-viewer-override">
              <SyntaxHighlighter key={theme} style={syntaxStyle as any} language="csharp" PreTag="div"
                customStyle={{ margin: 0, padding: '16px', backgroundColor: 'transparent', wordBreak: 'break-word',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}
                codeTagProps={{ style: { fontFamily: 'inherit' } }} wrapLines={true}>
                {String(csharp_code).replace(/\n$/, '')}
              </SyntaxHighlighter>
            </div>
          </details>
        </div>
      ) : Object.keys(displayArgs).length > 0 && (
        <div className="bg-[var(--bg-panel)] rounded-xl border border-[var(--border)]/30 shadow-sm overflow-hidden mt-2 min-w-0 w-full">
          <div className="flex items-center justify-between px-4 py-3 bg-[var(--bg-card)] border-b border-[var(--border)]/30">
            <div className="flex items-center space-x-2 shrink-0">
              <FontAwesomeIcon icon={faRobot} className="text-[var(--accent)] text-[14px]" />
              <span className="text-[12px] font-medium text-[var(--text-primary)]">Tool Invoked: {toolCall.name}</span>
            </div>
            {statusBadge}
          </div>
          <div className="p-4 text-[11px] font-mono opacity-80 overflow-x-auto text-[var(--text-primary)]">
            {JSON.stringify(displayArgs, null, 2)}
          </div>
        </div>
      )}
    </div>
  );
};

const CopyButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button onClick={(e) => { e.stopPropagation(); onClick(); }}
    className="px-3 py-1.5 text-[11px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors bg-[var(--bg-hover)] border border-[var(--border)] hover:border-[var(--accent)] rounded-md shadow-sm">
    <FontAwesomeIcon icon={faCopy} className="mr-1.5" /> Copy
  </button>
);
