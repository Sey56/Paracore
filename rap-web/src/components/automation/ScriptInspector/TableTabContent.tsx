import React from 'react';
import { StructuredOutputViewer } from './StructuredOutputViewer';
import type { ScriptExecutionResult } from "@/types/scriptModel";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faFileCsv } from '@fortawesome/free-solid-svg-icons';
import { useNotifications } from '@/hooks/useNotifications';
import { save } from '@tauri-apps/api/dialog';
import { writeTextFile } from '@tauri-apps/api/fs';

interface TableTabContentProps {
  executionResult: ScriptExecutionResult | null;
}

export const TableTabContent: React.FC<TableTabContentProps> = ({
  executionResult,
}) => {
  const { showNotification } = useNotifications();
  const hasOutput = executionResult?.structuredOutput && executionResult.structuredOutput.length > 0;

  const handleCopy = () => {
    if (!executionResult?.structuredOutput) return;

    const tableDataItem = executionResult.structuredOutput.find(item => item.type === 'table');

    if (tableDataItem) {
      try {
        let tableData = JSON.parse(tableDataItem.data);

        if (!Array.isArray(tableData) && typeof tableData === 'object' && tableData !== null) {
          tableData = [tableData];
        }

        if (Array.isArray(tableData) && tableData.length > 0) {
          const headers = Object.keys(tableData[0]).join('\t');
          const rows = tableData.map((row: Record<string, unknown>) =>
            Object.values(row).map(v => String(v ?? '')).join('\t')
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

    const textToCopy = executionResult.structuredOutput.map(item => item.data).join('\n\n');
    navigator.clipboard.writeText(textToCopy);
    showNotification('Raw output copied to clipboard.', 'info');
  };

  const handleExportCsv = async () => {
    if (!executionResult?.structuredOutput) return;

    const tableDataItem = executionResult.structuredOutput.find(item => item.type === 'table');

    if (tableDataItem) {
      try {
        let tableData = JSON.parse(tableDataItem.data);

        if (!Array.isArray(tableData) && typeof tableData === 'object' && tableData !== null) {
          tableData = [tableData];
        }

        if (Array.isArray(tableData) && tableData.length > 0) {
          const headers = Object.keys(tableData[0]).join(',');
          const rows = (tableData as Record<string, unknown>[]).map((row: Record<string, unknown>) =>
            Object.values(row).map((val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(',')
          );
          const csvContent = [headers, ...rows].join('\n');

          const filePath = await save({
            filters: [{
              name: 'CSV',
              extensions: ['csv']
            }],
            defaultPath: `export_${new Date().toISOString().slice(0, 10)}.csv`
          });

          if (filePath) {
            await writeTextFile(filePath, csvContent);
            showNotification('CSV exported successfully!', 'success');
          } else {
            showNotification('CSV export cancelled.', 'info');
          }
          return;
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        showNotification(`Failed to export CSV. Invalid table data or file operation failed: ${errorMessage}`, 'error');
        return;
      }
    }

    showNotification('No table data available to export.', 'warning');
  };

  return (
    <div className="tab-content py-4 flex flex-col h-full">
      <div className="flex-grow overflow-y-auto">
        {hasOutput && executionResult?.structuredOutput ? (
          <div className="space-y-4">
            {executionResult.structuredOutput.map((item, index) => (
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
        <div className="pt-4 mt-auto border-t border-gray-200 dark:border-gray-700 flex justify-end items-center bg-white dark:bg-gray-800 z-30 space-x-2">
          <button
            title="Copy to Clipboard"
            className="bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 py-1 px-3 rounded-md font-bold flex items-center border border-blue-200 dark:border-blue-800 transition-all active:scale-95 text-sm"
            onClick={handleCopy}
          >
            <FontAwesomeIcon icon={faCopy} className="mr-2" />
            Copy
          </button>
          <button
            title="Export as CSV"
            className="bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 py-1 px-3 rounded-md font-bold flex items-center border border-blue-200 dark:border-blue-800 transition-all active:scale-95 text-sm"
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
