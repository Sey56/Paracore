import React, { useCallback } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line
} from 'recharts';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';

interface StructuredOutput {
  type: string;
  data: string;
}

interface StructuredOutputViewerProps {
  item: StructuredOutput;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export const StructuredOutputViewer: React.FC<StructuredOutputViewerProps> = ({ item }) => {
  const { showNotification } = useNotifications();
  const [activeRowIndex, setActiveRowIndex] = React.useState<number | null>(null);

  const handleSelectElements = useCallback(async (ids: number[]) => {
    try {
      await api.post('/api/select-elements', { element_ids: ids });
    } catch (error) {
      console.error("Failed to select elements:", error);
      showNotification("Failed to select elements in Revit.", "error");
    }
  }, [showNotification]);

  try {
    const parsedData = JSON.parse(item.data);

    if (item.type === 'table') {
      let tableData = parsedData;

      // Handle single object: wrap in array
      if (!Array.isArray(parsedData) && typeof parsedData === 'object' && parsedData !== null) {
        tableData = [parsedData];
      }

      if (!Array.isArray(tableData) || tableData.length === 0) {
        return <p className="text-gray-600 dark:text-gray-400 text-xs italic">No data for table.</p>;
      }

      const headers = Object.keys(tableData[0]);

      const handleRowClick = (row: any, index: number) => {
        // Try to find an ID field (case-insensitive)
        const idKey = Object.keys(row).find(k => 
          k.toLowerCase() === 'id' || 
          k.toLowerCase() === 'elementid' || 
          k.toLowerCase() === 'revitid'
        );

        if (idKey) {
          const val = row[idKey];
          // Robustly parse ID (handle string or number)
          const id = typeof val === 'string' ? parseInt(val, 10) : Number(val);
          
          if (!isNaN(id) && id > 0) {
            setActiveRowIndex(index);
            handleSelectElements([id]);
          }
        }
      };

      return (
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-xs">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                {headers.map((header, index) => (
                  <th
                    key={index}
                    scope="col"
                    className="px-3 py-2 text-left font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
              {tableData.map((row: any, rowIndex: number) => {
                const hasId = Object.keys(row).some(k => k.toLowerCase() === 'id' || k.toLowerCase() === 'elementid');
                const isActive = activeRowIndex === rowIndex;
                
                return (
                  <tr 
                    key={rowIndex} 
                    onClick={() => handleRowClick(row, rowIndex)}
                    className={`
                      ${hasId ? "cursor-pointer transition-colors" : ""}
                      ${isActive 
                        ? "bg-blue-100 dark:bg-blue-800/40 border-l-4 border-blue-500" 
                        : "hover:bg-blue-50 dark:hover:bg-blue-900/20"}
                    `}
                  >
                    {headers.map((header, colIndex) => (
                      <td
                        key={colIndex}
                        className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300"
                      >
                        {row[header] !== null && row[header] !== undefined ? String(row[header]) : ''}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    } 
    
    if (item.type === 'chart-bar') {
      return (
        <div className="h-64 w-full bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={parsedData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis dataKey="name" fontSize={10} />
              <YAxis fontSize={10} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px', color: '#fff' }}
                itemStyle={{ color: '#60a5fa' }}
              />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (item.type === 'chart-pie') {
      return (
        <div className="h-64 w-full bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={parsedData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
                label={{ fontSize: 10 }}
              >
                {parsedData.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px', color: '#fff' }}
              />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (item.type === 'chart-line') {
      return (
        <div className="h-64 w-full bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={parsedData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis dataKey="name" fontSize={10} />
              <YAxis fontSize={10} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px', color: '#fff' }}
              />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (item.type === 'message') {
      return (
        <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap text-sm">
          {parsedData}
        </p>
      );
    } else {
      // Fallback for unknown types: display raw JSON
      return (
        <pre className="px-3 py-2 rounded-lg font-mono text-xs whitespace-pre-wrap text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900/50">
          {JSON.stringify(parsedData, null, 2)}
        </pre>
      );
    }
  } catch (e) {
    console.error("Error parsing structured output data:", e);
    return (
      <pre className="px-3 py-2 rounded-lg font-mono text-xs whitespace-pre-wrap text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30">
        Error rendering output: Invalid JSON data.
        <br />
        Raw data: {item.data}
      </pre>
    );
  }
};
