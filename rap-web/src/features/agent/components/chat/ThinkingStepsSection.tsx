import React from 'react';
import { ThinkingStep } from '../../types/agentTypes';

const toolIcons: Record<string, string> = {
  explore_revit_data: '🔍', search_schema: '📋', read_extension_methods: '📖',
};

interface ThinkingStepsSectionProps {
  steps: ThinkingStep[];
}

export const ThinkingStepsSection: React.FC<ThinkingStepsSectionProps> = ({ steps }) => {
  if (steps.length === 0) return null;

  const summaryNames = steps.map(s =>
    toolIcons[s.tool_name] + ' ' +
    (s.tool_name === 'explore_revit_data' ? 'Explored' :
     s.tool_name === 'search_schema' ? 'Schema' :
     s.tool_name === 'read_extension_methods' ? 'Docs' : s.tool_name)
  );
  const uniqueNames = [...new Set(summaryNames)];

  return (
    <details className="group bg-[var(--bg-panel)]/50 rounded-lg border border-[var(--border)]/50 overflow-hidden">
      <summary className="flex items-center justify-between px-3 py-2 cursor-pointer list-none hover:bg-[var(--bg-hover)]/30 transition-colors select-none">
        <div className="flex items-center gap-2 text-[11.5px] min-w-0">
          <span className="shrink-0">📋</span>
          <span className="font-semibold text-[var(--text-primary)]">
            Agent activity · {steps.length} step{steps.length !== 1 ? 's' : ''}
          </span>
          <span className="text-[var(--text-secondary)] opacity-70 truncate">
            — {uniqueNames.join(' · ')}
          </span>
        </div>
        <span className="text-[10px] text-[var(--text-secondary)] opacity-50 group-open:hidden ml-2 shrink-0">expand</span>
        <span className="text-[10px] text-[var(--text-secondary)] opacity-50 hidden group-open:inline ml-2 shrink-0">collapse</span>
      </summary>
      <div className="border-t border-[var(--border)]/30 px-3 py-2 space-y-1.5 text-[12px]">
        {steps.map((step, i) => (
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
                  <summary className="text-[10px] text-[var(--text-secondary)] cursor-pointer hover:text-[var(--accent)] list-none">▶ code</summary>
                  <div className="mt-1 bg-[var(--bg-card)] rounded overflow-x-auto p-2 text-[11px] font-mono whitespace-pre-wrap">{step.csharp_code}</div>
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
  );
};
