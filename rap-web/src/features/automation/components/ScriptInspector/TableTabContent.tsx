import React, { useEffect } from 'react';
import { StructuredOutputViewer } from './StructuredOutputViewer';
import type { ExecutionResult } from "@/types/common";
import { Script } from "@/types/scriptModel";
import { useUI } from "@/hooks/useUI";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons';

interface TableTabContentProps {
  executionResult: ExecutionResult | null;
  capturedDocTitle: string | null;
  currentDocTitle: string | null;
  selectedScript: Script | null;
}

export const TableTabContent: React.FC<TableTabContentProps> = React.memo(({
  executionResult,
  capturedDocTitle,
  currentDocTitle,
  selectedScript,
}) => {
  const items = executionResult?.structuredOutput;
  const { activeAnalyticsSubTabIndex, setActiveAnalyticsSubTabIndex } = useUI();

  // Reset tab index when new execution results arrive
  useEffect(() => {
    setActiveAnalyticsSubTabIndex(0);
  }, [executionResult?.timestamp, setActiveAnalyticsSubTabIndex]);

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

  const isMultiView = items.length > 1;

  return (
    <div className="tab-content h-full flex flex-col w-full min-w-0 overflow-hidden relative group">
      {/* Main Content Area */}
      <div className="flex-grow flex flex-col w-full min-w-0 overflow-hidden">
        {items[activeAnalyticsSubTabIndex] ? (
          <StructuredOutputViewer 
            item={items[activeAnalyticsSubTabIndex]} 
            isDashboard={false} 
            capturedDocTitle={capturedDocTitle}
            currentDocTitle={currentDocTitle}
            selectedScript={selectedScript}
            executionResult={executionResult}
          />
        ) : (
          <StructuredOutputViewer 
            item={items[0]} 
            isDashboard={false} 
            capturedDocTitle={capturedDocTitle}
            currentDocTitle={currentDocTitle}
            selectedScript={selectedScript}
            executionResult={executionResult}
          />
        )}
      </div>
    </div>
  );
});

TableTabContent.displayName = 'TableTabContent';
