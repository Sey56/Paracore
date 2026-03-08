import React from 'react';
import { StructuredOutputViewer } from './StructuredOutputViewer';
import type { ScriptExecutionResult } from "@/types/scriptModel";

interface TableTabContentProps {
  executionResult: ScriptExecutionResult | null;
}

export const TableTabContent: React.FC<TableTabContentProps> = ({
  executionResult,
}) => {
  const items = executionResult?.structuredOutput;
  const hasOutput = items && items.length > 0;

  if (!hasOutput || !items) {
    return (
      <div className="tab-content py-2 h-full flex flex-col w-full min-w-0">
        <div className="flex-grow flex flex-col w-full min-w-0 overflow-hidden px-2">
          <p className="text-slate-600 dark:text-slate-400 px-6">
            No structured output available.
          </p>
        </div>
      </div>
    );
  }

  // Single-table, no charts — original rock-solid layout, completely untouched
  const isSingleTable = items.length === 1 && items[0].type === 'table';

  if (isSingleTable) {
    return (
      <div className="tab-content py-2 h-full flex flex-col w-full min-w-0">
        <div className="flex-grow flex flex-col w-full min-w-0 overflow-hidden px-2">
          <StructuredOutputViewer item={items[0]} />
        </div>
      </div>
    );
  }

  // Dashboard mode — scrollable container for charts + table
  return (
    <div className="tab-content py-2 h-full flex flex-col w-full min-w-0 overflow-hidden">
      <div className="flex-grow w-full min-w-0 overflow-y-auto px-2 custom-scrollbar">
        <div className="space-y-6 pb-6">
          {items.map((item, index) => (
            <StructuredOutputViewer
              key={`${executionResult.timestamp ?? 'last'}-${index}`}
              item={item}
              isDashboard
            />
          ))}
        </div>
      </div>
    </div>
  );
};
