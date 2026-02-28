import React, { useCallback, useId, useMemo, useRef, useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line
} from 'recharts';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';
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
}> = ({ data: initialData, onSelect, onUpdate }) => {
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
              const idColKey = Object.keys(row).find(k =>
                ['id', 'elementid', 'revitid', 'element id', 'revit id'].includes(k.toLowerCase())
              );
              const hasId = !!idColKey;
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
                    const rawValue = row[header];
                    const cellValue = rawValue !== null && rawValue !== undefined ? String(rawValue) : '';
                    const isIdColumn = ['id', 'elementid', 'revitid', 'element id', 'revit id'].includes(header.toLowerCase());
                    const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.colKey === header;

                    const canEdit = !isIdColumn && !!onUpdate && hasId;

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
                        className={`px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300 max-w-[200px] ${canEdit ? 'cursor-pointer hover:bg-white/50 dark:hover:bg-black/20' : ''} ${isUpdating && isEditing ? 'opacity-50' : ''}`}
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
  const chartId = useId().replace(/:/g, '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUpdating, setIsUpdating] = useState(false);

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
      const response = await api.post('/api/update-element-parameter', {
        element_id: elementId,
        parameter_name: parameterName,
        new_value_string: newValue
      });
      if (response.data?.is_success) {
        showNotification(`Updated ${parameterName}`, "success");
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
  }, [showNotification]);

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
    console.log("handleUploadCsv clicked. ref current:", fileInputRef.current);
    if (!fileInputRef.current) {
      console.error("fileInputRef.current is NULL. Input might not be mounted.");
      showNotification("Upload system is initializing, please try again in a moment.", "warning");
      return;
    }
    fileInputRef.current.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      console.log("No file selected.");
      return;
    }

    console.log(`File selected: ${file.name}, Size: ${file.size} bytes`);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let text = event.target?.result as string;
        if (!text) {
          console.error("FileReader result is empty.");
          showNotification("Could not read file content.", "error");
          return;
        }

        // --- Strip UTF-8 BOM if present ---
        if (text.startsWith('\uFEFF')) {
          console.log("UTF-8 BOM detected and stripped.");
          text = text.substring(1);
        }

        console.log("File content read. Starting CSV scan...");
        showNotification("Scanning CSV for changes...", "info");

        // --- Robust CSV Parser ---
        const parseCSV = (csv: string) => {
          // Normalize line endings and filter out empty lines
          const lines = csv.replace(/\r/g, "").split("\n").filter(l => l.trim() !== "");
          console.log(`CSV lines found: ${lines.length}`);
          if (lines.length < 2) return [];

          const parseLine = (line: string) => {
            const result = [];
            let curr = "";
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
              const char = line[i];
              if (char === '"') {
                // Handle double quotes inside quoted fields
                if (inQuotes && line[i + 1] === '"') {
                  curr += '"';
                  i++; // Skip next quote
                } else {
                  inQuotes = !inQuotes;
                }
              } else if (char === ',' && !inQuotes) {
                result.push(curr.trim());
                curr = "";
              } else {
                curr += char;
              }
            }
            result.push(curr.trim());
            return result;
          };

          const headers = parseLine(lines[0]);
          console.log("CSV Headers identified:", headers);
          return lines.slice(1).map((line, lineIdx) => {
            const values = parseLine(line);
            const obj: any = {};
            headers.forEach((h, i) => {
              if (h) obj[h] = values[i] !== undefined ? values[i] : "";
            });
            return obj;
          });
        };

        const importedData = parseCSV(text);
        console.log(`Imported data rows: ${importedData.length}`);
        if (importedData.length === 0) {
          showNotification("CSV file is empty or formatted incorrectly.", "error");
          return;
        }

        let currentTableData: any[] = [];
        try {
          const parsed = JSON.parse(item.data);
          currentTableData = Array.isArray(parsed) ? parsed : [parsed];
          console.log(`Current table rows: ${currentTableData.length}`);
        } catch (err) {
          console.error("Failed to parse current table data JSON:", err);
          showNotification("Error parsing active table data.", "error");
          return;
        }

        if (currentTableData.length === 0) {
          showNotification("No data in current table to update.", "warning");
          return;
        }

        // --- ID Key Discovery ---
        const firstRow = currentTableData[0];
        const tableKeys = Object.keys(firstRow);
        const idKey = tableKeys.find(k =>
          ['id', 'elementid', 'revitid', 'element id', 'revit id'].includes(k.toLowerCase())
        );

        if (!idKey) {
          console.error("No ID column found in current table keys:", tableKeys);
          showNotification("Cannot mass update: Table has no ID column.", "error");
          return;
        }
        console.log(`Using ID column: ${idKey}`);

        // --- Build Case-Insensitive Mapping for Table Keys ---
        const tableKeyMap = new Map<string, string>();
        tableKeys.forEach(k => tableKeyMap.set(k.toLowerCase(), k));

        const updates: any[] = [];
        let matchedRowsCount = 0;

        importedData.forEach((importedRow, idx) => {
          // Find the ID in the imported row (case-insensitive check for common ID headers)
          const importedRowKeys = Object.keys(importedRow);
          const importedIdKey = importedRowKeys.find(k => k.toLowerCase() === idKey.toLowerCase()) ||
            importedRowKeys.find(k => ['id', 'elementid', 'revitid'].includes(k.toLowerCase()));

          if (!importedIdKey) {
            if (idx === 0) console.warn(`Imported row ${idx} is missing an ID column. Looking for ${idKey}`);
            return;
          }

          const importedIdStr = String(importedRow[importedIdKey]);
          const importedId = parseInt(importedIdStr.replace(/,/g, ''), 10); // Remove thousand separators if any

          if (isNaN(importedId)) {
            if (idx === 0) console.warn(`Row ${idx} has invalid ID: ${importedIdStr}`);
            return;
          }

          const matchingRow = currentTableData.find(r => {
            const rId = typeof r[idKey] === 'string' ? parseInt(r[idKey], 10) : Number(r[idKey]);
            return rId === importedId;
          });

          if (matchingRow) {
            matchedRowsCount++;
            importedRowKeys.forEach(csvColName => {
              const lowerCsvCol = csvColName.toLowerCase();
              // Skip ID column
              if (['id', 'elementid', 'revitid', 'element id', 'revit id'].includes(lowerCsvCol)) return;

              // Check if table has this column (case-insensitively)
              const actualTableColName = tableKeyMap.get(lowerCsvCol);
              if (actualTableColName) {
                const newVal = String(importedRow[csvColName]).trim();
                const oldVal = String(matchingRow[actualTableColName]).trim();

                if (newVal !== oldVal) {
                  console.log(`Change detected for element ${importedId} at column ${actualTableColName}: "${oldVal}" -> "${newVal}"`);
                  updates.push({
                    element_id: importedId,
                    parameter_name: actualTableColName,
                    new_value_string: newVal
                  });
                }
              }
            });
          }
        });

        console.log(`Scan complete. Matches: ${matchedRowsCount}, Total updates pending: ${updates.length}`);

        if (updates.length === 0) {
          if (matchedRowsCount === 0) {
            showNotification(`No matches found. Ensure the CSV Element IDs match the table Element IDs.`, "warning");
          } else {
            showNotification(`Found ${matchedRowsCount} matching rows but no value changes detected.`, "info");
          }
          return;
        }

        setIsUpdating(true);
        console.log("Sending batch update to server...");
        const response = await api.post("/api/batch-update-element-parameters", { updates });
        setIsUpdating(false);
        console.log("Server response received:", response.data);

        if (response.data.is_success) {
          showNotification(`Successfully updated all ${response.data.count} parameters in a single transaction.`, "success");
          window.dispatchEvent(new CustomEvent('paracore-table-updated', { detail: { updates, idKey } }));
        } else {
          console.error("Batch update reported failure:", response.data.error_message);
          showNotification(`Batch update failed: ${response.data.error_message || "Unknown error"}. No changes were made to the model.`, "error");
        }
      } catch (error) {
        setIsUpdating(false);
        const msg = error instanceof Error ? error.message : String(error);
        console.error("CRITICAL: Unexpected error during CSV import processing:", error);
        showNotification(`Unexpected error during CSV import: ${msg}`, "error");
      }
    };
    reader.onerror = (e) => {
      console.error("FileReader error event:", e);
      showNotification("Failed to read the selected file.", "error");
    };
    reader.readAsText(file);
    // Reset input value to allow same file re-upload
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

    const Toolbar = () => (
      <div className="absolute top-2 right-2 z-10 flex gap-1">
        {item.type === 'table' ? (
          <>
            <button onClick={handleCopy} className="p-1.5 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 rounded shadow-sm hover:text-blue-600" title="Copy Table"><FontAwesomeIcon icon={faCopy} className="text-xs" /></button>
            <button onClick={handleDownloadCsv} className="p-1.5 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 rounded shadow-sm hover:text-green-500" title="Export CSV (Save As...)"><FontAwesomeIcon icon={faFileCsv} className="text-xs" /></button>
            <button onClick={handleUploadCsv} className="p-1.5 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 rounded shadow-sm hover:text-blue-500" title="Upload CSV / Mass Edit"><FontAwesomeIcon icon={faUpload} className="text-xs" /></button>
          </>
        ) : (
          <>
            <button onClick={handleDownloadCsv} className="p-1.5 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 rounded shadow-sm hover:text-green-500" title="Download CSV"><FontAwesomeIcon icon={faFileCsv} className="text-xs" /></button>
            <button onClick={handleDownloadSvg} className="p-1.5 bg-white/80 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-600 rounded shadow-sm hover:text-blue-500" title="Download SVG"><FontAwesomeIcon icon={faDownload} className="text-xs" /></button>
          </>
        )}
      </div>
    );

    if (item.type === 'table') {
      if (!tableData || tableData.length === 0) return <div className="p-4 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center"><p className="text-gray-500 dark:text-gray-400 text-xs italic">No data returned.</p></div>;
      return (
        <div className="relative group">
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={onFileChange} />
          <Toolbar />
          <TableView data={tableData} onSelect={handleSelectElements} onUpdate={handleUpdateParameter} />
        </div>
      );
    }

    if (item.type === 'chart-bar') {
      return (
        <div id={chartId} className="relative group bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700" style={{ ...commonChartProps, minWidth: 0 }}>
          <Toolbar />
          <ResponsiveContainer width="100%" height={300}><BarChart data={parsedData}><CartesianGrid strokeDasharray="3 3" opacity={0.1} /><XAxis dataKey="name" fontSize={10} /><YAxis fontSize={10} /><Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px', color: '#fff' }} itemStyle={{ color: '#60a5fa' }} /><Legend wrapperStyle={{ fontSize: '10px' }} /><Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
        </div>
      );
    }

    if (item.type === 'chart-pie') {
      return (
        <div id={chartId} className="relative group bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700" style={{ ...commonChartProps, minWidth: 0 }}>
          <Toolbar />
          <ResponsiveContainer width="100%" height={300}><PieChart><Pie data={parsedData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" label={{ fontSize: 10 }} isAnimationActive={true}>{(parsedData as { value: number }[]).map((_, i: number) => <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip content={<CustomPieTooltip />} /><Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: '10px' }} /></PieChart></ResponsiveContainer>
        </div>
      );
    }

    if (item.type === 'chart-line') {
      return (
        <div id={chartId} className="relative group bg-white dark:bg-gray-800 p-2 rounded-lg border border-gray-200 dark:border-gray-700" style={{ ...commonChartProps, minWidth: 0 }}>
          <Toolbar />
          <ResponsiveContainer width="100%" height={300}><LineChart data={parsedData} margin={{ right: 30 }}><CartesianGrid strokeDasharray="3 3" opacity={0.1} /><XAxis dataKey="name" fontSize={10} /><YAxis fontSize={10} /><Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', fontSize: '12px', color: '#fff' }} /><Legend wrapperStyle={{ fontSize: '10px' }} /><Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} /></LineChart></ResponsiveContainer>
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
