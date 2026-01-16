import React, { useCallback, useId } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line
} from 'recharts';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faFileCsv, faSort, faSortUp, faSortDown, faSearch } from '@fortawesome/free-solid-svg-icons';

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
  const [sortConfig, setSortConfig] = React.useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [filterText, setFilterText] = React.useState('');
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
        const allSvgs = Array.from(container.querySelectorAll('svg')) as unknown as SVGSVGElement[];
        let originalSvg: SVGSVGElement | null = null;
        let maxArea = 0;

        for (const svg of allSvgs) {
          const rect = svg.getBoundingClientRect();
          const area = rect.width * rect.height;
          // Log for debugging
          console.log(`[ExportSVG] Found SVG: class="${svg.classList.value}", size=${rect.width}x${rect.height}`);

          if (area > maxArea) {
            maxArea = area;
            originalSvg = svg;
          }
        }

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
        const clonedSvg = originalSvg.cloneNode(true) as SVGSVGElement;

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
        originalNodes.forEach((orig: Element, index: number) => {
          const clone = clonedNodes[index] as unknown as SVGElement;
          if (clone instanceof Element) {
            const computed = window.getComputedStyle(orig);
            stylesToCopy.forEach(styleName => {
              const value = computed.getPropertyValue(styleName);
              if (value && (clone instanceof HTMLElement || clone instanceof SVGElement)) {
                (clone as SVGElement | HTMLElement).style.setProperty(styleName, value);
              }
            });
          }
        });

        // 5. Create a wrapper SVG with background
        const wrapperSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

        // Calculate legend height if needed
        let legendHeight = 0;
        let data: any[] = [];
        try {
          data = JSON.parse(item.data);
        } catch { /* ignore */ }

        if ((item.type === 'chart-pie' || item.type === 'chart-bar' || item.type === 'chart-line') && Array.isArray(data)) {
          legendHeight = 40; // allocate space for legend
        }

        const totalHeight = height + legendHeight;

        wrapperSvg.setAttribute("width", width.toString());
        wrapperSvg.setAttribute("height", totalHeight.toString());
        wrapperSvg.setAttribute("viewBox", `0 0 ${width} ${totalHeight}`);
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

        // 5.5 Append Legend Manually if Chart
        if (legendHeight > 0) {
          const legendGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
          legendGroup.setAttribute("transform", `translate(0, ${height})`);

          const fontSize = 12;
          const iconSize = 10;
          const padding = 20;
          let currentX = padding;
          const rowHeight = 20;

          data.forEach((entry, index) => {
            const color = COLORS[index % COLORS.length];
            const name = entry.name || `Item ${index}`;

            // Color Box
            const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            rect.setAttribute("x", currentX.toString());
            rect.setAttribute("y", "5");
            rect.setAttribute("width", iconSize.toString());
            rect.setAttribute("height", iconSize.toString());
            rect.setAttribute("fill", item.type === 'chart-line' ? '#3b82f6' : (item.type === 'chart-bar' ? '#3b82f6' : color));
            // For line/bar usually single color unless mapped. Pie uses COLORS. 
            // Let's reuse the logic from render: Pie uses COLORS. Bar uses single fill #3b82f6. Line uses stroke #3b82f6.

            let renderColor = color;
            if (item.type === 'chart-bar') renderColor = '#3b82f6';
            if (item.type === 'chart-line') renderColor = '#3b82f6';

            // rect.setAttribute("fill", renderColor); 
            // Using generic logic for now, refining for pie mainly as requested.
            if (item.type === 'chart-pie') {
              rect.setAttribute("fill", COLORS[index % COLORS.length]);
            } else {
              // For Bar/Line, Recharts default legend usually shows just the 'value' key or custom name. 
              // But our data structure for Bar/Line is simple [{name: 'X', value: 10}]. 
              // Recharts Legend shows the Series Name. Since we don't have multiple series, Legend is often redundant or shows "value".
              // The user specifically asked for PieChart legends.
              rect.setAttribute("fill", '#3b82f6');
            }

            legendGroup.appendChild(rect);

            // Text
            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.setAttribute("x", (currentX + iconSize + 5).toString());
            text.setAttribute("y", "14"); // baseline roughly
            text.setAttribute("font-family", "sans-serif");
            text.setAttribute("font-size", fontSize.toString());
            text.setAttribute("fill", "#6b7280"); // gray-500
            text.textContent = name;
            legendGroup.appendChild(text);

            // Estimate text width roughly (avg 8px per char) or use canvas measure. 
            // Simple approx:
            const textWidth = name.length * 8;
            currentX += iconSize + 5 + textWidth + padding;
          });

          wrapperSvg.appendChild(legendGroup);
        }

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
        showNotification("Chart exported as SVG with Legend.", "success");
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

      const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
          direction = 'desc';
        }
        setSortConfig({ key, direction });
      };

      const filteredData = React.useMemo(() => {
        let data = [...tableData];
        if (filterText) {
          const lowerFilter = filterText.toLowerCase();
          data = data.filter(row =>
            Object.values(row).some(val =>
              String(val).toLowerCase().includes(lowerFilter)
            )
          );
        }
        if (sortConfig) {
          data.sort((a, b) => {
            const aVal = a[sortConfig.key];
            const bVal = b[sortConfig.key];
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
          });
        }
        return data;
      }, [tableData, filterText, sortConfig]);

      const handleRowClick = (row: any, index: number) => {
        // Try to find an ID field (case-insensitive)
        const idKey = Object.keys(row).find(k =>
          k.toLowerCase() === 'id' ||
          k.toLowerCase() === 'elementid' ||
          k.toLowerCase() === 'revitid' ||
          k.toLowerCase() === 'element id' ||
          k.toLowerCase() === 'revit id'
        );

        if (idKey) {
          const val = row[idKey];
          // Robustly parse ID (handle string or number)
          const id = typeof val === 'string' ? parseInt(val, 10) : Number(val);

          if (!isNaN(id) && id > 0) {
            setActiveRowIndex(index);
            handleSelectElements([id]);
          } else {
            showNotification("Invalid Element ID detected.", "warning");
          }
        } else {
          console.warn("Row clicked but no ID column found.", row);
        }
      };

      return (
        <div className="flex flex-col space-y-2">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <FontAwesomeIcon icon={faSearch} className="text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Filter table..."
              className="pl-10 block w-full sm:text-sm border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-blue-500 focus:border-blue-500 p-2 border"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
          </div>
          <div className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg max-h-[500px]">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10 shadow-sm">
                <tr>
                  {headers.map((header, index) => (
                    <th
                      key={index}
                      scope="col"
                      className="px-3 py-2 text-left font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none group"
                      onClick={() => handleSort(header)}
                    >
                      <div className="flex items-center space-x-1">
                        <span>{header}</span>
                        <span className="text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300">
                          {sortConfig?.key === header ? (
                            sortConfig.direction === 'asc' ? <FontAwesomeIcon icon={faSortUp} /> : <FontAwesomeIcon icon={faSortDown} />
                          ) : (
                            <FontAwesomeIcon icon={faSort} className="opacity-0 group-hover:opacity-50" />
                          )}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                {filteredData.map((row: any, rowIndex: number) => {
                  const hasId = Object.keys(row).some(k =>
                    k.toLowerCase() === 'id' ||
                    k.toLowerCase() === 'elementid' ||
                    k.toLowerCase() === 'revitid' ||
                    k.toLowerCase() === 'element id' ||
                    k.toLowerCase() === 'revit id'
                  );
                  const isActive = activeRowIndex === rowIndex; // NOTE: activeRowIndex logic might break if sorted/filtered.
                  // Ideally track active ID, not index. But for simple visual feedback it might be ok or we update logic.
                  // Let's stick to index for now but acknowledge limitation or try to match object reference if possible.
                  // Actually, index in filteredData IS the displayed index. So visual feedback works for the current view.
                  // But element selection uses row data, so that's fine.

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
