import React, { useCallback, useId, useMemo, useRef, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
import { faDownload, faFileCsv, faSort, faSortUp, faSortDown, faSearch, faUpload, faCopy, faChevronLeft, faChevronRight, faExclamationTriangle, faMagicWandSparkles, faLeaf, faTree } from '@fortawesome/free-solid-svg-icons';
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
  isHeaderPortalTarget?: boolean;
}

const MAX_CHART_ITEMS = 30;

const getChartColor = (index: number, total: number) => {
  if (total <= 1) return '#3b82f6';
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

const VALID_UNITS = ['mm', 'cm', 'm', 'ft', 'in', 'm2', 'sqm', 'ft2', 'sqft', 'm3', 'cum', 'ft3', 'cuft'];

const beautifyHeader = (header: string) => {
  let cleaned = header.replace(/_/g, ' ');
  // Check for bracketed units: "Length (cm)" or "Area [m2]"
  const match = cleaned.match(/^(.*?)?\s*[[(_](.*?)[\])]?$/);
  if (match) {
    const possibleName = match[1].replace(/[_([]$/, '').trim();
    const possibleUnit = match[2].trim();
    if (VALID_UNITS.includes(possibleUnit.toLowerCase())) {
      return possibleName;
    }
  }
  // Strip trailing unit word from underscore suffix (e.g. Top_Offset_cm → "Top Offset cm" → "Top Offset")
  const words = cleaned.split(' ');
  if (words.length > 1) {
    const lastWord = words[words.length - 1].toLowerCase();
    if (VALID_UNITS.includes(lastWord)) {
      return words.slice(0, -1).join(' ');
    }
  }
  return cleaned;
};

const renderCellContent = (header: string, value: any) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object' && !Array.isArray(value)) {
    const v = value as any;
    const xKey = Object.keys(v).find(k => k.toLowerCase() === 'x');
    const yKey = Object.keys(v).find(k => k.toLowerCase() === 'y');
    const zKey = Object.keys(v).find(k => k.toLowerCase() === 'z');
    if (xKey !== undefined && yKey !== undefined && zKey !== undefined) {
      const x = Number(v[xKey] ?? 0).toFixed(2);
      const y = Number(v[yKey] ?? 0).toFixed(2);
      const z = Number(v[zKey] ?? 0).toFixed(2);
      return (
        <span className="font-mono text-[10px] text-blue-500/80 bg-blue-500/5 px-1.5 py-0.5 rounded border border-blue-500/10 shadow-sm">
          ({x}, {y}, {z})
        </span>
      );
    }
    try {
      return (
        <span className="text-[10px] opacity-40 font-mono italic">
           {JSON.stringify(value).substring(0, 30)}{JSON.stringify(value).length > 30 ? '...' : ''}
        </span>
      );
    } catch { return '[Object]'; }
  }
  const cellValue = String(value);
  const normalized = header.toLowerCase().replace(/[\s_]+/g, '');
  if (normalized.includes('volume')) {
    const val = parseFloat(cellValue);
    if (!isNaN(val)) return val === 0 ? "0" : val < 0.01 ? val.toFixed(4) : val.toFixed(2);
  }
  if (normalized === 'carbon' || normalized === 'embodiedcarbon' || normalized === 'gwp') {
    const val = parseFloat(cellValue);
    if (!isNaN(val)) {
      let color = 'text-emerald-600 dark:text-emerald-400';
      if (val > 100) color = 'text-amber-600 dark:text-amber-400';
      if (val > 500) color = 'text-rose-600 dark:text-rose-400';
      return <span className={`font-bold ${color} flex items-center gap-1`}>{val.toLocaleString()} <span className="text-[9px] opacity-60 font-medium uppercase tracking-tighter">kgCO2e</span></span>;
    }
  }
  if (normalized === 'uvalue' || normalized === 'u-value' || normalized === 'heattransfercoefficient') {
    const val = parseFloat(cellValue);
    if (!isNaN(val)) {
      let color = 'text-emerald-600 dark:text-emerald-400';
      if (val > 0.35) color = 'text-amber-600 dark:text-amber-400';
      if (val > 1.2) color = 'text-rose-600 dark:text-rose-400';
      return <span className={`font-bold ${color} flex items-center gap-1`}>{val.toFixed(3)}<span className="text-[9px] opacity-60 font-medium uppercase tracking-tighter">W/m²K</span></span>;
    }
  }
  if (normalized === 'heatloss' || normalized === 'energy' || normalized === 'qvalue' || normalized === 'heatload') {
    const val = parseFloat(cellValue);
    if (!isNaN(val)) return <span className="font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">{val.toLocaleString()}<span className="text-[9px] opacity-60 font-medium uppercase tracking-tighter">Watts</span></span>;
  }
  return cellValue;
};

const TableView: React.FC<{
  data: Record<string, unknown>[];
  onSelect: (ids: number[]) => void;
  onUpdate?: (elementId: number, parameterName: string, newValue: string) => Promise<boolean>;
  filterText: string;
  setFilterText: (t: string) => void;
  onFilteredDataChange?: (data: Record<string, unknown>[]) => void;
}> = ({ data: initialData, onSelect, onUpdate, filterText, setFilterText, onFilteredDataChange }) => {
  const { showNotification } = useNotifications();
  const [data, setData] = useState(initialData);
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);
  const [activeElementId, setActiveElementId] = useState<number | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);
  const rowHeight = 36;
  const overscan = 10;
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
    const observer = new ResizeObserver(entries => { if (entries[0]) setContainerHeight(entries[0].contentRect.height); });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => { observer.disconnect(); document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
  }, [handleMouseMove, handleMouseUp]);

  const [editingCell, setEditingCell] = useState<{ rowIndex: number; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  useEffect(() => { setData(initialData); }, [initialData]);

  useEffect(() => {
    const handleBatchUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ updates: { element_id: number; parameter_name: string; new_value_string: string }[]; idKey: string }>;
      const { updates, idKey } = customEvent.detail;
      setData(prevData => {
        const updatedData = [...prevData];
        updates.forEach(upd => {
          const idx = updatedData.findIndex(r => (typeof r[idKey] === 'string' ? parseInt(r[idKey], 10) : Number(r[idKey])) === upd.element_id);
          if (idx !== -1) updatedData[idx] = { ...updatedData[idx], [upd.parameter_name]: upd.new_value_string };
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
        const aVal = a[sortConfig.key]; const bVal = b[sortConfig.key];
        const aStr = String(aVal ?? '').trim(); const bStr = String(bVal ?? '').trim();
        const aNum = parseFloat(aStr); const bNum = parseFloat(bStr);
        if (!isNaN(aNum) && isFinite(aNum) && !isNaN(bNum) && isFinite(bNum)) return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
        return sortConfig.direction === 'asc' ? aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' }) : bStr.localeCompare(aStr, undefined, { numeric: true, sensitivity: 'base' });
      });
    }
    return result;
  }, [data, filterText, sortConfig]);

  useEffect(() => { if (onFilteredDataChange) onFilteredDataChange(filteredData); }, [filteredData, onFilteredDataChange]);
  const totalRows = filteredData.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan);
  const visibleData = filteredData.slice(startIndex, endIndex);
  const offsetY = startIndex * rowHeight;
  return (
    <div className="flex flex-col w-full h-full min-w-0">
      <div ref={containerRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} className="flex-1 w-full min-h-0 overflow-auto bg-slate-50/5 dark:bg-black/5 custom-scrollbar relative">
        <div style={{ height: totalRows * rowHeight, width: '100%', position: 'relative' }}>
          <table className="min-w-full text-xs border-collapse absolute top-0 left-0" style={{ transform: `translateY(${offsetY}px)` }}>
            <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-30 shadow-sm border-b border-slate-200 dark:border-slate-700/50" style={{ transform: `translateY(-${offsetY}px)` }}>
              <tr>
                {headers.map((header, index) => {
                  const width = columnWidths[header] || (header.toLowerCase() === 'id' ? 80 : 150);
                  return (
                    <th key={index} style={{ width, minWidth: width }} className="relative px-3 py-2.5 text-left font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 select-none group">
                      <div className="flex items-center space-x-1" onClick={() => setSortConfig({ key: header, direction: sortConfig?.key === header && sortConfig.direction === 'asc' ? 'desc' : 'asc' })}>
                        <span className="truncate block">{beautifyHeader(header)}</span>
                        <span className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 shrink-0">{sortConfig?.key === header ? (sortConfig.direction === 'asc' ? <FontAwesomeIcon icon={faSortUp} /> : <FontAwesomeIcon icon={faSortDown} />) : <FontAwesomeIcon icon={faSort} className="opacity-0 group-hover:opacity-50" />}</span>
                      </div>
                      <div onMouseDown={(e) => handleMouseDown(e, header)} className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-600 transition-colors z-20" />
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900">
              {visibleData.map((row, index) => {
                                const rowIndex = startIndex + index; 
                const hasId = Object.keys(row).some(k => {
                  const l = k.toLowerCase();
                  return l === 'id' || l === 'elementid' || l === 'revitid' || (l.endsWith('id') && l.length > 2);
                });

                return (
                  <tr key={rowIndex} style={{ height: rowHeight }} className={`${hasId ? "transition-colors" : ""} ${activeRowIndex === rowIndex ? "bg-blue-100/50 dark:bg-blue-800/20 border-l-4 border-blue-500" : `hover:bg-blue-50/50 dark:hover:bg-blue-900/10 ${rowIndex % 2 === 1 ? 'bg-black/[0.02] dark:bg-white/[0.02]' : ''}`}`}>
                    {headers.map((header, colIndex) => {
                      const cellValue = row[header] !== null && row[header] !== undefined ? String(row[header]) : '';
                                            const lHeader = header.toLowerCase();
                      const isIdCol = ['id', 'elementid', 'revitid'].includes(lHeader) || (lHeader.endsWith('id') && lHeader.length > 2);

                      const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.colKey === header;
                      return (
                         <td key={colIndex} style={{ width: columnWidths[header], minWidth: columnWidths[header] }} className={`px-3 py-2 whitespace-nowrap text-slate-700 dark:text-slate-300 transition-all duration-200 ${!isIdCol && !!onUpdate && hasId ? 'cursor-pointer hover:bg-white/50 dark:hover:bg-black/20' : ''} ${isIdCol ? 'font-mono font-bold cursor-pointer relative group/cell' : ''} ${isIdCol && activeElementId === Number(cellValue) && activeRowIndex === rowIndex ? 'text-white bg-blue-600 shadow-[inset_0_0_10px_rgba(0,0,0,0.1)]' : isIdCol ? 'text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:bg-blue-500/10' : ''} ${isUpdating && isEditing ? 'opacity-50' : ''}`}
                           onClick={() => { if (isIdCol && !isNaN(Number(cellValue))) { setActiveRowIndex(rowIndex); setActiveElementId(Number(cellValue)); onSelect([Number(cellValue)]); } }}
                           onDoubleClick={() => { if (!isIdCol && !!onUpdate && hasId) { setEditingCell({ rowIndex, colKey: header }); setEditValue(cellValue); } }}
                        >
                                                    {isEditing ? <input autoFocus className="w-full h-full bg-white dark:bg-slate-800 border-b-2 border-blue-500 focus:outline-none text-slate-900 dark:text-slate-100 px-1" value={editValue} onChange={(e) => setEditValue(e.target.value)} onBlur={async () => { 
                            if (editValue !== cellValue && hasId && onUpdate) { 
                              const idKey = Object.keys(row).find(k => {
                                const l = k.toLowerCase();
                                return l === 'id' || l === 'elementid' || l === 'revitid' || (l.endsWith('id') && l.length > 2);
                              }) || 'Id';
                              const id = Number(row[idKey]); 
                              setIsUpdating(true); 
                              if (await onUpdate(id, header, editValue)) { 
                                const updatedData = [...data]; 
                                updatedData[data.findIndex(r => r === row)] = { ...row, [header]: editValue }; 
                                setData(updatedData); 
                              } else setEditValue(cellValue); 
                              setIsUpdating(false); 
                            } 
                            setEditingCell(null); 
                          }} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); else if (e.key === 'Escape') setEditingCell(null); }} disabled={isUpdating} /> : <div className="truncate">{renderCellContent(header, row[header])}</div>}

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

const Navigator: React.FC<{ executionResult: ExecutionResult | null; activeAnalyticsSubTabIndex: number; handlePrev: () => void; handleNext: () => void; }> = ({ executionResult, activeAnalyticsSubTabIndex, handlePrev, handleNext }) => {
  if (!executionResult?.structuredOutput || executionResult.structuredOutput.length <= 1) return null;
  return <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-800/80 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700/50 mr-2 shadow-sm"><button onClick={(e) => { e.stopPropagation(); handlePrev(); }} className="text-slate-400 hover:text-blue-600 transition-colors p-0.5" title="Previous View"><FontAwesomeIcon icon={faChevronLeft} className="text-[9px]" /></button><span className="text-[9px] font-black font-mono text-slate-500 dark:text-slate-400 min-w-[24px] text-center tracking-tighter cursor-default">{activeAnalyticsSubTabIndex + 1}/{executionResult.structuredOutput.length}</span><button onClick={(e) => { e.stopPropagation(); handleNext(); }} className="text-slate-400 hover:text-blue-600 transition-colors p-0.5" title="Next View"><FontAwesomeIcon icon={faChevronRight} className="text-[9px]" /></button></div>;
};

export const StructuredOutputViewer: React.FC<StructuredOutputViewerProps> = React.memo(({ item, isDashboard = false, capturedDocTitle, currentDocTitle, selectedScript, executionResult, isHeaderPortalTarget = false }) => {
  const { showNotification } = useNotifications();
  const chartId = useId().replace(/:/g, '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [currentFilteredData, setCurrentFilteredData] = useState<Record<string, unknown>[]>([]);
  const { activeAnalyticsSubTabIndex, setActiveAnalyticsSubTabIndex } = useUI();
  const [isReady, setIsReady] = useState(false);
  const [showAsTable, setShowAsTable] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsReady(false); setDimensions({ width: 0, height: 0 }); const timer = setTimeout(() => setIsReady(true), 400); 
    const observer = new ResizeObserver(entries => { const { width, height } = entries[0].contentRect; if (width > 0 && height > 0) setDimensions({ width, height }); });
    if (chartContainerRef.current) observer.observe(chartContainerRef.current);
    return () => { clearTimeout(timer); observer.disconnect(); };
  }, [item.type, item.data, activeAnalyticsSubTabIndex]);

  const isDocMismatch = capturedDocTitle && currentDocTitle && capturedDocTitle !== currentDocTitle;
  const parsedData = useMemo(() => { try { return JSON.parse(item.data); } catch { return undefined; } }, [item.data]);
  const effectiveType = showAsTable ? 'table' : item.type;
  const isSustainData = useMemo(() => item.data && ['carbon', 'uvalue', 'u-value', 'gwp', 'heatloss', 'energy'].some(h => item.data.toLowerCase().includes(`"${h}"`)), [item.data]);
  const { tableData, filteredDataCount } = useMemo(() => {
    const isActuallyTable = effectiveType === 'table' || effectiveType.startsWith('chart-');
    const parsed = isActuallyTable ? (parsedData === undefined ? [] : (Array.isArray(parsedData) ? parsedData : [parsedData])) : null;
    if (!parsed) return { tableData: null, filteredDataCount: 0 };
    if (!filterText) return { tableData: parsed, filteredDataCount: parsed.length };
    const lowerFilter = filterText.toLowerCase();
    const count = parsed.filter((row: any) => Object.values(row).some(val => String(val ?? '').toLowerCase().includes(lowerFilter))).length;
    return { tableData: parsed, filteredDataCount: count };
  }, [parsedData, effectiveType, filterText]);

  const chartKeys = useMemo(() => {
    if (!parsedData || !Array.isArray(parsedData) || parsedData.length === 0) return { xAxisKey: 'name', yAxisKey: 'value' };
    const firstRow = parsedData[0]; const keys = Object.keys(firstRow);
    const numericKeys = keys.filter(k => typeof firstRow[k] === 'number');
    // Prefer "Total" over "Count" so GroupByParam(name, sum, unit) charts show the sum
    const yAxisKey = numericKeys.find(k => /total/i.test(k))
        || numericKeys.find(k => !/count/i.test(k))
        || numericKeys[0]
        || 'value';
    const xAxisKey = keys.find(k => k !== yAxisKey && typeof firstRow[k] !== 'number')
        || keys.find(k => k !== yAxisKey)
        || 'name';
    return { xAxisKey, yAxisKey };
  }, [parsedData]);

  const handlePrev = useCallback(() => { if (!executionResult?.structuredOutput) return; const count = executionResult.structuredOutput.length; setActiveAnalyticsSubTabIndex((activeAnalyticsSubTabIndex - 1 + count) % count); }, [executionResult, activeAnalyticsSubTabIndex, setActiveAnalyticsSubTabIndex]);
  const handleNext = useCallback(() => { if (!executionResult?.structuredOutput) return; setActiveAnalyticsSubTabIndex((activeAnalyticsSubTabIndex + 1) % executionResult.structuredOutput.length); }, [executionResult, activeAnalyticsSubTabIndex, setActiveAnalyticsSubTabIndex]);
  const paramMetadataMap = useMemo(() => { const map = new Map<string, { name: string; unit: string }>(); selectedScript?.parameters?.forEach(p => { const cleanId = p.name.replace(/[\s_]+/g, '').toLowerCase(); map.set(cleanId, { name: p.name, unit: p.unit || "" }); map.set(p.name.toLowerCase(), { name: p.name, unit: p.unit || "" }); }); return map; }, [selectedScript]);
  const handleSelectElements = useCallback(async (ids: number[]) => { try { await api.post('/api/select-elements', { element_ids: ids }); } catch (error) { showNotification("Failed to select elements in Revit.", "error"); } }, [showNotification]);
  const handleUpdateParameter = useCallback(async (elementId: number, parameterName: string, newValue: string) => {
    try {
      const cleanSearch = parameterName.replace(/[\s_]+/g, '').toLowerCase(); const meta = paramMetadataMap.get(parameterName.toLowerCase()) || paramMetadataMap.get(cleanSearch);
      let realName = meta?.name || parameterName.replace(/_/g, ' '); let unit = meta?.unit || "";
      if (!unit) {
        // Strip bracketed unit: "Area (m2)" → "Area", unit="m2"
        const match = realName.match(/^(.*?)?\s*[[(_](.*?)[\])]?$/);
        if (match) {
          const possibleName = match[1].replace(/[_([]$/, '').trim();
          const possibleUnit = match[2].trim();
          if (VALID_UNITS.includes(possibleUnit.toLowerCase())) { realName = possibleName; unit = possibleUnit; }
        }
        // Strip trailing unit word: "Top Offset cm" → "Top Offset"
        if (!unit) {
          const words = realName.split(' ');
          if (words.length > 1) {
            const lastWord = words[words.length - 1].toLowerCase();
            if (VALID_UNITS.includes(lastWord)) { realName = words.slice(0, -1).join(' '); unit = lastWord; }
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
      const parsed = JSON.parse(item.data); let data = currentFilteredData && currentFilteredData.length > 0 ? currentFilteredData : (Array.isArray(parsed) ? parsed : [parsed]); if (data.length === 0) return;
      if (filterText && (!currentFilteredData || currentFilteredData.length === 0)) { const lowerFilter = filterText.toLowerCase(); data = data.filter((row: any) => Object.values(row).some(val => String(val ?? '').toLowerCase().includes(lowerFilter))); }
      if (data.length === 0) { showNotification('No data matches the current filter.', 'warning'); return; }
      const textToCopy = [Object.keys(data[0]).join('\t'), ...data.map((row: any) => Object.keys(data[0]).map(header => {
        const val = row[header]; if (val === null || val === undefined) return ''; if (typeof val === 'object' && !Array.isArray(val)) return JSON.stringify(val);
        const lowerHeader = header.toLowerCase(); if (typeof val === 'number' || (!isNaN(Number(val)) && String(val).trim() !== '')) { const n = Number(val); if (lowerHeader === 'id' || Number.isInteger(n)) return n.toString(); return lowerHeader.includes('volume') ? n.toFixed(4) : n.toFixed(3); }
        return String(val);
      }).join('\t'))].join('\n');
      navigator.clipboard.writeText(textToCopy); showNotification('Table data copied to clipboard.', 'success');
    } catch { showNotification('Failed to copy table data.', 'error'); }
  }, [item.data, filterText, showNotification, currentFilteredData]);

  const handleDownloadCsv = useCallback(async () => {
    try {
      const parsed = JSON.parse(item.data); let data = currentFilteredData && currentFilteredData.length > 0 ? currentFilteredData : (Array.isArray(parsed) ? parsed : [parsed]); if (data.length === 0) return;
      const headers = Object.keys(data[0]); const csvContent = [headers.join(','), ...data.map((row: any) => headers.map(header => {
        const val = row[header]; let s = ''; if (val !== null && val !== undefined) { if (typeof val === 'object' && !Array.isArray(val)) s = JSON.stringify(val); else { const n = Number(val); if (!isNaN(n) && String(val).trim() !== '') { if (header.toLowerCase() === 'id' || Number.isInteger(n)) s = n.toString(); else s = header.toLowerCase().includes('volume') ? n.toFixed(4) : n.toFixed(3); } else s = String(val); } }
        return `"${s.replace(/"/g, '""')}"`;
      }).join(','))].join('\n');
      const filePath = await save({ filters: [{ name: 'CSV', extensions: ['csv'] }], defaultPath: `export_${new Date().toISOString().slice(0, 10)}.csv` });
      if (filePath) { await writeTextFile(filePath, csvContent); showNotification('CSV exported successfully!', 'success'); }
    } catch { showNotification("Failed to export CSV data.", "error"); }
  }, [item.data, filterText, showNotification, currentFilteredData]);

  const onFileChange = async (e: any) => {
    const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let text = event.target?.result as string; if (!text) return; if (text.startsWith('\uFEFF')) text = text.substring(1);
        const parseLine = (line: string) => { const result = []; let curr = ""; let inQuotes = false; for (let i = 0; i < line.length; i++) { const char = line[i]; if (char === '"') { if (inQuotes && line[i + 1] === '"') { curr += '"'; i++; } else inQuotes = !inQuotes; } else if (char === ',' && !inQuotes) { result.push(curr.trim()); curr = ""; } else curr += char; } result.push(curr.trim()); return result; };
        const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim() !== ""); if (lines.length < 2) return;
        const headers = parseLine(lines[0]); const importedData = lines.slice(1).map(line => { const values = parseLine(line); const obj: any = {}; headers.forEach((h, i) => { if (h) obj[h] = values[i] !== undefined ? values[i] : ""; }); return obj; });
        const currentData = JSON.parse(item.data); const tableData = Array.isArray(currentData) ? currentData : [currentData]; if (tableData.length === 0) return;
                const idKey = Object.keys(tableData[0]).find(k => {
          const l = k.toLowerCase();
          return l === 'id' || l === 'elementid' || l === 'revitid' || (l.endsWith('id') && l.length > 2);
        }) || 'Id';

        const updates: any[] = []; importedData.forEach(impRow => {
          const impId = parseInt(String(impRow[idKey] || '').replace(/,/g, ''), 10); const match = tableData.find(r => Number(r[idKey]) === impId);
          if (match) { Object.keys(impRow).forEach(col => { if (['id', 'elementid', 'revitid'].includes(col.toLowerCase())) return; const cleanColName = col.replace(/[\s_]+/g, '').toLowerCase(); const meta = paramMetadataMap.get(col.toLowerCase()) || paramMetadataMap.get(cleanColName); let realName = meta?.name || col.replace(/_/g, ' '); let unit = meta?.unit || ""; if (!unit) { const m = realName.match(/^(.*?)?\s*[[(_](.*?)[\])]?$/); if (m) { const pn = m[1].replace(/[_([]$/, '').trim(); const pu = m[2].trim(); if (VALID_UNITS.includes(pu.toLowerCase())) { realName = pn; unit = pu; } } } if (String(impRow[col]) !== String(match[col])) updates.push({ element_id: impId, parameter_name: realName, new_value_string: String(impRow[col]), unit }); }); }
        });
        if (updates.length > 0) { setIsUpdating(true); const res = await api.post("/api/batch-update-element-parameters", { updates }); setIsUpdating(false); if (res.data.is_success) { showNotification(`Updated ${res.data.count} parameters.`, "success"); window.dispatchEvent(new CustomEvent('paracore-table-updated', { detail: { updates, idKey } })); } } else showNotification("No changes detected in CSV.", "info");
      } catch { setIsUpdating(false); showNotification("CSV processing failed.", "error"); }
    };
    reader.readAsText(file); e.target.value = "";
  };

  const handleDownloadChartCsv = useCallback(async () => { try { const data = Array.isArray(parsedData) ? parsedData : [parsedData]; if (data.length === 0) return; const csvContent = [Object.keys(data[0]).join(','), ...data.map((row: any) => Object.values(row).map((val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`).join(','))].join('\n'); const filePath = await save({ filters: [{ name: 'CSV', extensions: ['csv'] }], defaultPath: `chart_data_${new Date().toISOString().slice(0, 10)}.csv` }); if (filePath) { await writeTextFile(filePath, csvContent); showNotification('Chart data exported as CSV.', 'success'); } } catch { showNotification("Failed to export CSV data.", "error"); } }, [parsedData, showNotification]);
  
  const handleDownloadSvg = useCallback(async () => {
    const container = document.getElementById(chartId);
    if (!container) return;
    try {
      const allSvgs = Array.from(container.querySelectorAll('svg'));
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
      const width = rect.width || parseFloat(originalSvg.getAttribute("width") || "0");
      const height = rect.height || parseFloat(originalSvg.getAttribute("height") || "0");
      
      if (!width || !height) {
        showNotification("Chart has no dimensions to export.", "warning");
        return;
      }

      const clonedSvg = originalSvg.cloneNode(true) as SVGSVGElement;
      clonedSvg.setAttribute("width", width.toString());
      clonedSvg.setAttribute("height", height.toString());
      clonedSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      clonedSvg.style.overflow = "visible";

      // 🎯 Styles to copy from computed to inline
      const stylesToCopy = [
        'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity',
        'fill-opacity', 'opacity', 'font-family', 'font-size', 'font-weight',
        'transform', 'transform-origin', 'visibility', 'display', 'stop-color',
        'stop-opacity', 'text-anchor', 'dominant-baseline', 'alignment-baseline',
        'color', 'shape-rendering'
      ];

      const copyStyles = (source: Element, target: HTMLElement | SVGElement) => {
        const comp = window.getComputedStyle(source);
        const tagName = source.tagName.toLowerCase();
        stylesToCopy.forEach(s => {
          let v = comp.getPropertyValue(s);
          
          if (v === 'currentColor') {
            v = comp.color;
          }
          
          if (s === 'fill' && (!v || v === 'none' || v === 'rgba(0, 0, 0, 0)') && (tagName === 'text' || tagName === 'tspan')) {
            v = comp.color;
          }

          if (s === 'stroke' && (v === 'none' || !v) && (tagName === 'line' || tagName === 'path')) {
             const sw = comp.strokeWidth;
             if (sw && sw !== '0px' && !source.classList.contains('recharts-rectangle')) {
                v = comp.color;
             }
          }

          if (v && v !== 'none') target.style.setProperty(s, v);
        });
      };

      // 🎨 Step 1: Copy styles to all cloned elements BEFORE adding background (to keep indices aligned)
      const originalNodes = Array.from(originalSvg.querySelectorAll('*'));
      const clonedNodes = Array.from(clonedSvg.querySelectorAll('*'));
      
      copyStyles(originalSvg, clonedSvg);
      originalNodes.forEach((orig, idx) => {
        const clone = clonedNodes[idx] as HTMLElement;
        if (clone && clone.style) {
          copyStyles(orig, clone);
        }
      });

      // 🎨 Step 2: Handle Legends (which are HTML and must be manually reconstructed into SVG)
      const padding = 20;
      const legendWrapper = container.querySelector('.recharts-legend-wrapper');
      const legendItems = legendWrapper ? Array.from(legendWrapper.querySelectorAll('.recharts-legend-item')) : [];
      let legendG: SVGGElement | null = null;
      let extraHeight = 0;

      if (legendWrapper && legendItems.length > 0) {
        const containerRect = container.getBoundingClientRect();
        const lWrapperRect = legendWrapper.getBoundingClientRect();
        
        // Use relative positions to recreate the legend exactly where it is on screen
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
          
          // Resolve legend icon color from actual computed styles (handles themes)
          const color = compIcon ? (compIcon.fill !== 'none' && compIcon.fill !== 'rgba(0, 0, 0, 0)' ? compIcon.fill : compIcon.stroke) : getChartColor(idx, legendItems.length);
          const label = textEl ? textEl.textContent : `Item ${idx}`;

          const itemG = document.createElementNS("http://www.w3.org/2000/svg", "g");
          itemG.setAttribute("transform", `translate(${itemRelX}, ${itemRelY})`);

          // 🔲 Create the rectangular legend icon
          const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
          r.setAttribute("width", "12"); 
          r.setAttribute("height", "12");
          r.setAttribute("fill", color); 
          r.setAttribute("rx", "2");
          itemG.appendChild(r);

          // 🔤 Create the legend text
          const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
          t.setAttribute("x", "18"); 
          t.setAttribute("y", "10");
          t.setAttribute("font-family", "Inter, system-ui, sans-serif"); 
          t.setAttribute("font-size", "11");
          t.setAttribute("font-weight", "600");
          
          // Use theme-aware text color
          const compText = textEl ? window.getComputedStyle(textEl) : null;
          t.setAttribute("fill", compText ? compText.color : (document.documentElement.classList.contains('dark') ? "#94a3b8" : "#64748b"));
          t.textContent = label || '';
          itemG.appendChild(t);

          legendG!.appendChild(itemG);
        });

        // If legend is below the chart, we need to expand the wrapper height
        if (wrapperRelY + lWrapperRect.height > height) { 
          extraHeight = (wrapperRelY + lWrapperRect.height) - height; 
        }      
      }

      // 🎨 Step 3: Create the final wrapper SVG that holds background, chart, and legend
      const wrapperSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const totalW = width + (padding * 2);
      const totalH = height + extraHeight + (padding * 2);
      wrapperSvg.setAttribute("width", totalW.toString());
      wrapperSvg.setAttribute("height", totalH.toString());
      wrapperSvg.setAttribute("viewBox", `0 0 ${totalW} ${totalH}`);
      wrapperSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

      // Resolve final background color
      let bgColor = 'transparent';
      let currEl: HTMLElement | null = container;
      while (currEl && (bgColor === 'transparent' || bgColor === 'rgba(0, 0, 0, 0)')) {
        bgColor = window.getComputedStyle(currEl).backgroundColor;
        currEl = currEl.parentElement;
      }
      if (bgColor === 'transparent' || bgColor === 'rgba(0, 0, 0, 0)') {
        bgColor = document.documentElement.classList.contains('dark') ? '#0f172a' : '#ffffff';
      }

      const bgRect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bgRect.setAttribute("width", "100%"); 
      bgRect.setAttribute("height", "100%");
      bgRect.setAttribute("fill", bgColor);
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

      const filePath = await save({
        filters: [{ name: 'SVG', extensions: ['svg'] }],
        defaultPath: `chart_${item.type}_${new Date().toISOString().slice(0, 10)}.svg`
      });
      if (filePath) {
        await writeTextFile(filePath, src);
        showNotification('Chart exported as SVG.', 'success');
      }
    } catch (err) {
      console.error("SVG Export Error:", err);
      showNotification("Failed to export chart image.", "error");
    }
  }, [chartId, item.type, showNotification, getChartColor]);

  const headerControls = (
    <div className="flex items-center gap-4 w-full tooltip-bottom">
      <div className="flex-grow flex items-center gap-3 min-w-0">
        {effectiveType === 'table' ? (
          <div className="relative w-full max-w-2xl">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400"><FontAwesomeIcon icon={faSearch} className="text-[10px]" /></div>
            <input type="text" placeholder="Filter table..." className="pl-8 block w-full text-[11px] h-8 border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500/20 border transition-all" value={filterText} onChange={(e) => setFilterText(e.target.value)} />
          </div>
        ) : (
          <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 shrink-0 flex items-center gap-2">
            {isSustainData && <FontAwesomeIcon icon={faLeaf} className="text-emerald-500" />}
            {effectiveType === 'chart-bar' ? 'Bar Graph' : effectiveType === 'chart-pie' ? 'Pie Graph' : effectiveType === 'chart-line' ? 'Line Graph' : effectiveType.replace('chart-', '')}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {effectiveType === 'table' ? (
          <div className="flex gap-1">
            <button onClick={handleDownloadCsv} className="p-1.5 hover:text-green-500 transition-colors" title="Export CSV"><FontAwesomeIcon icon={faFileCsv} className="text-xs" /></button>
            {item.type === 'table' && <button onClick={() => fileInputRef.current?.click()} className="p-1.5 hover:text-blue-500 transition-colors" title="Upload CSV"><FontAwesomeIcon icon={faUpload} className="text-xs" /></button>}
          </div>
        ) : (
          <div className="flex gap-1">
            <button onClick={handleDownloadChartCsv} className="p-1.5 hover:text-green-500 transition-colors" title="Export CSV"><FontAwesomeIcon icon={faFileCsv} className="text-xs" /></button>
            <button onClick={handleDownloadSvg} className="p-1.5 hover:text-blue-500 transition-colors" title="Export SVG"><FontAwesomeIcon icon={faDownload} className="text-xs" /></button>
          </div>
        )}
        {executionResult?.structuredOutput && executionResult.structuredOutput.length > 1 && (
          <>
            <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1" />
            <Navigator executionResult={executionResult} activeAnalyticsSubTabIndex={activeAnalyticsSubTabIndex} handlePrev={handlePrev} handleNext={handleNext} />
          </>
        )}
      </div>
    </div>
  );

  const portalEl = typeof document !== 'undefined' ? document.getElementById('bottom-panel-portal-root') : null;

  return (
    <div className={`bg-white dark:bg-slate-900 group relative overflow-hidden flex flex-col ${isDashboard ? 'h-full rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm' : 'h-full'}`}>
      {!isHeaderPortalTarget && <div className="flex items-center gap-2 p-2 border-b border-slate-100 dark:border-slate-800 shrink-0 min-h-[48px]">{headerControls}</div>}
      {isHeaderPortalTarget && portalEl && createPortal(headerControls, portalEl)}
      
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {effectiveType === 'table' ? (
          <div className="flex-1 h-full w-full overflow-hidden"><input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} /><TableView data={tableData || []} onSelect={handleSelectElements} onUpdate={handleUpdateParameter} filterText={filterText} setFilterText={setFilterText} onFilteredDataChange={setCurrentFilteredData} /></div>
        ) : showAsTable === false && (item.type === 'chart-bar' || item.type === 'chart-pie' || item.type === 'chart-line') ? (
          <div ref={chartContainerRef} id={chartId} className="flex-1 w-full min-h-[350px] relative px-2 py-2 overflow-hidden">
            {parsedData && Array.isArray(parsedData) && parsedData.length > MAX_CHART_ITEMS ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-slate-50/50 dark:bg-slate-900/50 backdrop-blur-sm rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-800 m-4 animate-in fade-in zoom-in-95">
                <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-4 border border-amber-200 dark:border-amber-800/50 shadow-sm"><FontAwesomeIcon icon={faExclamationTriangle} className="text-2xl text-amber-500 animate-pulse" /></div>
                <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tighter mb-2">High-Density Data Detected</h3>
                <p className="text-sm font-medium text-slate-500 dark:text-slate-400 max-w-md leading-relaxed mb-6">Visualizing <span className="text-blue-600 dark:text-blue-400 font-black">{parsedData.length}</span> individual items will lead to an unreadable chart.</p>
                <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm max-w-sm text-left"><div className="flex items-center gap-2 mb-2"><div className="w-5 h-5 rounded-md bg-blue-600 flex items-center justify-center"><FontAwesomeIcon icon={faMagicWandSparkles} className="text-[10px] text-white" /></div><span className="text-[10px] font-black uppercase tracking-widest text-blue-600 dark:text-blue-400">Pro Tip</span></div><p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-3">Use <code className="bg-slate-100 dark:bg-slate-900 px-1.5 py-0.5 rounded text-blue-500">.GroupBy()</code> to aggregate data by Level, Category, or Type for a clean visualization.</p><button onClick={() => setShowAsTable(true)} className="w-full py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all">View as Table Instead</button></div>
              </div>
            ) : (
              <div className="absolute inset-0">{isReady && dimensions.width > 0 && dimensions.height > 0 && (
                <ResponsiveContainer key={`${item.type}-${activeAnalyticsSubTabIndex}`} width="99%" height="99%" debounce={50}>
                  {item.type === 'chart-bar' ? (
                    <BarChart data={parsedData} margin={{ top: 20, right: 30, left: 30, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} vertical={false} /><XAxis dataKey={chartKeys.xAxisKey} fontSize={10} tick={{ fill: 'currentColor', opacity: 0.7 }} interval={0} minTickGap={5} label={{ value: chartKeys.xAxisKey, position: 'insideBottom', offset: -15, fill: 'currentColor', fontSize: 12, fontWeight: 'bold', opacity: 0.8 }} /><YAxis fontSize={10} tick={{ fill: 'currentColor', opacity: 0.7 }} label={{ value: chartKeys.yAxisKey, angle: -90, position: 'insideLeft', offset: 5, fill: 'currentColor', fontSize: 12, fontWeight: 'bold', opacity: 0.8 }} /><ChartTooltip content={<CustomChartTooltip />} cursor={false} /><Bar dataKey={chartKeys.yAxisKey} radius={[4, 4, 0, 0]} isAnimationActive={!isDashboard} fill="#3b82f6">{parsedData.map((_: any, index: number) => <Cell key={`cell-${index}`} fill={getChartColor(index, parsedData.length)} />)}</Bar>
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
                        {parsedData.map((_: any, index: number) => <Cell key={`cell-${index}`} fill={getChartColor(index, parsedData.length)} />)}
                      </Pie>
                      <ChartTooltip content={<CustomPieTooltip />} />
                      <Legend iconType="square" iconSize={10} formatter={renderColorfulLegendText} />
                    </PieChart>
                  ) : (
                    <LineChart data={parsedData} margin={{ top: 20, right: 30, left: 30, bottom: 40 }}><CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} /><XAxis dataKey={chartKeys.xAxisKey} fontSize={10} tick={{ fill: 'currentColor', opacity: 0.7 }} interval={0} minTickGap={5} label={{ value: chartKeys.xAxisKey, position: 'insideBottom', offset: -15, fill: 'currentColor', fontSize: 12, fontWeight: 'bold', opacity: 0.8 }} /><YAxis fontSize={10} tick={{ fill: 'currentColor', opacity: 0.7 }} label={{ value: chartKeys.yAxisKey, angle: -90, position: 'insideLeft', offset: 5, fill: 'currentColor', fontSize: 12, fontWeight: 'bold', opacity: 0.8 }} /><ChartTooltip content={<CustomChartTooltip />} /><Line type="monotone" dataKey={chartKeys.yAxisKey} stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} isAnimationActive={!isDashboard} /></LineChart>
                  )}
                </ResponsiveContainer>
              )}</div>
            )}
          </div>
        ) : item.type === 'message' ? <p className="text-slate-800 dark:text-slate-200 text-sm whitespace-pre-wrap p-4">{parsedData}</p> : (
          <pre className="p-3 font-mono text-xs text-slate-800 dark:text-slate-200 bg-slate-50 dark:bg-slate-950 rounded-lg overflow-auto custom-scrollbar">{JSON.stringify(parsedData, null, 2)}</pre>
        )}
      </div>

      {(executionResult?.scriptName || (item.type === 'table' && tableData)) && (
        <div className="px-4 py-1.5 border-t border-slate-100 dark:border-slate-800/50 bg-slate-50/30 dark:bg-slate-900/10 flex items-center shrink-0">
          <div className="flex-grow flex items-center gap-3">
            {executionResult?.scriptName && <><span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-600 select-none">Origin</span><span className="text-[11px] font-bold italic text-slate-500 dark:text-slate-400 truncate max-w-[200px]">{executionResult.scriptName}</span></>}
            <div className="flex items-center gap-3 border-l border-slate-200 dark:border-slate-800/40 pl-3">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 dark:text-slate-600 select-none">Document</span>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-bold italic truncate max-w-[200px] ${isDocMismatch ? 'text-amber-600 dark:text-amber-500' : 'text-slate-500 dark:text-slate-400'}`}>{capturedDocTitle || "Unknown Document"}</span>
                {isDocMismatch && (
                  <div className="relative group/mismatch-footer translate-y-[1px]">
                    <span className="text-amber-500 cursor-help"><FontAwesomeIcon icon={faExclamationTriangle} className="text-[10px] animate-pulse" /></span>
                    <div className="absolute z-[130] left-1/2 -translate-x-1/2 bottom-full mb-2 p-3 rounded-xl shadow-2xl bg-white dark:bg-slate-900 text-slate-700 dark:text-white text-[10px] font-bold leading-relaxed w-56 opacity-0 invisible group-hover/mismatch-footer:opacity-100 group-hover/mismatch-footer:visible transition-all duration-300 transform translate-y-1 group-hover/mismatch-footer:translate-y-0 pointer-events-none border border-amber-500/20"><div className="text-amber-500 dark:text-amber-400 mb-1 flex items-center gap-1.5 uppercase tracking-widest pb-1 border-b border-amber-500/10"><FontAwesomeIcon icon={faExclamationTriangle} /> Document Mismatch</div>This output was rendered for <span className="text-blue-600 dark:text-blue-400">'{capturedDocTitle}'</span>.<br />The active document is now <span className="text-emerald-600 dark:text-emerald-400">'{currentDocTitle}'</span>.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
          {tableData && (
            <div className="shrink-0 pl-4 border-l border-slate-200 dark:border-slate-800/40">
              <span className="text-[11px] font-bold italic text-slate-500 dark:text-slate-400">
                {filterText ? `${filteredDataCount}/${tableData.length}` : tableData.length} rows{tableData[0] ? `, ${Object.keys(tableData[0]).length} columns` : ''}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

StructuredOutputViewer.displayName = 'StructuredOutputViewer';
