import React, { useCallback, useId, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line
} from 'recharts';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faFileCsv, faSort, faSortUp, faSortDown, faSearch } from '@fortawesome/free-solid-svg-icons';

export interface StructuredOutput {
  type: string;
  data: string;
}

interface StructuredOutputViewerProps {
  item: StructuredOutput;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

interface TooltipPayload {
  name: string;
  value: number;
  payload: Record<string, unknown>;
}

const CustomPieTooltip = ({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) => {
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

// --- Sub-Components ---

const TableView: React.FC<{ data: Record<string, unknown>[]; onSelect: (ids: number[]) => void }> = ({ data, onSelect }) => {
  const { showNotification } = useNotifications();
  const [activeRowIndex, setActiveRowIndex] = React.useState<number | null>(null);
  const [sortConfig, setSortConfig] = React.useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [filterText, setFilterText] = React.useState('');

  const headers = useMemo(() => (data.length > 0 ? Object.keys(data[0]) : []), [data]);

  const filteredData = useMemo(() => {
    let result = [...data];
    if (filterText) {
      const lowerFilter = filterText.toLowerCase();
      result = result.filter(row =>
        Object.values(row).some(val =>
          String(val).toLowerCase().includes(lowerFilter)
        )
      );
    }
    if (sortConfig) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
        }

        const aStr = String(aVal || '');
        const bStr = String(bVal || '');
        if (aStr < bStr) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aStr > bStr) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [data, filterText, sortConfig]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleRowClick = (row: Record<string, unknown>, index: number) => {
    const idKey = Object.keys(row).find(k =>
      ['id', 'elementid', 'revitid', 'element id', 'revit id'].includes(k.toLowerCase())
    );

    if (idKey) {
      const val = row[idKey];
      const id = typeof val === 'string' ? parseInt(val, 10) : Number(val);
      if (!isNaN(id) && id > 0) {
        setActiveRowIndex(index);
        onSelect([id]);
      } else {
        showNotification("Invalid Element ID detected.", "warning");
      }
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
            {filteredData.map((row: Record<string, unknown>, rowIndex: number) => {
              const hasId = Object.keys(row).some(k =>
                ['id', 'elementid', 'revitid', 'element id', 'revit id'].includes(k.toLowerCase())
              );
              const isActive = activeRowIndex === rowIndex;
              return (
                <tr
                  key={rowIndex}
                  onClick={() => handleRowClick(row, rowIndex)}
                  className={`
                    ${hasId ? "cursor-pointer transition-colors" : ""}
                    ${isActive ? "bg-blue-100 dark:bg-blue-800/40 border-l-4 border-blue-500" : "hover:bg-blue-50 dark:hover:bg-blue-900/20"}
                  `}
                >
                  {headers.map((header, colIndex) => {
                    const cellValue = row[header] !== null && row[header] !== undefined ? String(row[header]) : '';
                    return (
                      <td key={colIndex} className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300 max-w-[200px]">
                        <div className="truncate" title={cellValue}>{cellValue}</div>
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
};

// --- Main Component ---

export const StructuredOutputViewer: React.FC<StructuredOutputViewerProps> = ({ item }) => {
  const { showNotification } = useNotifications();
  const chartId = useId().replace(/:/g, '');

  const handleSelectElements = useCallback(async (ids: number[]) => {
    try {
      await api.post('/api/select-elements', { element_ids: ids });
    } catch (error) {
      console.error("Failed to select elements:", error);
      showNotification("Failed to select elements in Revit.", "error");
    }
  }, [showNotification]);

  const handleDownloadCsv = useCallback(() => {
    try {
      const parsed = JSON.parse(item.data);
      const data = Array.isArray(parsed) ? parsed : [parsed];
      if (data.length === 0) return;
      const headers = Object.keys(data[0]).join(',');
      const rows = data.map((row: Record<string, unknown>) =>
        Object.values(row).map((val: unknown) => `"${String(val).replace(/"/g, '""')}"`).join(',')
      );
      const csvContent = [headers, ...rows].join('\n');
      const url = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
      const link = document.createElement("a");
      link.href = url;
      link.download = `data_${item.type}_${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showNotification("Chart data exported as CSV.", "success");
    } catch {
      showNotification("Failed to export CSV data.", "error");
    }
  }, [item.data, item.type, showNotification]);

  const handleDownloadSvg = useCallback(() => {
    const container = document.getElementById(chartId);
    if (!container) return;
    try {
      const allSvgs = Array.from(container.querySelectorAll('svg')) as unknown as SVGSVGElement[];
      let originalSvg: SVGSVGElement | null = null;
      let maxArea = 0;
      for (const svg of allSvgs) {
        const rect = svg.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > maxArea) {
          maxArea = area;
          originalSvg = svg;
        }
      }
      if (!originalSvg || maxArea < 1000) {
        showNotification("Could not find the chart image to export.", "warning");
        return;
      }
      const rect = originalSvg.getBoundingClientRect();
      let width = rect.width;
      let height = rect.height;
      if (!width || !height) {
        width = parseFloat(originalSvg.getAttribute("width") || "0");
        height = parseFloat(originalSvg.getAttribute("height") || "0");
      }
      if (!width || !height) {
        showNotification("Chart has no dimensions to export.", "warning");
        return;
      }
      const clonedSvg = originalSvg.cloneNode(true) as SVGSVGElement;
      clonedSvg.setAttribute("width", width.toString());
      clonedSvg.setAttribute("height", height.toString());
      clonedSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      clonedSvg.style.overflow = "visible";

      const originalNodes = originalSvg.querySelectorAll('*');
      const clonedNodes = clonedSvg.querySelectorAll('*');
      const stylesToCopy = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-family', 'font-size', 'font-weight', 'transform', 'transform-origin', 'visibility', 'display'];

      const rootComputed = window.getComputedStyle(originalSvg);
      stylesToCopy.forEach(s => {
        const v = rootComputed.getPropertyValue(s);
        if (v) clonedSvg.style.setProperty(s, v);
      });

      originalNodes.forEach((orig, idx) => {
        const clone = clonedNodes[idx];
        if (clone instanceof Element) {
          const comp = window.getComputedStyle(orig);
          stylesToCopy.forEach(s => {
            const v = comp.getPropertyValue(s);
            if (v && (clone instanceof HTMLElement || clone instanceof SVGElement)) {
              (clone as HTMLElement | SVGElement).style.setProperty(s, v);
            }
          });
        }
      });

      const wrapperSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const padding = 20;
      let dataForLegend: { name?: string }[] = [];
      try {
        dataForLegend = JSON.parse(item.data);
      } catch (err) {
        console.error("Failed to parse data for legend:", err);
      }
      const legendHeight = (item.type === 'chart-pie' && Array.isArray(dataForLegend)) ? 40 : 0;
      const totalW = width + (padding * 2);
      const totalH = height + legendHeight + (padding * 2);
      wrapperSvg.setAttribute("width", totalW.toString());
      wrapperSvg.setAttribute("height", totalH.toString());
      wrapperSvg.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
      wrapperSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

      const bgColor = window.getComputedStyle(container).backgroundColor || '#ffffff';
      const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bgRect.setAttribute("width", "100%");
      bgRect.setAttribute("height", "100%");
      bgRect.setAttribute("fill", bgColor);
      wrapperSvg.appendChild(bgRect);

      const chartG = document.createElementNS("http://www.w3.org/2000/svg", "g");
      chartG.setAttribute("transform", `translate(${padding}, ${padding})`);
      chartG.appendChild(clonedSvg);
      wrapperSvg.appendChild(chartG);

      if (item.type === 'chart-pie' && legendHeight > 0) {
        const legendG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        const legendX = totalW - 120 - padding;
        const rowH = 20;
        const startY = padding + (height / 2) - ((dataForLegend.length * rowH) / 2);
        legendG.setAttribute("transform", `translate(${legendX}, ${startY})`);
        dataForLegend.forEach((entry, idx) => {
          const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          r.setAttribute("y", (idx * rowH).toString());
          r.setAttribute("width", "10"); r.setAttribute("height", "10");
          r.setAttribute("fill", COLORS[idx % COLORS.length]);
          legendG.appendChild(r);
          const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
          t.setAttribute("x", "15"); t.setAttribute("y", (idx * rowH + 10).toString());
          t.setAttribute("font-family", "sans-serif"); t.setAttribute("font-size", "11");
          t.setAttribute("fill", COLORS[idx % COLORS.length]); t.setAttribute("dominant-baseline", "middle");
          t.textContent = entry.name || `Item ${idx}`;
          legendG.appendChild(t);
        });
        wrapperSvg.appendChild(legendG);
      }

      const ser = new XMLSerializer();
      let src = ser.serializeToString(wrapperSvg);
      if (!src.match(/^<svg[^>]+"http:\/\/www\.w3\.org\/1999\/xlink"/)) {
        src = src.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
      }
      const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src);
      const link = document.createElement("a");
      link.href = url;
      link.download = `chart_${item.type}_${Date.now()}.svg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showNotification("Chart exported as SVG.", "success");
    } catch (err) {
      showNotification("Failed to export chart image.", "error");
    }
  }, [chartId, item.data, item.type, showNotification]);

  try {
    const parsedData = JSON.parse(item.data);
    const commonChartProps = { height: '300px', width: '100%', minHeight: '300px' };

    const Toolbar = () => (
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button onClick={handleDownloadCsv} className="p-1.5 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 rounded shadow-sm hover:text-green-500" title="Download CSV"><FontAwesomeIcon icon={faFileCsv} className="text-xs" /></button>
        <button onClick={handleDownloadSvg} className="p-1.5 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 rounded shadow-sm hover:text-blue-500" title="Download SVG"><FontAwesomeIcon icon={faDownload} className="text-xs" /></button>
      </div>
    );

    if (item.type === 'table') {
      const tableData = Array.isArray(parsedData) ? parsedData : [parsedData];
      if (tableData.length === 0) return <div className="p-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center"><p className="text-gray-500 dark:text-gray-400 text-xs italic">No data returned.</p></div>;
      return <TableView data={tableData} onSelect={handleSelectElements} />;
    }

    if (item.type === 'chart-bar') {
      return (
        <div id={chartId} className="relative group bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700" style={commonChartProps}>
          <Toolbar />
          <ResponsiveContainer width="100%" height="100%"><BarChart data={parsedData}><CartesianGrid strokeDasharray="3 3" opacity={0.1} /><XAxis dataKey="name" fontSize={10} /><YAxis fontSize={10} /><Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px', color: '#fff' }} itemStyle={{ color: '#60a5fa' }} /><Legend wrapperStyle={{ fontSize: '10px' }} /><Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </div>
      );
    }

    if (item.type === 'chart-pie') {
      return (
        <div id={chartId} className="relative group bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700" style={commonChartProps}>
          <Toolbar />
          <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={parsedData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" label={{ fontSize: 10 }} isAnimationActive={true}>{(parsedData as { value: number }[]).map((_, i: number) => <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip content={<CustomPieTooltip />} /><Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: '10px' }} /></PieChart></ResponsiveContainer>
        </div>
      );
    }

    if (item.type === 'chart-line') {
      return (
        <div id={chartId} className="relative group bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700" style={commonChartProps}>
          <Toolbar />
          <ResponsiveContainer width="100%" height="100%"><LineChart data={parsedData} margin={{ right: 30 }}><CartesianGrid strokeDasharray="3 3" opacity={0.1} /><XAxis dataKey="name" fontSize={10} /><YAxis fontSize={10} /><Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px', color: '#fff' }} /><Legend wrapperStyle={{ fontSize: '10px' }} /><Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} /></LineChart></ResponsiveContainer>
        </div>
      );
    }

    if (item.type === 'message') {
      return <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap text-sm">{parsedData}</p>;
    }

    return <pre className="px-3 py-2 rounded-lg font-mono text-xs whitespace-pre-wrap text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900/50">{JSON.stringify(parsedData, null, 2)}</pre>;
  } catch (e) {
    return <pre className="px-3 py-2 rounded-lg font-mono text-xs whitespace-pre-wrap text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30">Error rendering output: Invalid JSON data.<br />Raw data: {item.data}</pre>;
  }
};
