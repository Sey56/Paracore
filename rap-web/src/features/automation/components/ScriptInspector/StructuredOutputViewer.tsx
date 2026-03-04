import React, { useCallback, useId, useMemo, useRef, useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line
} from 'recharts';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';
import { useScripts } from '../../hooks/useScripts';
import { useScriptExecution } from '../../hooks/useScriptExecution';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faFileCsv, faSort, faSortUp, faSortDown, faSearch, faUpload, faCopy } from '@fortawesome/free-solid-svg-icons';
import { save } from '@tauri-apps/api/dialog';
import { writeTextFile } from '@tauri-apps/api/fs';

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

const TableView: React.FC<{
  data: Record<string, unknown>[];
  onSelect: (ids: number[]) => void;
  onUpdate?: (elementId: number, parameterName: string, newValue: string) => Promise<boolean>;
  actions?: React.ReactNode;
}> = ({ data: initialData, onSelect, onUpdate, actions }) => {
  const { showNotification } = useNotifications();
  const [data, setData] = useState(initialData);
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [filterText, setFilterText] = useState('');

  // Cell editing state
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    setData(initialData);
  }, [initialData]);

  // Listen for batch updates
  useEffect(() => {
    const handleBatchUpdate = (e: any) => {
      const { updates, idKey } = e.detail;
      const updatedData = [...data];
      updates.forEach((upd: any) => {
        const idx = updatedData.findIndex(r => {
          const rId = typeof r[idKey] === 'string' ? parseInt(r[idKey], 10) : Number(r[idKey]);
          return rId === upd.element_id;
        });
        if (idx !== -1) {
          updatedData[idx] = { ...updatedData[idx], [upd.parameter_name]: upd.new_value_string };
        }
      });
      setData(updatedData);
    };

    window.addEventListener('paracore-table-updated' as any, handleBatchUpdate);
    return () => window.removeEventListener('paracore-table-updated' as any, handleBatchUpdate);
  }, [data]);

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

  return (
    <div className="flex flex-col space-y-2 w-full min-w-0 overflow-hidden">
      <div className="flex items-center gap-2">
        <div className="relative flex-grow min-w-0">
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
        {actions && (
          <div className="flex shrink-0 gap-1 items-center">
            {actions}
          </div>
        )}
      </div>
      <div className="w-full min-w-0 overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
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
              const idColKey = Object.keys(row).find(k =>
                ['id', 'elementid', 'revitid', 'element id', 'revit id'].includes(k.toLowerCase())
              );
              const hasId = !!idColKey;
              const isActive = activeRowIndex === rowIndex;
              return (
                <tr
                  key={rowIndex}
                  className={`
                    ${hasId ? "transition-colors" : ""}
                    ${isActive ? "bg-blue-100 dark:bg-blue-800/40 border-l-4 border-blue-500" : "hover:bg-blue-50 dark:hover:bg-blue-900/20"}
                  `}
                >
                  {headers.map((header, colIndex) => {
                    const rawValue = row[header];
                    const cellValue = rawValue !== null && rawValue !== undefined ? String(rawValue) : '';
                    const isIdColumn = ['id', 'elementid', 'revitid', 'element id', 'revit id'].includes(header.toLowerCase());
                    const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.colKey === header;

                    const canEdit = !isIdColumn && !!onUpdate && hasId;

                    // Specialized click for ID selection
                    const handleIdClick = (e: React.MouseEvent) => {
                      if (isIdColumn && idColKey) {
                        e.stopPropagation();
                        const val = row[idColKey];
                        const id = typeof val === 'string' ? parseInt(val, 10) : Number(val);
                        if (!isNaN(id) && id > 0) {
                          setActiveRowIndex(rowIndex);
                          onSelect([id]);
                        }
                      }
                    };

                    const handleDoubleClick = () => {
                      if (canEdit) {
                        setEditingCell({ rowIndex, colKey: header });
                        setEditValue(cellValue);
                      }
                    };

                    const commitEdit = async () => {
                      if (!editingCell) return;
                      if (editValue !== cellValue) {
                        if (hasId && onUpdate && idColKey) {
                          const id = typeof row[idColKey] === 'string' ? parseInt(row[idColKey] as string, 10) : Number(row[idColKey]);
                          if (!isNaN(id) && id > 0) {
                            setIsUpdating(true);
                            const success = await onUpdate(id, header, editValue);
                            setIsUpdating(false);

                            if (success) {
                              const updatedData = [...data];
                              const originalRowIndex = data.findIndex(r => r === row);
                              if (originalRowIndex !== -1) {
                                updatedData[originalRowIndex] = { ...updatedData[originalRowIndex], [header]: editValue };
                                setData(updatedData);
                              }
                            } else {
                              setEditValue(cellValue);
                            }
                          }
                        }
                      }
                      setEditingCell(null);
                    };

                    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
                      if (e.key === 'Enter') {
                        commitEdit();
                      } else if (e.key === 'Escape') {
                        setEditingCell(null);
                      }
                    };

                    return (
                      <td
                        key={colIndex}
                        className={`px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300 max-w-[200px] ${canEdit ? 'cursor-pointer hover:bg-white/50 dark:hover:bg-black/20' : ''} ${isIdColumn ? 'font-mono text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer' : ''} ${isUpdating && isEditing ? 'opacity-50' : ''}`}
                        onClick={handleIdClick}
                        onDoubleClick={handleDoubleClick}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            type="text"
                            className="w-full bg-white dark:bg-gray-800 border-b-2 border-blue-500 focus:outline-none text-gray-900 dark:text-gray-100 px-1 py-0.5"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={handleKeyDown}
                            disabled={isUpdating}
                          />
                        ) : (
                          <div className="truncate" title={cellValue}>{cellValue}</div>
                        )}
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
  const { selectedScript } = useScriptExecution();
  const chartId = useId().replace(/:/g, '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // --- Build Metadata Map for Parameter Mapping ---
  const paramMetadataMap = useMemo(() => {
    const map = new Map<string, { name: string; unit: string }>();
    if (!selectedScript?.parameters) return map;

    selectedScript.parameters.forEach(p => {
      // Map clean C# property name (FloorFinish) to real Revit name (Floor Finish)
      const cleanId = p.name.replace(/\s+/g, '');
      map.set(cleanId, { name: p.name, unit: p.unit || "" });
      map.set(p.name, { name: p.name, unit: p.unit || "" });
    });
    return map;
  }, [selectedScript]);

  const handleSelectElements = useCallback(async (ids: number[]) => {
    try {
      await api.post('/api/select-elements', { element_ids: ids });
    } catch (error) {
      console.error("Failed to select elements:", error);
      showNotification("Failed to select elements in Revit.", "error");
    }
  }, [showNotification]);

  const handleUpdateParameter = useCallback(async (elementId: number, parameterName: string, newValue: string) => {
    try {
      // Translate C# property back to real Revit name
      const meta = paramMetadataMap.get(parameterName);
      const realName = meta?.name || parameterName;

      const response = await api.post('/api/update-element-parameter', {
        element_id: elementId,
        parameter_name: realName,
        new_value_string: newValue,
        unit: meta?.unit || ""
      });
      if (response.data?.is_success) {
        showNotification(`Updated ${realName}`, "success");
        return true;
      } else {
        showNotification(`Update failed: ${response.data?.error_message || 'Unknown error'}`, "error");
        return false;
      }
    } catch (error) {
      console.error("Failed to update parameter:", error);
      showNotification("Failed to update parameter in Revit.", "error");
      return false;
    }
  }, [showNotification, paramMetadataMap]);

  const handleCopy = useCallback(() => {
    try {
      const parsed = JSON.parse(item.data);
      const data = Array.isArray(parsed) ? parsed : [parsed];
      if (data.length === 0) return;
      const headers = Object.keys(data[0]).join('\t');
      const rows = data.map((row: Record<string, unknown>) =>
        Object.values(row).map(v => String(v ?? '')).join('\t')
      );
      const textToCopy = [headers, ...rows].join('\n');
      navigator.clipboard.writeText(textToCopy);
      showNotification('Table data copied to clipboard.', 'success');
    } catch {
      showNotification('Failed to copy table data.', 'error');
    }
  }, [item.data, showNotification]);

  const handleDownloadCsv = useCallback(async () => {
    try {
      const parsed = JSON.parse(item.data);
      const data = Array.isArray(parsed) ? parsed : [parsed];
      if (data.length === 0) return;
      const headers = Object.keys(data[0]).join(',');
      const rows = data.map((row: Record<string, unknown>) =>
        Object.values(row).map((val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(',')
      );
      const csvContent = [headers, ...rows].join('\n');

      if (item.type === 'table') {
        const filePath = await save({
          filters: [{ name: 'CSV', extensions: ['csv'] }],
          defaultPath: `export_${new Date().toISOString().slice(0, 10)}.csv`
        });
        if (filePath) {
          await writeTextFile(filePath, csvContent);
          showNotification('CSV exported successfully!', 'success');
        }
      } else {
        const url = "data:text/csv;charset=utf-8," + encodeURIComponent(csvContent);
        const link = document.createElement("a");
        link.href = url;
        link.download = `data_${item.type}_${Date.now()}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showNotification("Chart data exported as CSV.", "success");
      }
    } catch {
      showNotification("Failed to export CSV data.", "error");
    }
  }, [item.data, item.type, showNotification]);

  const handleUploadCsv = () => {
    if (!fileInputRef.current) return;
    fileInputRef.current.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let text = event.target?.result as string;
        if (!text) return;

        if (text.startsWith('\uFEFF')) text = text.substring(1);

        const parseCSV = (csv: string) => {
          const lines = csv.replace(/\r/g, "").split("\n").filter(l => l.trim() !== "");
          if (lines.length < 2) return [];

          const parseLine = (line: string) => {
            const result = [];
            let curr = "";
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') {
                if (inQuotes && line[i + 1] === '"') { curr += '"'; i++; }
                else inQuotes = !inQuotes;
              } else if (char === ',' && !inQuotes) { result.push(curr.trim()); curr = ""; }
              else curr += char;
            }
            result.push(curr.trim());
            return result;
          };

          const headers = parseLine(lines[0]);
          return lines.slice(1).map(line => {
            const values = parseLine(line);
            const obj: any = {};
            headers.forEach((h, i) => { if (h) obj[h] = values[i] !== undefined ? values[i] : ""; });
            return obj;
          });
        };

        const importedData = parseCSV(text);
        if (importedData.length === 0) return;

        let currentTableData: any[] = [];
        try {
          const parsed = JSON.parse(item.data);
          currentTableData = Array.isArray(parsed) ? parsed : [parsed];
        } catch { return; }

        if (currentTableData.length === 0) return;

        const tableKeys = Object.keys(currentTableData[0]);
        const idKey = tableKeys.find(k => ['id', 'elementid', 'revitid', 'element id', 'revit id'].includes(k.toLowerCase()));
        if (!idKey) return;

        const tableKeyMap = new Map<string, string>();
        tableKeys.forEach(k => {
          tableKeyMap.set(k.toLowerCase(), k);
          tableKeyMap.set(k.toLowerCase().replace(/\s+/g, ''), k);
        });

        const updates: any[] = [];
        importedData.forEach((importedRow) => {
          const importedIdKey = Object.keys(importedRow).find(k => k.toLowerCase() === idKey.toLowerCase()) || 'Id';
          const importedId = parseInt(String(importedRow[importedIdKey] || '').replace(/,/g, ''), 10);
          if (isNaN(importedId)) return;

          const matchingRow = currentTableData.find(r => {
            const rId = typeof r[idKey] === 'string' ? parseInt(r[idKey], 10) : Number(r[idKey]);
            return rId === importedId;
          });

          if (matchingRow) {
            Object.keys(importedRow).forEach(csvColName => {
              const lowerCsvCol = csvColName.toLowerCase().replace(/\s+/g, '');
              if (['id', 'elementid', 'revitid', 'element id', 'revit id'].includes(lowerCsvCol)) return;

              const actualTableColName = tableKeyMap.get(lowerCsvCol);
              if (actualTableColName) {
                const newVal = String(importedRow[csvColName]).trim();
                const oldVal = String(matchingRow[actualTableColName]).trim();

                if (newVal !== oldVal) {
                  // Use translation engine for mass updates too
                  const meta = paramMetadataMap.get(actualTableColName);
                  updates.push({
                    element_id: importedId,
                    parameter_name: meta?.name || actualTableColName,
                    new_value_string: newVal,
                    unit: meta?.unit || ""
                  });
                }
              }
            });
          }
        });

        if (updates.length === 0) {
          showNotification("No value changes detected in CSV.", "info");
          return;
        }

        setIsUpdating(true);
        const response = await api.post("/api/batch-update-element-parameters", { updates });
        setIsUpdating(false);

        if (response.data.is_success) {
          showNotification(`Successfully updated ${response.data.count} parameters.`, "success");
          window.dispatchEvent(new CustomEvent('paracore-table-updated', { detail: { updates, idKey } }));
        } else {
          showNotification(`Batch update failed: ${response.data.error_message}`, "error");
        }
      } catch (error) {
        setIsUpdating(false);
        showNotification("Failed to process CSV import.", "error");
      }
    };
    reader.readAsText(file);
    if (e.target) e.target.value = "";
  };

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
      if (!originalSvg) return;
      const rect = originalSvg.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const clonedSvg = originalSvg.cloneNode(true) as SVGSVGElement;
      clonedSvg.setAttribute("width", width.toString());
      clonedSvg.setAttribute("height", height.toString());
      clonedSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);

      const ser = new XMLSerializer();
      const src = ser.serializeToString(clonedSvg);
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
  }, [chartId, item.type, showNotification]);

  const parsedData = useMemo(() => {
    try {
      return JSON.parse(item.data);
    } catch {
      return undefined;
    }
  }, [item.data]);

  const tableData = useMemo(() => {
    if (parsedData === undefined || item.type !== 'table') return null;
    return Array.isArray(parsedData) ? parsedData : [parsedData];
  }, [parsedData, item.type]);

  if (parsedData === undefined) {
    return <pre className="px-3 py-2 rounded-lg font-mono text-xs whitespace-pre-wrap text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30">Error rendering output: Invalid JSON data.<br />Raw data: {item.data}</pre>;
  }

  try {
    const commonChartProps = { height: '300px', width: '100%', minHeight: '300px' };

    const TableToolbarActions = () => (
      <>
        <button onClick={handleCopy} className="p-1.5 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 rounded shadow-sm hover:text-blue-600" title="Copy Table"><FontAwesomeIcon icon={faCopy} className="text-xs" /></button>
        <button onClick={handleDownloadCsv} className="p-1.5 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 rounded shadow-sm hover:text-green-500" title="Export CSV (Save As...)"><FontAwesomeIcon icon={faFileCsv} className="text-xs" /></button>
        <button onClick={() => fileInputRef.current?.click()} className="p-1.5 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 rounded shadow-sm hover:text-blue-500" title="Upload CSV / Mass Edit"><FontAwesomeIcon icon={faUpload} className="text-xs" /></button>
      </>
    );

    const ChartToolbar = () => (
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        <button onClick={handleDownloadCsv} className="p-1.5 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 rounded shadow-sm hover:text-green-500" title="Download CSV"><FontAwesomeIcon icon={faFileCsv} className="text-xs" /></button>
        <button onClick={handleDownloadSvg} className="p-1.5 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 rounded shadow-sm hover:text-blue-500" title="Download SVG"><FontAwesomeIcon icon={faDownload} className="text-xs" /></button>
      </div>
    );

    if (item.type === 'table') {
      if (!tableData || tableData.length === 0) return <div className="p-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center"><p className="text-gray-500 dark:text-gray-400 text-xs italic">No data returned.</p></div>;
      return (
        <div className="relative group w-full min-w-0">
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
          <TableView
            data={tableData}
            onSelect={handleSelectElements}
            onUpdate={handleUpdateParameter}
            actions={<TableToolbarActions />}
          />
        </div>
      );
    }

    if (item.type === 'chart-bar') {
      return (
        <div id={chartId} className="relative group bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700" style={{ ...commonChartProps, minWidth: 0 }}>
          <ChartToolbar />
          <ResponsiveContainer width="100%" height={300}><BarChart data={parsedData}><CartesianGrid strokeDasharray="3 3" opacity={0.1} /><XAxis dataKey="name" fontSize={10} /><YAxis fontSize={10} /><Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px', color: '#fff' }} itemStyle={{ color: '#60a5fa' }} /><Legend wrapperStyle={{ fontSize: '10px' }} /><Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </div>
      );
    }

    if (item.type === 'chart-pie') {
      return (
        <div id={chartId} className="relative group bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700" style={{ ...commonChartProps, minWidth: 0 }}>
          <ChartToolbar />
          <ResponsiveContainer width="100%" height={300}><PieChart><Pie data={parsedData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" label={{ fontSize: 10 }} isAnimationActive={true}>{(parsedData as { value: number }[]).map((_, i: number) => <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip content={<CustomPieTooltip />} /><Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: '10px' }} /></PieChart></ResponsiveContainer>
        </div>
      );
    }

    if (item.type === 'chart-line') {
      return (
        <div id={chartId} className="relative group bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700" style={{ ...commonChartProps, minWidth: 0 }}>
          <ChartToolbar />
          <ResponsiveContainer width="100%" height={300}><LineChart data={parsedData} margin={{ right: 30 }}><CartesianGrid strokeDasharray="3 3" opacity={0.1} /><XAxis dataKey="name" fontSize={10} /><YAxis fontSize={10} /><Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px', color: '#fff' }} /><Legend wrapperStyle={{ fontSize: '10px' }} /><Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} /></LineChart></ResponsiveContainer>
        </div>
      );
    }

    if (item.type === 'message') {
      return (
        <div className="w-full min-w-0 overflow-hidden">
          <p className="text-gray-800 dark:text-gray-200 whitespace-pre-wrap text-sm">{parsedData}</p>
        </div>
      );
    }

    return (
      <div className="w-full min-w-0 overflow-hidden">
        <pre className="px-3 py-2 rounded-lg font-mono text-xs whitespace-pre-wrap text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900/50 overflow-x-auto">
          {JSON.stringify(parsedData, null, 2)}
        </pre>
      </div>
    );
  } catch (e) {
    return <pre className="px-3 py-2 rounded-lg font-mono text-xs whitespace-pre-wrap text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30">Error rendering output: Invalid JSON data.<br />Raw data: {item.data}</pre>;
  }
};
