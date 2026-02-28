import React from 'react';
import { StructuredOutputViewer } from './StructuredOutputViewer';
import type { ScriptExecutionResult } from "@/types/scriptModel";

interface TableTabContentProps {
  executionResult: ScriptExecutionResult | null;
}

export const TableTabContent: React.FC<TableTabContentProps> = ({
  executionResult,
}) => {
  const hasOutput = executionResult?.structuredOutput && executionResult.structuredOutput.length > 0;

  return (
    <div className="tab-content py-4 flex flex-col h-full overflow-hidden">
      <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
        {hasOutput && executionResult?.structuredOutput ? (
          <div className="space-y-6">
            {executionResult.structuredOutput.map((item, index) => (
              <StructuredOutputViewer
                key={`${executionResult.timestamp ?? 'last'}-${index}`}
                item={item}
              />
            ))}
          </div>
        ) : (
          <p className="text-gray-600 dark:text-gray-400 px-6">
            No structured output available.
          </p>
        )}
      </div>
    </div>
  );
};
