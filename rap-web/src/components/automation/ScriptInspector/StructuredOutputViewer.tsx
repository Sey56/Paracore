import React from 'react';

interface StructuredOutput {
  type: string;
  data: string;
}


interface StructuredOutputViewerProps {
  item: StructuredOutput;
}

export const StructuredOutputViewer: React.FC<StructuredOutputViewerProps> = ({ item }) => {
  try {
    const parsedData = JSON.parse(item.data);

    if (item.type === 'table') {
      if (!Array.isArray(parsedData) || parsedData.length === 0) {
        return <p className="text-gray-600 dark:text-gray-400">No data for table.</p>;
      }

      const headers = Object.keys(parsedData[0]);

      return (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead>
              <tr>
                {headers.map((header, index) => (
                  <th
                    key={index}
                    scope="col"
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {parsedData.map((row: Record<string, string | number | boolean | null | undefined>, rowIndex: number) => (
                <tr key={rowIndex}>
                  {headers.map((header, colIndex) => (
                    <td
                      key={colIndex}
                      className="px-3 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200"
                    >
                      {row[header] !== null && row[header] !== undefined ? String(row[header]) : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    } else if (item.type === 'message') {
      return (
        <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
          {parsedData}
        </p>
      );
    } else {
      // Fallback for unknown types: display raw JSON
      return (
        <pre className="px-3 py-2 rounded-lg font-mono text-sm whitespace-pre-wrap text-gray-800 dark:text-gray-200">
          {JSON.stringify(parsedData, null, 2)}
        </pre>
      );
    }
  } catch (e) {
    console.error("Error parsing structured output data:", e);
    return (
      <pre className="px-3 py-2 rounded-lg font-mono text-sm whitespace-pre-wrap text-red-600 dark:text-red-400">
        Error rendering output: Invalid JSON data.
        <br />
        Raw data: {item.data}
      </pre>
    );
  }
};