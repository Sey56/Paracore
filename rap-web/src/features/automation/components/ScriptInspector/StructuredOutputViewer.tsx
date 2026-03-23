import React, { useCallback, useId, useMemo, useRef, useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line
} from 'recharts';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { useUI } from '@/hooks/useUI';
import { save } from '@tauri-apps/api/dialog';
import { writeTextFile } from '@tauri-apps/api/fs';
import { faDownload, faFileCsv, faSort, faSortUp, faSortDown, faSearch, faUpload, faCopy, faChevronLeft, faChevronRight, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { trackEvent } from '@/utils/telemetry';

import { StructuredOutput, Script } from '@/types/scriptModel';
import { ExecutionResult } from '@/types/common';

interface StructuredOutputViewerProps {
  item: StructuredOutput;
  isDashboard?: boolean;
  capturedDocTitle: string | null;
  currentDocTitle: string | null;
  selectedScript: Script | null;
  executionResult: ExecutionResult | null;
}

const getChartColor = (index: number, total: number) => {
  if (total <= 1) return '#3b82f6';
  // Sequential span: Start at Blue (210) and wrap through the spectrum
  const hue = (210 + (index * (300 / (total - 1)))) % 360;
  return `hsl(${hue}, 65%, 55%)`;
};

const CustomChartTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-slate-900 shadow-2xl rounded-xl p-2 px-3 text-xs border-none">
        <p className="text-slate-500 dark:text-slate-400 font-medium m-0 mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-blue-600 dark:text-blue-400 font-bold m-0">
            {`${entry.dataKey || entry.name || 'value'} : ${entry.value}`}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const CustomPieTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-slate-900 shadow-2xl rounded-xl p-2 px-3 text-xs border-none">
        <p className="text-slate-700 dark:text-white font-bold m-0 mb-1">{payload[0].name}</p>
        <p className="text-blue-600 dark:text-blue-400 m-0">{`${payload[0].dataKey || 'value'} : ${payload[0].value}`}</p>
      </div>
    );
  }
  return null;
};

const renderColorfulLegendText = (value: string) => {
  return (
    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 ml-1 mr-4">
      {value}
    </span>
  );
};

// --- TableView: Viewport-Locked Scrolling Architecture ---

const VALID_UNITS = ['mm', 'cm', 'm', 'ft', 'in', 'm2', 'sqm', 'ft2', 'sqft', 'm3', 'cum', 'ft3', 'cuft'];

