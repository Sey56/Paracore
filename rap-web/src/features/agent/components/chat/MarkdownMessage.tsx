import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy } from '@fortawesome/free-solid-svg-icons';
import { useTheme } from '@/context/ThemeContext';
import { useNotifications } from '@/hooks/useNotifications';
import { ThinkingStep } from '../../types/agentTypes';
import { ThinkingStepsSection } from './ThinkingStepsSection';
import { WorkingIndicator } from './WorkingIndicator';

interface MarkdownMessageProps {
  content: string;
  thinkingSteps: ThinkingStep[];
}

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content, thinkingSteps }) => {
  const { theme } = useTheme();
  const { showNotification } = useNotifications();
  const syntaxStyle = theme !== 'light' ? vscDarkPlus : vs;

  const hasTextContent = content.trim().length > 0;
  const completedSteps = thinkingSteps.filter(s => s.status !== 'running');
  const hasRunningStep = thinkingSteps.some(s => s.status === 'running');

  if (!thinkingSteps.length && !hasTextContent) return <WorkingIndicator />;
  if (hasRunningStep && completedSteps.length === 0 && !hasTextContent) return <WorkingIndicator />;

  return (
    <div className="space-y-3 w-full max-w-2xl">
      <ThinkingStepsSection steps={completedSteps} />
      {hasRunningStep && <WorkingIndicator />}
      {hasTextContent && (
        <div className="text-[13.5px] leading-relaxed break-words">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
            ul: ({ node, ...props }) => <ul className="list-disc pl-5 my-2 space-y-1" {...props} />,
            ol: ({ node, ...props }) => <ol className="list-decimal pl-5 my-2 space-y-1" {...props} />,
            li: ({ node, ...props }) => <li className="pl-1" {...props} />,
            strong: ({ node, ...props }) => <strong className="font-bold text-[var(--text-primary)]" {...props} />,
            em: ({ node, ...props }) => <em className="italic opacity-90" {...props} />,
            p: ({ node, ...props }) => <p className="mb-3 last:mb-0" {...props} />,
            a: ({ node, ...props }) => <a className="text-[var(--accent)] hover:underline underline-offset-2" {...props} />,
            table: ({ node, ...props }) => <div className="my-3 overflow-x-auto rounded-xl border border-[var(--border)]/30 shadow-sm"><table className="w-full border-collapse text-[12.5px]" {...props} /></div>,
            thead: ({ node, ...props }) => <thead className="bg-[var(--bg-card)]" {...props} />,
            tbody: ({ node, ...props }) => <tbody className="divide-y divide-[var(--border)]" {...props} />,
            tr: ({ node, ...props }) => <tr className="even:bg-[var(--bg-hover)]/50" {...props} />,
            th: ({ node, ...props }) => <th className="px-3 py-2 text-left text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider whitespace-nowrap" {...props} />,
            td: ({ node, ...props }) => <td className="px-3 py-2 text-[var(--text-primary)] whitespace-nowrap border-l border-[var(--border)]/30 first:border-l-0" {...props} />,
            code: ({ node, className, children, ...props }: any) => {
              const match = /language-(\w+)/.exec(className || '');
              const isInline = !match && !String(children).includes('\n');
              return isInline ? (
                <code className="bg-[var(--bg-hover)] text-[var(--text-primary)] px-1.5 py-0.5 rounded text-[11px] font-mono border border-[var(--border)]/20" {...props}>{children}</code>
              ) : (
                <div className="my-3 rounded-lg overflow-hidden border border-[var(--border)]/30 shadow-sm">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-card)] border-b border-[var(--border)]/20">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">{match ? match[1] : 'code'}</span>
                    <button onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(String(children).replace(/\n$/, '')); showNotification('Code copied!', 'success'); }}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors bg-[var(--bg-hover)] border border-[var(--border)]/30 hover:border-[var(--accent)] rounded-md">
                      <FontAwesomeIcon icon={faCopy} className="text-[9px]" /> Copy
                    </button>
                  </div>
                  <div className="overflow-x-auto custom-scrollbar text-[12.5px] leading-relaxed bg-[var(--bg-card)] code-viewer-override">
                    <SyntaxHighlighter key={theme} style={syntaxStyle as any} language={match ? match[1] : 'csharp'} PreTag="div"
                      customStyle={{ margin: 0, padding: '14px', backgroundColor: 'transparent',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}
                      codeTagProps={{ style: { fontFamily: 'inherit' } }} showLineNumbers wrapLines={true} {...props}>
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  </div>
                </div>
              );
            }
          }}>{content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
};
