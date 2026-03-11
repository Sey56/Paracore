import React, { useCallback, useId, useMemo, useRef, useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line
} from 'recharts';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';
import { useScripts } from '../../hooks/useScripts';
import { useScriptExecution } from '../../hooks/useScriptExecution';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faDownload, faFileCsv, faSort, faSortUp, faSortDown, faSearch, faUpload, faCopy, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { save } from '@tauri-apps/api/dialog';
import { writeTextFile } from '@tauri-apps/api/fs';
import { Tooltip } from '@/components/common/Tooltip';

export interface StructuredOutput {
  type: string;
  data: string;
}

interface StructuredOutputViewerProps {
  item: StructuredOutput;
  isDashboard?: boolean;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const CustomChartTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-slate-900 shadow-2xl rounded-xl p-2 px-3 text-xs border-none">
        <p className="text-slate-500 dark:text-slate-400 font-medium m-0 mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-blue-600 dark:text-blue-400 font-bold m-0">
            {`${entry.name} : ${entry.value}`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const CustomPieTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-slate-900 shadow-2xl rounded-xl p-2 px-3 text-xs border-none">
        <p className="text-slate-700 dark:text-white font-bold m-0 mb-1">{payload[0].name}</p>
        <p className="text-blue-600 dark:text-blue-400 m-0">{`value : ${payload[0].value}`}</p>
      </div>
    );
  }
  return null;
};