const beautifyHeader = (header: string) => {
  const match = header.match(/^(.*?)?\s*[[(_](.*?)[\])]?$/);
  if (match) {
    const possibleName = match[1].replace(/[_([]$/, '').trim();
    const possibleUnit = match[2].trim();
    if (VALID_UNITS.includes(possibleUnit.toLowerCase())) {
      return possibleName;
    }
  }
  return header;
};

const TableView: React.FC<{
  data: Record<string, unknown>[];
  onSelect: (ids: number[]) => void;
  onUpdate?: (elementId: number, parameterName: string, newValue: string) => Promise<boolean>;
  filterText: string;
  setFilterText: (t: string) => void;
}> = ({ data: initialData, onSelect, onUpdate, filterText, setFilterText }) => {
  const { showNotification } = useNotifications();
  const [data, setData] = useState(initialData);
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  // --- Virtualization State ---
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600); // Default fallback
  const rowHeight = 36; // Consistent height for calculation
  const overscan = 10; // Number of rows to render outside visible area

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
    const observer = new ResizeObserver(entries => {
      if (entries[0]) setContainerHeight(entries[0].contentRect.height);
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  // Cell editing state
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => { setData(initialData); }, [initialData]);

  // V5: FUNCTIONAL RESTORATION - Listen for batch updates from CSV import
  useEffect(() => {
    const handleBatchUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ updates: { element_id: number; parameter_name: string; new_value_string: string }[]; idKey: string }>;
      const { updates, idKey } = customEvent.detail;
      setData(prevData => {
        const updatedData = [...prevData];
        updates.forEach(upd => {
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

    window.addEventListener('paracore-table-updated', handleBatchUpdate as EventListener);
    return () => window.removeEventListener('paracore-table-updated', handleBatchUpdate as EventListener);
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
        const aStr = String(aVal ?? '').trim();
        const bStr = String(bVal ?? '').trim();
        const aNum = parseFloat(aStr);
        const bNum = parseFloat(bStr);
        const isANum = !isNaN(aNum) && isFinite(aNum);
        const isBNum = !isNaN(bNum) && isFinite(bNum);
        if (isANum && isBNum) return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
        return sortConfig.direction === 'asc' 
          ? aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' }) 
          : bStr.localeCompare(aStr, undefined, { numeric: true, sensitivity: 'base' });
      });
    }
    return result;
  }, [data, filterText, sortConfig]);

  // --- Virtualization Calculations ---
  const totalRows = filteredData.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan);
  const visibleData = filteredData.slice(startIndex, endIndex);
  const offsetY = startIndex * rowHeight;

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  return (
    <div className="flex flex-col w-full h-full min-w-0">
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 w-full min-h-0 overflow-auto bg-slate-50/5 dark:bg-black/5 custom-scrollbar relative"
      >
        <div style={{ height: totalRows * rowHeight, width: '100%', position: 'relative' }}>
          <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700 text-xs border-collapse absolute top-0 left-0" style={{ transform: `translateY(${offsetY}px)` }}>
            <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-30 shadow-sm" style={{ transform: `translateY(-${offsetY}px)` }}>
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
                      <div className="flex items-center space-x-1" onClick={() => {
                        let direction: 'asc' | 'desc' = 'asc';
                        if (sortConfig?.key === header && sortConfig.direction === 'asc') direction = 'desc';
                        setSortConfig({ key: header, direction });
                      }}>
                        <span className="truncate block">{beautifyHeader(header)}</span>
                        <span className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 shrink-0">
                          {sortConfig?.key === header ? (
                            sortConfig.direction === 'asc' ? <FontAwesomeIcon icon={faSortUp} /> : <FontAwesomeIcon icon={faSortDown} />
                          ) : (
                            <FontAwesomeIcon icon={faSort} className="opacity-0 group-hover:opacity-50" />
                          )}
                        </span>
                      </div>
                      <div onMouseDown={(e) => handleMouseDown(e, header)} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-600 transition-colors z-20" />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
              {visibleData.map((row: Record<string, unknown>, index: number) => {
                const rowIndex = startIndex + index;
                const idColKey = Object.keys(row).find(k => ['id', 'elementid', 'revitid', 'element id', 'revit id'].includes(k.toLowerCase()));
                const hasId = !!idColKey;
                const isActive = activeRowIndex === rowIndex;
                return (
                  <tr key={rowIndex} style={{ height: rowHeight }} className={`${hasId ? "transition-colors" : ""} ${isActive ? "bg-blue-100/50 dark:bg-blue-800/20 border-l-4 border-blue-500" : "hover:bg-blue-50/50 dark:hover:bg-blue-900/10"}`}>
                    {headers.map((header, colIndex) => {
                      const cellValue = row[header] !== null && row[header] !== undefined ? String(row[header]) : '';
                      const isIdColumn = ['id', 'elementid', 'revitid', 'element id', 'revit id'].includes(header.toLowerCase());
                      const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.colKey === header;
                      const canEdit = !isIdColumn && !!onUpdate && hasId;
                      const width = columnWidths[header];

                      return (
                        <td
                          key={colIndex}
                          style={{ width, minWidth: width }}
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
                              className="w-full h-full bg-white dark:bg-slate-800 border-b-2 border-blue-500 focus:outline-none text-slate-900 dark:text-slate-100 px-1"
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
                                    const originalDataIndex = data.findIndex(r => r === row);
                                    if (originalDataIndex !== -1) {
                                      updatedData[originalDataIndex] = { ...updatedData[originalDataIndex], [header]: editValue };
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
                            <div className="truncate">{cellValue}</div>
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
    </div>
  );
};

// --- Navigator Component ---

const Navigator: React.FC<{
  executionResult: ExecutionResult | null;
  activeAnalyticsSubTabIndex: number;
  handlePrev: () => void;
  handleNext: () => void;
}> = ({ executionResult, activeAnalyticsSubTabIndex, handlePrev, handleNext }) => {
  if (!executionResult?.structuredOutput || executionResult.structuredOutput.length <= 1) return null;
  const count = executionResult.structuredOutput.length;
  
  return (
    <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700/50 mr-2 shadow-sm">
      <button 
        onClick={(e) => { e.stopPropagation(); handlePrev(); }}
        className="text-slate-400 hover:text-blue-600 transition-colors p-0.5"
      >
        <FontAwesomeIcon icon={faChevronLeft} className="text-[9px]" />
      </button>
      <span className="text-[9px] font-black font-mono text-slate-500 dark:text-slate-400 min-w-[24px] text-center tracking-tighter cursor-default">
        {activeAnalyticsSubTabIndex + 1}/{count}
      </span>
      <button 
        onClick={(e) => { e.stopPropagation(); handleNext(); }}
        className="text-slate-400 hover:text-blue-600 transition-colors p-0.5"
      >
        <FontAwesomeIcon icon={faChevronRight} className="text-[9px]" />
      </button>
    </div>
  );
};

// --- Main Component ---

export const StructuredOutputViewer: React.FC<StructuredOutputViewerProps> = React.memo(({ 
  item, 
  isDashboard = false, 
  capturedDocTitle,
  currentDocTitle,
  selectedScript,
  executionResult
}) => {
  const { showNotification } = useNotifications();
  const chartId = useId().replace(/:/g, '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [filterText, setFilterText] = useState('');
  const { activeAnalyticsSubTabIndex, setActiveAnalyticsSubTabIndex } = useUI();
  const [isReady, setIsReady] = useState(false);
  
  // Definitive Recharts Dimension Fix
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reset readiness and dimensions when the item changes
    setIsReady(false);
    setDimensions({ width: 0, height: 0 });
    
    const timer = setTimeout(() => setIsReady(true), 400); 
    
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setDimensions({ width, height });
      }
    });

    if (chartContainerRef.current) observer.observe(chartContainerRef.current);
    
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [item.type, item.data, activeAnalyticsSubTabIndex]);

  const isDocMismatch = capturedDocTitle && currentDocTitle && capturedDocTitle !== currentDocTitle;
  
  const parsedData = useMemo(() => { 
    try { return JSON.parse(item.data); } catch { return undefined; } 
  }, [item.data]);

  const { tableData, filteredDataCount } = useMemo(() => {
    const parsed = (item.type === 'table') ? (parsedData === undefined ? [] : (Array.isArray(parsedData) ? parsedData : [parsedData])) : null;
    if (!parsed) return { tableData: null, filteredDataCount: 0 };
    
    if (!filterText) return { tableData: parsed, filteredDataCount: parsed.length };
    
    const lowerFilter = filterText.toLowerCase();
    const count = parsed.filter((row: Record<string, unknown>) => 
      Object.values(row).some(val => String(val ?? '').toLowerCase().includes(lowerFilter))
    ).length;
    
    return { tableData: parsed, filteredDataCount: count };
  }, [parsedData, item.type, filterText]);

  const chartKeys = useMemo(() => {
    if (!parsedData || !Array.isArray(parsedData) || parsedData.length === 0) return { xAxisKey: 'name', yAxisKey: 'value' };
    const firstRow = parsedData[0];
    const keys = Object.keys(firstRow);
    const yAxisKey = keys.find(k => typeof firstRow[k] === 'number') || 'value';
    const xAxisKey = keys.find(k => k !== yAxisKey) || 'name';
    return { xAxisKey, yAxisKey };
  }, [parsedData]);

  const handlePrev = useCallback(() => {
    if (!executionResult?.structuredOutput) return;
    const count = executionResult.structuredOutput.length;
    const nextIdx = (activeAnalyticsSubTabIndex - 1 + count) % count;
    setActiveAnalyticsSubTabIndex(nextIdx);
  }, [executionResult, activeAnalyticsSubTabIndex, setActiveAnalyticsSubTabIndex]);

  const handleNext = useCallback(() => {
    if (!executionResult?.structuredOutput) return;
    const count = executionResult.structuredOutput.length;
    const nextIdx = (activeAnalyticsSubTabIndex + 1) % count;
    setActiveAnalyticsSubTabIndex(nextIdx);
  }, [executionResult, activeAnalyticsSubTabIndex, setActiveAnalyticsSubTabIndex]);

  const NavigatorInternal = () => {
    return (
      <Navigator 
        executionResult={executionResult}
        activeAnalyticsSubTabIndex={activeAnalyticsSubTabIndex}
        handlePrev={handlePrev}
        handleNext={handleNext}
      />
    );
  };

  const paramMetadataMap = useMemo(() => {
    const map = new Map<string, { name: string; unit: string }>();
    if (!selectedScript?.parameters) return map;
    selectedScript.parameters.forEach(p => {
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
      if (!unit) {
        const match = parameterName.match(/^(.*?)?\s*[[(_](.*?)[\])]?$/);
        if (match) {
          const possibleName = match[1].replace(/[_([]$/, '').trim();
          const possibleUnit = match[2].trim();
          const VALID_UNITS = ['mm', 'cm', 'm', 'ft', 'in', 'm2', 'sqm', 'ft2', 'sqft', 'm3', 'cum', 'ft3', 'cuft'];
          if (VALID_UNITS.includes(possibleUnit.toLowerCase())) {
            realName = possibleName;
            unit = possibleUnit;
          }
        }
      }
      const response = await api.post('/api/update-element-parameter', { element_id: elementId, parameter_name: realName, new_value_string: newValue, unit });
      if (response.data?.is_success) { showNotification(`Updated ${realName}`, "success"); return true; }
      else { showNotification(`Update failed: ${response.data?.error_message || 'Unknown error'}`, "error"); return false; }
    } catch (error) { showNotification("Failed to update parameter in Revit.", "error"); return false; }
  }, [showNotification, paramMetadataMap]);

  const handleCopy = useCallback(() => {
    try {
      const parsed = JSON.parse(item.data);
      const data = Array.isArray(parsed) ? parsed : [parsed];
      if (data.length === 0) return;
      const textToCopy = [Object.keys(data[0]).join('\t'), ...data.map((row: Record<string, unknown>) => Object.values(row).map(v => String(v ?? '')).join('\t'))].join('\n');
      navigator.clipboard.writeText(textToCopy);
      showNotification('Table data copied to clipboard.', 'success');
    } catch { showNotification('Failed to copy table data.', 'error'); }
  }, [item.data, showNotification]);

  const handleDownloadCsv = useCallback(async () => {
    try {
      const parsed = JSON.parse(item.data);
      const data = Array.isArray(parsed) ? parsed : [parsed];
      if (data.length === 0) return;
      const csvContent = [Object.keys(data[0]).join(','), ...data.map((row: Record<string, unknown>) => Object.values(row).map((val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
      const filePath = await save({ filters: [{ name: 'CSV', extensions: ['csv'] }], defaultPath: `export_${new Date().toISOString().slice(0, 10)}.csv` });
      if (filePath) { await writeTextFile(filePath, csvContent); showNotification('CSV exported successfully!', 'success'); }
    } catch { showNotification("Failed to export CSV data.", "error"); }
  }, [item.data, showNotification]);

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
            const values = parseLine(line); const obj: Record<string, unknown> = {};
            headers.forEach((h, i) => { if (h) obj[h] = values[i] !== undefined ? values[i] : ""; });
            return obj;
          });
        };
        const importedData = parseCSV(text); 
        if (importedData.length === 0) return;
        trackEvent('mass_edit_csv_uploaded', { row_count: importedData.length });
        const currentData = JSON.parse(item.data);
        const tableData = Array.isArray(currentData) ? currentData : [currentData];
        if (tableData.length === 0) return;
        const idKey = Object.keys(tableData[0]).find(k => ['id', 'elementid', 'revitid', 'element id', 'revit id'].includes(k.toLowerCase())) || 'Id';
        const updates: { element_id: number; parameter_name: string; new_value_string: string; unit: string }[] = [];
        importedData.forEach(impRow => {
          const impId = parseInt(String(impRow[idKey] || '').replace(/,/g, ''), 10);
          const match = tableData.find(r => Number(r[idKey]) === impId);
          if (match) {
            Object.keys(impRow).forEach(col => {
              if (['id', 'elementid', 'revitid', 'element id', 'revit id'].includes(col.toLowerCase())) return;
              const meta = paramMetadataMap.get(col.toLowerCase()) || paramMetadataMap.get(col.replace(/\s+/g, '').toLowerCase());
              let realName = meta?.name || col;
              let unit = meta?.unit || "";
              if (!unit) {
                const match = col.match(/^(.*?)?\s*[[(_](.*?)[\])]?$/);
                if (match) {
                  const possibleName = match[1].replace(/[_([]$/, '').trim();
                  const possibleUnit = match[2].trim();
                  const VALID_UNITS = ['mm', 'cm', 'm', 'ft', 'in', 'm2', 'sqm', 'ft2', 'sqft', 'm3', 'cum', 'ft3', 'cuft'];
                  if (VALID_UNITS.includes(possibleUnit.toLowerCase())) { realName = possibleName; unit = possibleUnit; }
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


  // tableData, filteredDataCount and parsedData are now defined at the top of the component

  const handleDownloadChartCsv = useCallback(async () => {
    try {
      const data = Array.isArray(parsedData) ? parsedData : [parsedData];
      if (data.length === 0) return;
      const csvContent = [Object.keys(data[0]).join(','), ...data.map((row: Record<string, unknown>) => Object.values(row).map((val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
      const filePath = await save({ filters: [{ name: 'CSV', extensions: ['csv'] }], defaultPath: `chart_data_${new Date().toISOString().slice(0, 10)}.csv` });
      if (filePath) { await writeTextFile(filePath, csvContent); showNotification('Chart data exported as CSV.', 'success'); }
    } catch { showNotification("Failed to export CSV data.", "error"); }
  }, [parsedData, showNotification]);

  const handleDownloadSvg = useCallback(async () => {
    const container = document.getElementById(chartId);
    if (!container) return;
    try {
      const allSvgs = Array.from(container.querySelectorAll('svg')) as unknown as SVGSVGElement[];
      let originalSvg: SVGSVGElement | null = null;
      let maxArea = 0;
      for (const svg of allSvgs) {
        const rect = svg.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > maxArea) { maxArea = area; originalSvg = svg; }
      }
      if (!originalSvg || maxArea < 1000) { showNotification("Could not find the chart image to export.", "warning"); return; }
      const rect = originalSvg.getBoundingClientRect();
      const width = rect.width || parseFloat(originalSvg.getAttribute("width") || "0");
      const height = rect.height || parseFloat(originalSvg.getAttribute("height") || "0");
      if (!width || !height) { showNotification("Chart has no dimensions to export.", "warning"); return; }
      const clonedSvg = originalSvg.cloneNode(true) as SVGSVGElement;
      clonedSvg.setAttribute("width", width.toString());
      clonedSvg.setAttribute("height", height.toString());
      clonedSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      clonedSvg.style.overflow = "visible";
      const originalNodes = originalSvg.querySelectorAll('*');
      const clonedNodes = clonedSvg.querySelectorAll('*');
      const stylesToCopy = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'fill-opacity', 'opacity', 'font-family', 'font-size', 'font-weight', 'transform', 'transform-origin', 'visibility', 'display', 'stop-color', 'stop-opacity'];
      const rootComputed = window.getComputedStyle(originalSvg);
      stylesToCopy.forEach(s => { const v = rootComputed.getPropertyValue(s); if (v) clonedSvg.style.setProperty(s, v); });
      originalNodes.forEach((orig, idx) => {
        const clone = clonedNodes[idx];
        if (clone instanceof Element) {
          const comp = window.getComputedStyle(orig);
          stylesToCopy.forEach(s => {
            let v = comp.getPropertyValue(s);
            // V8 Enhancement: Force resolve currentColor to absolute values for browser compatibility
            if (v === 'currentColor') {
              const resolved = comp.color;
              if (resolved) v = resolved;
            }
            if (v && (clone instanceof HTMLElement || clone instanceof SVGElement)) {
              (clone as HTMLElement | SVGElement).style.setProperty(s, v);
            }
          });
        }
      });
      const padding = 20;
      const legendWrapper = container.querySelector('.recharts-legend-wrapper');
      const legendItems = legendWrapper ? Array.from(legendWrapper.querySelectorAll('.recharts-legend-item')) : [];
      let legendG: SVGGElement | null = null;
      let extraHeight = 0;
      if (legendWrapper && legendItems.length > 0) {
        const containerRect = container.getBoundingClientRect();
        const lWrapperRect = legendWrapper.getBoundingClientRect();
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
          const compIcon = iconEl ? window.getComputedStyle(iconEl) : null;
          const color = compIcon ? (compIcon.fill !== 'none' ? compIcon.fill : compIcon.stroke) : getChartColor(idx, legendItems.length);
          const label = textEl ? textEl.textContent : `Item ${idx}`;
          const itemG = document.createElementNS("http://www.w3.org/2000/svg", "g");
          itemG.setAttribute("transform", `translate(${itemRelX}, ${itemRelY})`);
          const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          r.setAttribute("width", "12"); r.setAttribute("height", "12");
          r.setAttribute("fill", color); r.setAttribute("rx", "2");
          itemG.appendChild(r);
          const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
          t.setAttribute("x", "18"); t.setAttribute("y", "10");
          t.setAttribute("font-family", "Inter, system-ui, sans-serif"); t.setAttribute("font-size", "11");
          t.setAttribute("fill", document.documentElement.classList.contains('dark') ? "#94a3b8" : "#64748b");
          t.textContent = label || '';
          itemG.appendChild(t);
          legendG!.appendChild(itemG);
        });
        if (wrapperRelY + lWrapperRect.height > height) { extraHeight = (wrapperRelY + lWrapperRect.height) - height; }
      }
      const wrapperSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const totalW = width + (padding * 2);
      const totalH = height + extraHeight + (padding * 2);
      wrapperSvg.setAttribute("width", totalW.toString());
      wrapperSvg.setAttribute("height", totalH.toString());
      wrapperSvg.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
      wrapperSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      
      // V8 Robust Background: Don't trust container background if it's transparent
      let bgColor = window.getComputedStyle(container).backgroundColor;
      if (!bgColor || bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
        bgColor = document.documentElement.classList.contains('dark') ? '#0f172a' : '#ffffff';
      }
      
      const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bgRect.setAttribute("x", "0"); bgRect.setAttribute("y", "0");
      bgRect.setAttribute("width", totalW.toString()); bgRect.setAttribute("height", totalH.toString()); 
      bgRect.setAttribute("fill", bgColor);
      wrapperSvg.appendChild(bgRect);
      
      const chartG = document.createElementNS("http://www.w3.org/2000/svg", "g");
      chartG.setAttribute("transform", `translate(${padding}, ${padding})`);
      chartG.appendChild(clonedSvg);
      wrapperSvg.appendChild(chartG);
      if (legendG) wrapperSvg.appendChild(legendG);
      const ser = new XMLSerializer();
      let src = ser.serializeToString(wrapperSvg);
      if (!src.match(/^<svg[^>]+"http:\/\/www\.w3\.org\/1999\/xlink"/)) { src = src.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"'); }
      const filePath = await save({ filters: [{ name: 'SVG', extensions: ['svg'] }], defaultPath: `chart_${item.type}_${new Date().toISOString().slice(0, 10)}.svg` });
      if (filePath) { await writeTextFile(filePath, src); showNotification('Chart exported as SVG.', 'success'); }
    } catch { showNotification("Failed to export chart image.", "error"); }
  }, [chartId, item.type, showNotification]);

  if (parsedData === undefined) return <pre className="p-3 text-xs text-red-600 bg-red-50 rounded-xl">Error: Invalid JSON.</pre>;

  return (
    <div className={`bg-white dark:bg-slate-900 group relative overflow-hidden flex flex-col ${isDashboard ? 'h-full rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm' : 'h-full'}`}>
      {/* Viewer Header */}
      <div className="flex items-center gap-2 p-2 border-b border-slate-100 dark:border-slate-800 shrink-0 min-h-[48px]">
        <div className="flex-grow min-w-0 flex items-center gap-3">
          {item.type === 'table' ? (
            <div className="relative w-full max-w-xl">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-[10px]" />
              </div>
              <input
                type="text"
                placeholder="Filter table..."
                className="pl-9 pr-20 block w-full text-[11px] h-8 border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 border transition-all"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
              />
              {tableData && (
                <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
                  <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 font-mono bg-slate-100/80 dark:bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-200/50 dark:border-slate-700/50 shadow-sm transition-all duration-200">
                    {filterText ? (
                      <span className="text-blue-600 dark:text-blue-400">
                        {filteredDataCount} of {tableData.length}
                      </span>
                    ) : (
                      tableData.length
                    )} rows x {Object.keys(tableData[0] || {}).length} cols
                  </span>
                </div>
              )}
            </div>
          ) : (
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 pl-2 shrink-0">
              {item.type === 'chart-bar' && 'Bar Graph'}
              {item.type === 'chart-pie' && 'Pie Graph'}
              {item.type === 'chart-line' && 'Line Graph'}
              {!['chart-bar', 'chart-pie', 'chart-line'].includes(item.type) && item.type.replace('chart-', '')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {item.type === 'table' && (
            <div className="flex gap-1">
              <button onClick={handleCopy} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg hover:text-blue-600 transition-colors" title="Copy Table"><FontAwesomeIcon icon={faCopy} className="text-xs" /></button>
              <button onClick={handleDownloadCsv} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg hover:text-green-500 transition-colors" title="Export CSV"><FontAwesomeIcon icon={faFileCsv} className="text-xs" /></button>
              <button onClick={() => fileInputRef.current?.click()} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg hover:text-blue-500 transition-colors" title="Upload CSV / Mass Edit"><FontAwesomeIcon icon={faUpload} className="text-xs" /></button>
            </div>
          )}
          {(item.type === 'chart-bar' || item.type === 'chart-pie' || item.type === 'chart-line') && (
            <div className="flex gap-1">
              <button onClick={handleDownloadChartCsv} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg hover:text-green-500 transition-colors" title="Export Data to CSV"><FontAwesomeIcon icon={faFileCsv} className="text-xs" /></button>
              <button onClick={handleDownloadSvg} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg hover:text-blue-500 transition-colors" title="Export as SVG"><FontAwesomeIcon icon={faDownload} className="text-xs" /></button>
            </div>
          )}
          <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1" />
          <NavigatorInternal />
        </div>
      </div>
      
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {item.type === 'table' && (
          <div className="flex-1 h-full w-full overflow-hidden">
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
            <TableView data={tableData || []} onSelect={handleSelectElements} onUpdate={handleUpdateParameter} filterText={filterText} setFilterText={setFilterText} />
          </div>
        )}

        {(item.type === 'chart-bar' || item.type === 'chart-pie' || item.type === 'chart-line') && (
          <div ref={chartContainerRef} id={chartId} className="flex-1 w-full min-h-[350px] relative px-2 py-2 overflow-hidden">
            <div className="absolute inset-0">
              {isReady && dimensions.width > 0 && dimensions.height > 0 && (
                <ResponsiveContainer key={`${item.type}-${activeAnalyticsSubTabIndex}`} width="99%" height="99%" debounce={50}>
                  {item.type === 'chart-bar' ? (
                    <BarChart data={parsedData} margin={{ top: 20, right: 30, left: 20, bottom: 35 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} vertical={false} />
                      <XAxis dataKey={chartKeys.xAxisKey} fontSize={10} tick={{ fill: 'currentColor', opacity: 0.7 }} interval={0} minTickGap={5} label={{ value: chartKeys.xAxisKey, position: 'insideBottom', offset: -25, fill: 'currentColor', fontSize: 11, opacity: 0.5 }} />
                      <YAxis fontSize={10} tick={{ fill: 'currentColor', opacity: 0.7 }} label={{ value: chartKeys.yAxisKey, angle: -90, position: 'insideLeft', offset: -10, fill: 'currentColor', fontSize: 11, opacity: 0.5 }} />
                      <ChartTooltip content={<CustomChartTooltip />} />
                      <Bar dataKey={chartKeys.yAxisKey} radius={[4, 4, 0, 0]} isAnimationActive={!isDashboard} fill="#3b82f6">
                        {parsedData.map((_: unknown, index: number) => (
                          <Cell key={`cell-${index}`} fill={getChartColor(index, parsedData.length)} />
                        ))}
                      </Bar>
                    </BarChart>
                  ) : item.type === 'chart-pie' ? (
                    <PieChart margin={{ top: 20, right: 20, left: 20, bottom: 20 }}>
                      <Pie 
                        data={parsedData} 
                        cx="50%" 
                        cy="50%" 
                        outerRadius="80%" 
                        fill="#8884d8" 
                        dataKey={chartKeys.yAxisKey}
                        nameKey={chartKeys.xAxisKey}
                        isAnimationActive={!isDashboard}
                      >
                        {parsedData.map((_: unknown, index: number) => <Cell key={`cell-${index}`} fill={getChartColor(index, parsedData.length)} />)}
                      </Pie>
                      <ChartTooltip content={<CustomPieTooltip />} />
                      <Legend iconType="square" iconSize={10} formatter={renderColorfulLegendText} />
                    </PieChart>
                  ) : (
                    <LineChart data={parsedData} margin={{ top: 20, right: 30, left: 20, bottom: 35 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
                      <XAxis dataKey={chartKeys.xAxisKey} fontSize={10} tick={{ fill: 'currentColor', opacity: 0.7 }} interval={0} minTickGap={5} label={{ value: chartKeys.xAxisKey, position: 'insideBottom', offset: -25, fill: 'currentColor', fontSize: 11, opacity: 0.5 }} />
                      <YAxis fontSize={10} tick={{ fill: 'currentColor', opacity: 0.7 }} label={{ value: chartKeys.yAxisKey, angle: -90, position: 'insideLeft', offset: -10, fill: 'currentColor', fontSize: 11, opacity: 0.5 }} />
                      <ChartTooltip content={<CustomChartTooltip />} />
                      <Line type="monotone" dataKey={chartKeys.yAxisKey} stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} isAnimationActive={!isDashboard} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}
        {item.type === 'message' && <p className="text-slate-800 dark:text-slate-200 text-sm whitespace-pre-wrap">{parsedData}</p>}
        {item.type !== 'table' && item.type !== 'chart-bar' && item.type !== 'chart-pie' && item.type !== 'chart-line' && item.type !== 'message' && (
          <pre className="p-3 font-mono text-xs text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 rounded-lg overflow-auto custom-scrollbar">
            {JSON.stringify(parsedData, null, 2)}
          </pre>
        )}
      </div>

      {/* Subtle Footer for Context */}
      {(executionResult?.scriptName || (item.type === 'table' && tableData)) && (
        <div className="px-4 py-1.5 border-t border-slate-100 dark:border-slate-800/50 bg-slate-50/30 dark:bg-slate-900/10 flex items-center shrink-0">
          <div className="flex-1 flex items-center gap-3">
            {executionResult?.scriptName && (
              <>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-600 select-none">Origin</span>
                <span className="text-[11px] font-bold italic text-slate-500 dark:text-slate-400 truncate max-w-[200px]">{executionResult.scriptName}</span>
              </>
            )}
            
            {capturedDocTitle && (
              <div className="flex items-center gap-3 border-l border-slate-200 dark:border-slate-800/40 pl-3">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-600 select-none">Document</span>
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold italic truncate max-w-[200px] ${isDocMismatch ? 'text-amber-600 dark:text-amber-500' : 'text-slate-500 dark:text-slate-400'}`}>
                    {capturedDocTitle}
                  </span>
                  {isDocMismatch && (
                    <div className="relative group/mismatch-footer translate-y-[1px]">
                      <span className="text-amber-500 cursor-help">
                        <FontAwesomeIcon icon={faExclamationTriangle} className="text-[10px] animate-pulse" />
                      </span>
                      <div className="absolute z-[130] left-1/2 -translate-x-1/2 bottom-full mb-2 p-3 rounded-xl shadow-2xl bg-white dark:bg-slate-900 text-slate-700 dark:text-white text-[10px] font-bold leading-relaxed w-56 opacity-0 invisible group-hover/mismatch-footer:opacity-100 group-hover/mismatch-footer:visible transition-all duration-300 transform translate-y-1 group-hover/mismatch-footer:translate-y-0 pointer-events-none border border-amber-500/20">
                        <div className="text-amber-500 dark:text-amber-400 mb-1 flex items-center gap-1.5 uppercase tracking-widest pb-1 border-b border-amber-500/10">
                          <FontAwesomeIcon icon={faExclamationTriangle} /> Document Mismatch
                        </div>
                        This output was rendered for <span className="text-blue-600 dark:text-blue-400">'{capturedDocTitle}'</span>.
                        <br />
                        The active document is now <span className="text-emerald-600 dark:text-emerald-400">'{currentDocTitle}'</span>.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          <div className="flex justify-center" />

          <div className="flex-1" />
        </div>
      )}
    </div>
  );
});

StructuredOutputViewer.displayName = 'StructuredOutputViewer';
