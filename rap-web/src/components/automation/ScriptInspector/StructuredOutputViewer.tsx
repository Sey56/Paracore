import React, { useCallback, useId } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line
} from 'recharts';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faFileCsv } from '@fortawesome/free-solid-svg-icons';

interface StructuredOutput {
  type: string;
  data: string;
}

interface StructuredOutputViewerProps {
  item: StructuredOutput;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const CustomPieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', padding: '8px 12px', fontSize: '12px' }}>
        <p style={{ color: '#fff', margin: 0, marginBottom: '4px' }}>{payload[0].name}</p>
        <p style={{ color: '#60a5fa', margin: 0 }}>{`value : ${payload[0].value}`}</p>
      </div>
    );
  }
  return null;
};

export const StructuredOutputViewer: React.FC<StructuredOutputViewerProps> = ({ item }) => {
  const { showNotification } = useNotifications();
  const [activeRowIndex, setActiveRowIndex] = React.useState<number | null>(null);
  const chartId = useId().replace(/:/g, ''); // Generate unique ID for the chart container

  const handleSelectElements = useCallback(async (ids: number[]) => {
    try {
      await api.post('/api/select-elements', { element_ids: ids });
    } catch (error) {
      console.error("Failed to select elements:", error);
      showNotification("Failed to select elements in Revit.", "error");
    }
  }, [showNotification]);

  const handleDownloadCsv = () => {
    try {
      const data = JSON.parse(item.data);
      const tableData = Array.isArray(data) ? data : [data];
      if (tableData.length === 0) return;

      const headers = Object.keys(tableData[0]).join(',');
      const rows = tableData.map((row: any) =>
        Object.values(row).map((val: any) => `"${String(val).replace(/"/g, '""')}"`).join(',')
      );
      const csvContent = [headers, ...rows].join('\n');

      const url = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
      const link = document.createElement("a");
      link.href = url;
      link.download = `data_${item.type}_${new Date().getTime()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showNotification("Chart data exported as CSV.", "success");
    } catch (err) {
      showNotification("Failed to export CSV data.", "error");
    }
  };

  const handleDownloadSvg = () => {
    const container = document.getElementById(chartId);
    
    if (container) {
      try {
        // 1. Find the chart SVG (largest SVG in the container)
        // This avoids selecting the small FontAwesome icons (14x14)
        const allSvgs = Array.from(container.querySelectorAll('svg'));
        let originalSvg: SVGSVGElement | null = null;
        let maxArea = 0;

        allSvgs.forEach(svg => {
            const rect = svg.getBoundingClientRect();
            const area = rect.width * rect.height;
            // Log for debugging
            console.log(`[ExportSVG] Found SVG: class="${svg.classList.value}", size=${rect.width}x${rect.height}`);
            
            if (area > maxArea) {
                maxArea = area;
                originalSvg = svg;
            }
        });

        if (!originalSvg || maxArea < 1000) { // Ignore small icons (< 30x30 roughly)
             console.warn(`[ExportSVG] No suitable chart SVG found. Max area: ${maxArea}`);
             showNotification("Could not find the chart image to export.", "warning");
             return;
        }

        const rect = originalSvg.getBoundingClientRect();
        // Fallback to attribute or container if rect is 0 (e.g. hidden tab)
        let width = rect.width;
        let height = rect.height;

        if (!width || !height) {
            width = parseFloat(originalSvg.getAttribute("width") || "0");
            height = parseFloat(originalSvg.getAttribute("height") || "0");
        }
        
        console.log(`[ExportSVG] Selected Chart SVG: class="${originalSvg.classList.value}", dimensions=${width}x${height}`);

        if (!width || !height) {
            console.warn("[ExportSVG] Width or height is 0, aborting export.");
            showNotification("Chart has no dimensions to export.", "warning");
            return;
        }

        // 2. Clone the SVG node deeply
        const clonedSvg = originalSvg.cloneNode(true) as SVGElement;
        
        // 3. Explicitly set dimensions on the clone to match pixel value
        clonedSvg.setAttribute("width", width.toString());
        clonedSvg.setAttribute("height", height.toString());
        clonedSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        clonedSvg.setAttribute("x", "0");
        clonedSvg.setAttribute("y", "0");
        // Ensure overflow is visible in case of slight clipping
        clonedSvg.style.overflow = "visible";

        // 4. Inline computed styles (crucial for Recharts/Tailwind)
        const originalNodes = originalSvg.querySelectorAll('*');
        const clonedNodes = clonedSvg.querySelectorAll('*');

        // Styles to copy
        const stylesToCopy = [
          'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 
          'opacity', 'font-family', 'font-size', 'font-weight', 
          'transform', 'transform-origin', 'visibility', 'display'
        ];
        
        // Copy root styles first
        const rootComputed = window.getComputedStyle(originalSvg);
        stylesToCopy.forEach(styleName => {
             const value = rootComputed.getPropertyValue(styleName);
             if (value) clonedSvg.style.setProperty(styleName, value);
        });

        // Copy children styles
        originalNodes.forEach((orig, index) => {
          const clone = clonedNodes[index] as SVGElement;
          if (clone instanceof SVGElement) {
            const computed = window.getComputedStyle(orig);
            stylesToCopy.forEach(styleName => {
              const value = computed.getPropertyValue(styleName);
              if (value) {
                clone.style.setProperty(styleName, value);
              }
            });
          }
        });

        // 5. Create a wrapper SVG with background
        const wrapperSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        wrapperSvg.setAttribute("width", width.toString());
        wrapperSvg.setAttribute("height", height.toString());
        wrapperSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
        wrapperSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

        // Background
        const computedContainerStyle = window.getComputedStyle(container);
        const bgColor = computedContainerStyle.backgroundColor || '#ffffff';
        const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        bgRect.setAttribute("width", "100%");
        bgRect.setAttribute("height", "100%");
        bgRect.setAttribute("fill", bgColor);
        wrapperSvg.appendChild(bgRect);

        // Append the styled chart (nested)
        wrapperSvg.appendChild(clonedSvg);

        // 6. Serialize
        const serializer = new XMLSerializer();
        let source = serializer.serializeToString(wrapperSvg);
        
        // Add xlink namespace if needed
        if (!source.match(/^<svg[^>]+"http\:\/\/www\.w3\.org\/1999\/xlink"/)) {
          source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
        }
        
        const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(source);
        const link = document.createElement("a");
        link.href = url;
        link.download = `chart_${item.type}_${new Date().getTime()}.svg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showNotification("Chart exported as SVG.", "success");
      } catch (err) {
        console.error("Failed to export SVG:", err);
        showNotification("Failed to export chart image.", "error");
      }
    } else {
      showNotification("Could not find chart element to export.", "warning");
    }
  };

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
                    {headers.map((header, colIndex) => {
                      const cellValue = row[header] !== null && row[header] !== undefined ? String(row[header]) : '';
                      return (
                        <td
                          key={colIndex}
                          className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300 max-w-[200px]"
                        >
                          <div className="truncate" title={cellValue}>
                            {cellValue}
                          </div>
                        </td>
                      );
                    })}
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
        <div id={chartId} className="relative group bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700" style={{ height: '300px', width: '100%', minHeight: '300px' }}>
          <div className="absolute top-2 right-2 z-10 flex gap-1">
            <button 
              onClick={handleDownloadCsv}
              className="p-1.5 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 rounded shadow-sm hover:text-green-500"
              title="Download Data as CSV"
            >
              <FontAwesomeIcon icon={faFileCsv} className="text-xs" />
            </button>
            <button 
              onClick={handleDownloadSvg}
              className="p-1.5 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 rounded shadow-sm hover:text-blue-500"
              title="Download Chart as SVG"
            >
              <FontAwesomeIcon icon={faDownload} className="text-xs" />
            </button>
          </div>
          <ResponsiveContainer width="100%" height="100%" minWidth="100px" minHeight="100px">
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
        <div id={chartId} className="relative group bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700" style={{ height: '300px', width: '100%', minHeight: '300px' }}>
          <div className="absolute top-2 right-2 z-10 flex gap-1">
            <button 
              onClick={handleDownloadCsv}
              className="p-1.5 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 rounded shadow-sm hover:text-green-500"
              title="Download Data as CSV"
            >
              <FontAwesomeIcon icon={faFileCsv} className="text-xs" />
            </button>
            <button 
              onClick={handleDownloadSvg}
              className="p-1.5 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 rounded shadow-sm hover:text-blue-500"
              title="Download Chart as SVG"
            >
              <FontAwesomeIcon icon={faDownload} className="text-xs" />
            </button>
          </div>
          <ResponsiveContainer width="100%" height="100%" minWidth="100px" minHeight="100px">
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
              <Tooltip content={<CustomPieTooltip />} />
              <Legend wrapperStyle={{ fontSize: '10px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      );
    }

    if (item.type === 'chart-line') {
      return (
        <div id={chartId} className="relative group bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700" style={{ height: '300px', width: '100%', minHeight: '300px' }}>
          <div className="absolute top-2 right-2 z-10 flex gap-1">
            <button 
              onClick={handleDownloadCsv}
              className="p-1.5 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 rounded shadow-sm hover:text-green-500"
              title="Download Data as CSV"
            >
              <FontAwesomeIcon icon={faFileCsv} className="text-xs" />
            </button>
            <button 
              onClick={handleDownloadSvg}
              className="p-1.5 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 rounded shadow-sm hover:text-blue-500"
              title="Download Chart as SVG"
            >
              <FontAwesomeIcon icon={faDownload} className="text-xs" />
            </button>
          </div>
          <ResponsiveContainer width="100%" height="100%" minWidth="100px" minHeight="100px">
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
