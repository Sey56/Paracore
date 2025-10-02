import React from 'react';
import { StructuredOutputViewer } from './StructuredOutputViewer';
import type { ScriptExecutionResult } from "@/types/scriptModel";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faFileCsv } from '@fortawesome/free-solid-svg-icons';
import { useNotifications } from '@/hooks/useNotifications';

interface SummaryTabContentProps {
  executionResult: ScriptExecutionResult | null;
}

export const SummaryTabContent: React.FC<SummaryTabContentProps> = ({
  executionResult,
}) => {
  const { showNotification } = useNotifications();
  const hasOutput = executionResult?.showOutputData && executionResult.showOutputData.length > 0;

  const handleCopy = () => {
    if (!executionResult?.showOutputData) return;

    const tableDataItem = executionResult.showOutputData.find(item => item.type === 'table');

    if (tableDataItem) {
      try {
        const tableData = JSON.parse(tableDataItem.data);
        if (Array.isArray(tableData) && tableData.length > 0) {
          const headers = Object.keys(tableData[0]).join('\t');
          const rows = tableData.map(row => 
            Object.values(row).map(String).join('\t')
          );
          const textToCopy = [headers, ...rows].join('\n');
          navigator.clipboard.writeText(textToCopy);
          showNotification('Table data copied to clipboard.', 'success');
          return;
        }
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        showNotification(`Could not parse table data for copying: ${errorMessage}. Copying raw text.`, 'warning');
      }
    }

    // Fallback for non-table data or if table is empty or parsing fails
    const textToCopy = executionResult.showOutputData.map(item => item.data).join('\n\n');
    navigator.clipboard.writeText(textToCopy);
    showNotification('Raw output copied to clipboard.', 'info');
  };

  const handleExportCsv = async () => {
    if (!executionResult?.showOutputData) return;

    const tableDataItem = executionResult.showOutputData.find(item => item.type === 'table');

    if (tableDataItem) {
      try {
        const tableData = JSON.parse(tableDataItem.data);
        if (Array.isArray(tableData) && tableData.length > 0) {
          const headers = Object.keys(tableData[0]).join(',');
          const rows = tableData.map(row => 
            Object.values(row).map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')
          );
          const csvContent = [headers, ...rows].join('\n');

          // Export not available in this build. Please copy the CSV manually.
          showNotification('Export is not available in this build. Please copy the CSV manually.', 'warning');
          return;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        showNotification(`Failed to export CSV. Invalid table data: ${errorMessage}`, 'error');
        return;
      }
    }

    showNotification('No table data available to export.', 'warning');
  };

  return (
    <div className="tab-content py-4 flex flex-col h-full">
      <div className="flex-grow overflow-y-auto">
        {hasOutput && executionResult?.showOutputData ? (
          <div className="space-y-4">
            {executionResult.showOutputData.map((item, index) => (
              <StructuredOutputViewer key={index} item={item} />
            ))}
          </div>
        ) : (
          <p className="text-gray-600 dark:text-gray-400">
            No structured output available.
          </p>
        )}
      </div>
      {hasOutput && (
        <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <button
            title="Copy to Clipboard"
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 py-2 px-4 rounded-lg font-medium flex items-center"
            onClick={handleCopy}
          >
            <FontAwesomeIcon icon={faCopy} className="mr-2" />
            Copy
          </button>
          <button
            title="Export as CSV"
            className="bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 py-2 px-4 rounded-lg font-medium flex items-center"
            onClick={handleExportCsv}
          >
            <FontAwesomeIcon icon={faFileCsv} className="mr-2" />
            Export CSV
          </button>
        </div>
      )}
    </div>
  );
};



