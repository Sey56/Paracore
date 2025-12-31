import React from 'react';
import { StructuredOutputViewer } from './StructuredOutputViewer';
import type { ScriptExecutionResult } from "@/types/scriptModel";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faFileCsv } from '@fortawesome/free-solid-svg-icons';
import { useNotifications } from '@/hooks/useNotifications';
import { save } from '@tauri-apps/api/dialog'; // Import save from dialog
import { writeTextFile } from '@tauri-apps/api/fs'; // Import writeTextFile from fs

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

        // Handle single object
        if (!Array.isArray(tableData) && typeof tableData === 'object' && tableData !== null) {
          tableData = [tableData];
        }

        if (Array.isArray(tableData) && tableData.length > 0) {
          const headers = Object.keys(tableData[0]).join('\t');
          const rows = tableData.map((row: any) =>
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

        // Handle single object
        if (!Array.isArray(tableData) && typeof tableData === 'object' && tableData !== null) {
          tableData = [tableData];
        }

        if (Array.isArray(tableData) && tableData.length > 0) {
          const headers = Object.keys(tableData[0]).join(',');
          const rows = tableData.map((row: any) =>
            Object.values(row).map((val: any) => `"${String(val).replace(/"/g, '""')}"`).join(',')
          );
          const csvContent = [headers, ...rows].join('\n');

          // Use Tauri dialog to save the file
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