// --- TableView: Viewport-Locked Scrolling Architecture ---

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

  // Column Resizing Logic
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null);

  const handleMouseDown = (e: React.MouseEvent, key: string) => {
    e.stopPropagation(); e.preventDefault();
    const startWidth = columnWidths[key] || 150;
    resizingRef.current = { key, startX: e.pageX, startWidth };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!resizingRef.current) return;
    const { key, startX, startWidth } = resizingRef.current;
    const delta = e.pageX - startX;
    const newWidth = Math.max(60, startWidth + delta);
    setColumnWidths(prev => ({ ...prev, [key]: newWidth }));
  }, []);

  const handleMouseUp = useCallback(() => {
    resizingRef.current = null;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  }, [handleMouseMove]);

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove]);

  // Cell editing state
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => { setData(initialData); }, [initialData]);

  // V5: FUNCTIONAL RESTORATION - Listen for batch updates from CSV import
  useEffect(() => {
    const handleBatchUpdate = (e: any) => {
      const { updates, idKey } = e.detail;
      setData(prevData => {
        const updatedData = [...prevData];
        updates.forEach((upd: any) => {
          const idx = updatedData.findIndex(r => {
            const rId = typeof r[idKey] === 'string' ? parseInt(r[idKey], 10) : Number(r[idKey]);
            return rId === upd.element_id;
          });
          if (idx !== -1) {
            updatedData[idx] = { ...updatedData[idx], [upd.parameter_name]: upd.new_value_string };
          }
        });
        return updatedData;
      });
    };

    window.addEventListener('paracore-table-updated' as any, handleBatchUpdate);
    return () => window.removeEventListener('paracore-table-updated' as any, handleBatchUpdate);
  }, []);

  const headers = useMemo(() => (data.length > 0 ? Object.keys(data[0]) : []), [data]);

  const filteredData = useMemo(() => {
    let result = [...data];
    if (filterText) {
      const lowerFilter = filterText.toLowerCase();
      result = result.filter(row => Object.values(row).some(val => String(val).toLowerCase().includes(lowerFilter)));
    }
    if (sortConfig) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (typeof aVal === 'number' && typeof bVal === 'number') return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
        const aStr = String(aVal || '');
        const bStr = String(bVal || '');
        return sortConfig.direction === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
      });
    }
    return result;
  }, [data, filterText, sortConfig]);

  return (
    <div className="flex flex-col space-y-3 w-full h-full min-w-0">
      <div className="flex items-center gap-2 shrink-0 px-1">
        <div className="relative flex-grow min-w-0">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <FontAwesomeIcon icon={faSearch} className="text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Filter table..."
            className="pl-10 block w-full text-sm border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 p-2 border transition-all"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
        </div>
        {actions && <div className="flex shrink-0 gap-1 items-center">{actions}</div>}
      </div>

      {/* VIEWPORT SCROLL HUB: Handles both axes internally */}
      <div className="flex-1 w-full min-h-0 overflow-auto border border-slate-200 dark:border-slate-700 rounded-xl shadow-inner bg-slate-50/20 dark:bg-black/10 custom-scrollbar max-h-[calc(100vh-140px)]">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-xs border-collapse">
          <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-30 shadow-sm">
            <tr>
              {headers.map((header, index) => {
                const width = columnWidths[header] || (header.toLowerCase() === 'id' ? 80 : 150);
                return (
                  <th
                    key={index}
                    scope="col"
                    style={{ width, minWidth: width }}
                    className="relative px-3 py-2.5 text-left font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 select-none group border-r border-slate-200 dark:border-slate-700 last:border-r-0"
                  >
                    <Tooltip text={header}>
                      <div className="flex items-center space-x-1" onClick={() => {
                        let direction: 'asc' | 'desc' = 'asc';
                        if (sortConfig?.key === header && sortConfig.direction === 'asc') direction = 'desc';
                        setSortConfig({ key: header, direction });
                      }}>
                        <span className="truncate block max-w-[200px]">{header}</span>
                        <span className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 shrink-0">
                          {sortConfig?.key === header ? (
                            sortConfig.direction === 'asc' ? <FontAwesomeIcon icon={faSortUp} /> : <FontAwesomeIcon icon={faSortDown} />
                          ) : (
                            <FontAwesomeIcon icon={faSort} className="opacity-0 group-hover:opacity-50" />
                          )}
                        </span>
                      </div>
                    </Tooltip>
                    <div onMouseDown={(e) => handleMouseDown(e, header)} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-600 transition-colors z-20" />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
            {filteredData.map((row: Record<string, unknown>, rowIndex: number) => {
              const idColKey = Object.keys(row).find(k => ['id', 'elementid', 'revitid', 'element id', 'revit id'].includes(k.toLowerCase()));
              const hasId = !!idColKey;
              const isActive = activeRowIndex === rowIndex;
              return (
                <tr key={rowIndex} className={`${hasId ? "transition-colors" : ""} ${isActive ? "bg-blue-100/50 dark:bg-blue-800/20 border-l-4 border-blue-500" : "hover:bg-blue-50/50 dark:hover:bg-blue-900/10"}`}>
                  {headers.map((header, colIndex) => {
                    const cellValue = row[header] !== null && row[header] !== undefined ? String(row[header]) : '';
                    const isIdColumn = ['id', 'elementid', 'revitid', 'element id', 'revit id'].includes(header.toLowerCase());
                    const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.colKey === header;
                    const canEdit = !isIdColumn && !!onUpdate && hasId;
                    const width = columnWidths[header];

                    return (
                      <td
                        key={colIndex}
                        style={{ width }}
                        className={`px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800 last:border-0 ${canEdit ? 'cursor-pointer hover:bg-white/50 dark:hover:bg-black/20' : ''} ${isIdColumn ? 'font-mono text-blue-600 dark:text-blue-400 font-bold hover:underline cursor-pointer' : ''} ${isUpdating && isEditing ? 'opacity-50' : ''}`}
                        onClick={() => {
                          if (isIdColumn && idColKey) {
                            const val = row[idColKey];
                            const id = typeof val === 'string' ? parseInt(val, 10) : Number(val);
                            if (!isNaN(id)) { setActiveRowIndex(rowIndex); onSelect([id]); }
                          }
                        }}
                        onDoubleClick={() => { if (canEdit) { setEditingCell({ rowIndex, colKey: header }); setEditValue(cellValue); } }}
                      >
                        {isEditing ? (
                          <input
                            autoFocus
                            type="text"
                            className="w-full bg-white dark:bg-slate-800 border-b-2 border-blue-500 focus:outline-none text-slate-900 dark:text-slate-100 px-1 py-0.5"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={async () => {
                              if (editValue !== cellValue && hasId && onUpdate && idColKey) {
                                const id = typeof row[idColKey] === 'string' ? parseInt(row[idColKey] as string, 10) : Number(row[idColKey]);
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
                                } else setEditValue(cellValue);
                              }
                              setEditingCell(null);
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') setEditingCell(null); }}
                            disabled={isUpdating}
                          />
                        ) : (
                          <Tooltip text={cellValue}>
                            <div className="truncate max-w-[300px]">{cellValue}</div>
                          </Tooltip>
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

export const StructuredOutputViewer: React.FC<StructuredOutputViewerProps> = ({ item, isDashboard = false }) => {
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
      // Map clean C# property name (FloorFinish) back to real Revit name (Floor Finish)
      const cleanId = p.name.replace(/\s+/g, '').toLowerCase();
      map.set(cleanId, { name: p.name, unit: p.unit || "" });
      map.set(p.name.toLowerCase(), { name: p.name, unit: p.unit || "" });
    });
    return map;
  }, [selectedScript]);

  const handleSelectElements = useCallback(async (ids: number[]) => {
    try { await api.post('/api/select-elements', { element_ids: ids }); }
    catch (error) { showNotification("Failed to select elements in Revit.", "error"); }
  }, [showNotification]);

  const handleUpdateParameter = useCallback(async (elementId: number, parameterName: string, newValue: string) => {
    try {
      const meta = paramMetadataMap.get(parameterName.toLowerCase()) || paramMetadataMap.get(parameterName.replace(/\s+/g, '').toLowerCase());
      let realName = meta?.name || parameterName;
      let unit = meta?.unit || "";

      // --- Magic Header Discovery (REPL support) ---
      // If we see "Area [m2]", extract unit "m2" and search for "Area"
      if (!unit) {
        const match = parameterName.match(/^(.*?)?\s*\[(.*?)\]$/);
        if (match) {
          realName = match[1].trim();
          unit = match[2].trim();
        }
      }

      const response = await api.post('/api/update-element-parameter', { 
        element_id: elementId, 
        parameter_name: realName, 
        new_value_string: newValue, 
        unit 
      });
      if (response.data?.is_success) { showNotification(`Updated ${realName}`, "success"); return true; }
      else { showNotification(`Update failed: ${response.data?.error_message || 'Unknown error'}`, "error"); return false; }
    } catch (error) { showNotification("Failed to update parameter in Revit.", "error"); return false; }
  }, [showNotification, paramMetadataMap]);

  const handleCopy = useCallback(() => {
    try {
      const parsed = JSON.parse(item.data);
      const data = Array.isArray(parsed) ? parsed : [parsed];
      if (data.length === 0) return;
      const textToCopy = [Object.keys(data[0]).join('\t'), ...data.map((row: any) => Object.values(row).map(v => String(v ?? '')).join('\t'))].join('\n');
      navigator.clipboard.writeText(textToCopy);
      showNotification('Table data copied to clipboard.', 'success');
    } catch { showNotification('Failed to copy table data.', 'error'); }
  }, [item.data, showNotification]);

  const handleDownloadCsv = useCallback(async () => {
    try {
      const parsed = JSON.parse(item.data);
      const data = Array.isArray(parsed) ? parsed : [parsed];
      if (data.length === 0) return;
      const csvContent = [Object.keys(data[0]).join(','), ...data.map((row: any) => Object.values(row).map((val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
      const filePath = await save({ filters: [{ name: 'CSV', extensions: ['csv'] }], defaultPath: `export_${new Date().toISOString().slice(0, 10)}.csv` });
      if (filePath) { await writeTextFile(filePath, csvContent); showNotification('CSV exported successfully!', 'success'); }
    } catch { showNotification("Failed to export CSV data.", "error"); }
  }, [item.data, item.type, showNotification]);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let text = event.target?.result as string; if (!text) return;
        if (text.startsWith('\uFEFF')) text = text.substring(1);
        const parseCSV = (csv: string) => {
          const lines = csv.replace(/\r/g, "").split("\n").filter(l => l.trim() !== "");
          if (lines.length < 2) return [];
          const parseLine = (line: string) => {
            const result = []; let curr = ""; let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') { if (inQuotes && line[i + 1] === '"') { curr += '"'; i++; } else inQuotes = !inQuotes; }
              else if (char === ',' && !inQuotes) { result.push(curr.trim()); curr = ""; } else curr += char;
            }
            result.push(curr.trim()); return result;
          };
          const headers = parseLine(lines[0]);
          return lines.slice(1).map(line => {
            const values = parseLine(line); const obj: any = {};
            headers.forEach((h, i) => { if (h) obj[h] = values[i] !== undefined ? values[i] : ""; });
            return obj;
          });
        };
        const importedData = parseCSV(text); if (importedData.length === 0) return;
        const currentData = JSON.parse(item.data);
        const tableData = Array.isArray(currentData) ? currentData : [currentData];
        if (tableData.length === 0) return;
        const idKey = Object.keys(tableData[0]).find(k => ['id', 'elementid', 'revitid', 'element id', 'revit id'].includes(k.toLowerCase())) || 'Id';
        const updates: any[] = [];
        importedData.forEach(impRow => {
          const impId = parseInt(String(impRow[idKey] || '').replace(/,/g, ''), 10);
          const match = tableData.find(r => Number(r[idKey]) === impId);
          if (match) {
            Object.keys(impRow).forEach(col => {
              if (['id', 'elementid', 'revitid', 'element id', 'revit id'].includes(col.toLowerCase())) return;
              const meta = paramMetadataMap.get(col.toLowerCase()) || paramMetadataMap.get(col.replace(/\s+/g, '').toLowerCase());
              let realName = meta?.name || col;
              let unit = meta?.unit || "";

              // --- Magic Header Discovery (REPL CSV support) ---
              if (!unit) {
                const match = col.match(/^(.*?)?\s*\[(.*?)\]$/);
                if (match) {
                  realName = match[1].trim();
                  unit = match[2].trim();
                }
              }

              if (String(impRow[col]) !== String(match[col])) {
                updates.push({ element_id: impId, parameter_name: realName, new_value_string: String(impRow[col]), unit });
              }
            });
          }
        });
        if (updates.length > 0) {
          setIsUpdating(true);
          const res = await api.post("/api/batch-update-element-parameters", { updates });
          setIsUpdating(false);
          if (res.data.is_success) {
            showNotification(`Updated ${res.data.count} parameters.`, "success");
            window.dispatchEvent(new CustomEvent('paracore-table-updated', { detail: { updates, idKey } }));
          }
        } else showNotification("No changes detected in CSV.", "info");
      } catch (err) { setIsUpdating(false); showNotification("CSV processing failed.", "error"); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const parsedData = useMemo(() => { try { return JSON.parse(item.data); } catch { return undefined; } }, [item.data]);
  const tableData = useMemo(() => (parsedData === undefined || item.type !== 'table') ? null : (Array.isArray(parsedData) ? parsedData : [parsedData]), [parsedData, item.type]);

  if (parsedData === undefined) return <pre className="p-3 text-xs text-red-600 bg-red-50 rounded-xl">Error: Invalid JSON.</pre>;

  const TableToolbarActions = () => (
    <div className="flex gap-1">
      <button onClick={handleCopy} className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:text-blue-600" title="Copy Table"><FontAwesomeIcon icon={faCopy} className="text-xs" /></button>
      <button onClick={handleDownloadCsv} className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:text-green-500" title="Export CSV"><FontAwesomeIcon icon={faFileCsv} className="text-xs" /></button>
      <button onClick={() => fileInputRef.current?.click()} className="p-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:text-blue-500" title="Upload CSV / Mass Edit"><FontAwesomeIcon icon={faUpload} className="text-xs" /></button>
    </div>
  );

  if (item.type === 'table') {
    return (
      <div className={isDashboard ? 'w-full max-h-[500px]' : 'flex-1 w-full min-h-0'}>
        <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
        <TableView data={tableData || []} onSelect={handleSelectElements} onUpdate={handleUpdateParameter} actions={<TableToolbarActions />} />
      </div>
    );
  }

  // --- V3 Proven Export Logic (DOM cloning + computed style transfer) ---
  const handleDownloadChartCsv = useCallback(async () => {
    try {
      const data = Array.isArray(parsedData) ? parsedData : [parsedData];
      if (data.length === 0) return;
      const csvContent = [Object.keys(data[0]).join(','), ...data.map((row: any) => Object.values(row).map((val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
      const filePath = await save({ filters: [{ name: 'CSV', extensions: ['csv'] }], defaultPath: `chart_data_${new Date().toISOString().slice(0, 10)}.csv` });
      if (filePath) { await writeTextFile(filePath, csvContent); showNotification('Chart data exported as CSV.', 'success'); }
    } catch { showNotification("Failed to export CSV data.", "error"); }
  }, [parsedData, showNotification]);

  const handleDownloadSvg = useCallback(async () => {
    const container = document.getElementById(chartId);
    if (!container) return;
    try {
      // 1. Find the largest SVG in the container (the actual chart)
      const allSvgs = Array.from(container.querySelectorAll('svg')) as unknown as SVGSVGElement[];
      let originalSvg: SVGSVGElement | null = null;
      let maxArea = 0;
      for (const svg of allSvgs) {
        const rect = svg.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > maxArea) { maxArea = area; originalSvg = svg; }
      }
      if (!originalSvg || maxArea < 1000) {
        showNotification("Could not find the chart image to export.", "warning");
        return;
      }
      const rect = originalSvg.getBoundingClientRect();
      const width = rect.width || parseFloat(originalSvg.getAttribute("width") || "0");
      const height = rect.height || parseFloat(originalSvg.getAttribute("height") || "0");

      if (!width || !height) {
        showNotification("Chart has no dimensions to export.", "warning");
        return;
      }

      // 2. Clone the SVG and copy all computed styles for standalone rendering
      const clonedSvg = originalSvg.cloneNode(true) as SVGSVGElement;
      clonedSvg.setAttribute("width", width.toString());
      clonedSvg.setAttribute("height", height.toString());
      clonedSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      clonedSvg.style.overflow = "visible";

      const originalNodes = originalSvg.querySelectorAll('*');
      const clonedNodes = clonedSvg.querySelectorAll('*');
      const stylesToCopy = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity', 'font-family', 'font-size', 'font-weight', 'transform', 'transform-origin', 'visibility', 'display'];

      const rootComputed = window.getComputedStyle(originalSvg);
      stylesToCopy.forEach(s => { const v = rootComputed.getPropertyValue(s); if (v) clonedSvg.style.setProperty(s, v); });

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

      // 3. Coordinate-aware Legend Scraping
      const padding = 20;
      const legendWrapper = container.querySelector('.recharts-legend-wrapper');
      const legendItems = legendWrapper ? Array.from(legendWrapper.querySelectorAll('.recharts-legend-item')) : [];
      let legendG: SVGGElement | null = null;
      let extraHeight = 0;

      if (legendWrapper && legendItems.length > 0) {
        const containerRect = container.getBoundingClientRect();
        const lWrapperRect = legendWrapper.getBoundingClientRect();

        // Calculate legend wrapper pos relative to the chart container
        const wrapperRelX = lWrapperRect.left - containerRect.left;
        const wrapperRelY = lWrapperRect.top - containerRect.top;

        legendG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        legendG.setAttribute("transform", `translate(${wrapperRelX + padding}, ${wrapperRelY + padding})`);

        legendItems.forEach((itemEl, idx) => {
          const itemRect = itemEl.getBoundingClientRect();
          const itemRelX = itemRect.left - lWrapperRect.left;
          const itemRelY = itemRect.top - lWrapperRect.top;

          const textEl = itemEl.querySelector('.recharts-legend-item-text');
          const iconEl = itemEl.querySelector('.recharts-surface path') || itemEl.querySelector('.recharts-surface circle');
          const color = iconEl ? (window.getComputedStyle(iconEl).fill || COLORS[idx % COLORS.length]) : COLORS[idx % COLORS.length];
          const label = textEl ? textEl.textContent : `Item ${idx}`;

          const itemG = document.createElementNS("http://www.w3.org/2000/svg", "g");
          itemG.setAttribute("transform", `translate(${itemRelX}, ${itemRelY})`);

          const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          r.setAttribute("width", "12"); r.setAttribute("height", "12");
          r.setAttribute("fill", color); r.setAttribute("rx", "2");
          itemG.appendChild(r);

          const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
          t.setAttribute("x", "18"); t.setAttribute("y", "10");
          t.setAttribute("font-family", "Inter, sans-serif"); t.setAttribute("font-size", "11");
          t.setAttribute("fill", "#64748b");
          t.textContent = label || '';
          itemG.appendChild(t);

          legendG!.appendChild(itemG);
        });

        // Extend canvas if legend is outside chart area
        if (wrapperRelY + lWrapperRect.height > height) {
          extraHeight = (wrapperRelY + lWrapperRect.height) - height;
        }
      }

      // 4. Wrap everything in a padded SVG with background color
      const wrapperSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const totalW = width + (padding * 2);
      const totalH = height + extraHeight + (padding * 2);

      wrapperSvg.setAttribute("width", totalW.toString());
      wrapperSvg.setAttribute("height", totalH.toString());
      wrapperSvg.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
      wrapperSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

      const bgColor = window.getComputedStyle(container).backgroundColor || '#ffffff';
      const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bgRect.setAttribute("width", "100%"); bgRect.setAttribute("height", "100%"); bgRect.setAttribute("fill", bgColor);
      wrapperSvg.appendChild(bgRect);

      const chartG = document.createElementNS("http://www.w3.org/2000/svg", "g");
      chartG.setAttribute("transform", `translate(${padding}, ${padding})`);
      chartG.appendChild(clonedSvg);
      wrapperSvg.appendChild(chartG);

      if (legendG) wrapperSvg.appendChild(legendG);

      const ser = new XMLSerializer();
      let src = ser.serializeToString(wrapperSvg);
      if (!src.match(/^<svg[^>]+"http:\/\/www\.w3\.org\/1999\/xlink"/)) {
        src = src.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
      }

      const filePath = await save({ filters: [{ name: 'SVG', extensions: ['svg'] }], defaultPath: `chart_${item.type}_${new Date().toISOString().slice(0, 10)}.svg` });
      if (filePath) { await writeTextFile(filePath, src); showNotification('Chart exported as SVG.', 'success'); }
    } catch { showNotification("Failed to export chart image.", "error"); }
  }, [chartId, item.data, item.type, showNotification]);

  const ChartToolbar = () => (
    <div className="absolute top-2 right-2 z-10 flex gap-1 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm p-1 rounded-lg border border-slate-200 dark:border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity">
      <button onClick={handleDownloadChartCsv} className="p-1 px-2 text-slate-500 hover:text-green-500 rounded hover:bg-slate-100 dark:hover:bg-slate-800" title="Export Data to CSV"><FontAwesomeIcon icon={faFileCsv} className="text-xs" /></button>
      <button onClick={handleDownloadSvg} className="p-1 px-2 text-slate-500 hover:text-blue-500 rounded hover:bg-slate-100 dark:hover:bg-slate-800" title="Export as SVG"><FontAwesomeIcon icon={faDownload} className="text-xs" /></button>
    </div>
  );

  return (
    <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 group relative">
      {(item.type === 'chart-bar' || item.type === 'chart-pie' || item.type === 'chart-line') && <ChartToolbar />}
      {item.type === 'chart-bar' && (
        <div id={chartId} className="h-[300px] w-full relative px-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={parsedData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis dataKey="name" fontSize={10} />
              <YAxis fontSize={10} />
              <ChartTooltip content={<CustomChartTooltip />} />
              <Legend />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {item.type === 'chart-pie' && (
        <div id={chartId} className="h-[350px] w-full relative px-2">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
              <Pie data={parsedData} cx="50%" cy="50%" labelLine={false} label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`} outerRadius={90} fill="#8884d8" dataKey="value">
                {parsedData.map((_: any, index: number) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
              </Pie>
              <ChartTooltip content={<CustomPieTooltip />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
      {item.type === 'chart-line' && (
        <div id={chartId} className="h-[300px] w-full relative px-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={parsedData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis dataKey="name" fontSize={10} />
              <YAxis fontSize={10} />
              <ChartTooltip content={<CustomChartTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {item.type === 'message' && <p className="text-slate-800 dark:text-slate-200 text-sm whitespace-pre-wrap">{parsedData}</p>}
      {item.type !== 'table' && item.type !== 'chart-bar' && item.type !== 'chart-pie' && item.type !== 'chart-line' && item.type !== 'message' && (
        <pre className="p-3 font-mono text-xs text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 rounded-lg overflow-auto">
          {JSON.stringify(parsedData, null, 2)}
        </pre>
      )}
    </div>
  );
};
