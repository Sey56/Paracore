import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTable, faFilter, faTimes, faChevronDown, faSearch, faPlus } from '@fortawesome/free-solid-svg-icons';
import { ParameterDefinition, QueryRule, getAvailableUnits, QueryGroup } from '../types/queryBuilderTypes';

interface ReportingParametersProps {
  availableParams: ParameterDefinition[];
  selectedColumns: QueryRule[];
  columnSearch: string;
  setColumnSearch: (val: string) => void;
  isColumnDropdownOpen: boolean;
  setIsColumnDropdownOpen: (val: boolean) => void;
  addColumn: (param: ParameterDefinition) => void;
  removeColumn: (name: string) => void;
  updateColumnUnit: (name: string, unit: string | undefined) => void;
  rootGroup: QueryGroup;
}

export const ReportingParameters: React.FC<ReportingParametersProps> = ({
  availableParams,
  selectedColumns,
  columnSearch,
  setColumnSearch,
  isColumnDropdownOpen,
  setIsColumnDropdownOpen,
  addColumn,
  removeColumn,
  updateColumnUnit,
  rootGroup
}) => {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsColumnDropdownOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsColumnDropdownOpen(false);
    };

    if (isColumnDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEsc);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isColumnDropdownOpen, setIsColumnDropdownOpen]);

  const filteredColumns = useMemo(() => {
    const lowSearch = columnSearch.toLowerCase();

    // 1. Initial Filtering (Names + Metadata)
    const filtered = availableParams.filter(p => {
      // Exclude already selected columns
      if (selectedColumns.some(sc => sc.name === p.name)) return false;

      const nameMatch = p.name.toLowerCase().includes(lowSearch) || (p.displayName || '').toLowerCase().includes(lowSearch);
      const metaMatch = p.storage_type.toLowerCase().includes(lowSearch) ||
        (p.builtin_name || '').toLowerCase().includes(lowSearch) ||
        (p.is_type ? 'type' : 'instance').toLowerCase().includes(lowSearch);
      return nameMatch || metaMatch;
    });

    if (!lowSearch) return filtered;

    // 2. Ranked Sorting
    return filtered.sort((a, b) => {
      const aNameLow = a.name.toLowerCase();
      const bNameLow = b.name.toLowerCase();

      // Tier 1: Exact name match
      if (aNameLow === lowSearch && bNameLow !== lowSearch) return -1;
      if (bNameLow === lowSearch && aNameLow !== lowSearch) return 1;

      // Tier 2: Name starts with search
      const aStarts = aNameLow.startsWith(lowSearch);
      const bStarts = bNameLow.startsWith(lowSearch);
      if (aStarts && !bStarts) return -1;
      if (bStarts && !aStarts) return 1;

      // Tier 3: Name contains search
      const aContains = aNameLow.includes(lowSearch);
      const bContains = bNameLow.includes(lowSearch);
      if (aContains && !bContains) return -1;
      if (bContains && !aContains) return 1;

      return 0; // Maintain original order for metadata matches
    });
  }, [availableParams, columnSearch, selectedColumns]);

  const rootGroupJson = JSON.stringify(rootGroup);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <FontAwesomeIcon icon={faTable} className="text-gray-400 text-[11px]" />
        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Reporting Parameters</h3>
      </div>
      <div className="bg-gray-50/50 dark:bg-gray-800/30 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
        <div className="flex flex-col gap-6">
          <div className="relative max-w-md" ref={dropdownRef}>
            <div className="relative">
              <input
                type="text"
                placeholder="Add additional data columns..."
                value={columnSearch}
                onFocus={() => setIsColumnDropdownOpen(true)}
                onChange={(e) => setColumnSearch(e.target.value)}
                className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm font-bold focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all dark:text-white shadow-sm pr-10"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                <FontAwesomeIcon icon={isColumnDropdownOpen ? faSearch : faChevronDown} className="text-[10px]" />
              </div>
            </div>
            {isColumnDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-slate-900 rounded-xl shadow-2xl z-[100] max-h-64 overflow-y-auto custom-scrollbar border-t-4 border-t-blue-500 animate-in fade-in slide-in-from-top-2">
                <div className="p-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">Available Parameters</span>
                </div>
                {filteredColumns.length === 0 ? (
                  <div className="px-4 py-3 text-xs font-bold text-slate-400 text-center uppercase tracking-tight">No parameters found</div>
                ) : (
                  filteredColumns.map(p => (
                    <div key={p.name} onClick={() => { addColumn(p); setIsColumnDropdownOpen(false); }} className="px-4 py-2 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 border-b border-slate-50 dark:border-slate-800 last:border-0 transition-colors flex items-center justify-between group">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{p.name}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{p.storage_type}</span>
                          <span className="w-1 h-1 rounded-full bg-slate-200 dark:bg-slate-700" />
                          <span className={`text-[10px] font-black uppercase tracking-tighter ${p.is_type ? 'text-amber-500/70' : 'text-indigo-500/70'}`}>
                            {p.is_type ? 'Type' : 'Instance'}
                          </span>
                          {p.builtin_name && (
                            <>
                              <span className="w-1 h-1 rounded-full bg-slate-200 dark:bg-slate-700" />
                              <span className="text-[10px] font-bold text-slate-400/60 font-mono tracking-tight">{p.builtin_name}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {rootGroupJson.includes(`"${p.name}"`) && (
                          <div className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 rounded text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">
                            Filtered
                          </div>
                        )}
                        <div className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <FontAwesomeIcon icon={faPlus} className="text-[10px] text-blue-500" />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {availableParams.filter(p => rootGroupJson.includes(`"${p.name}"`)).map(p => (
              <div key={p.name} className="px-3 py-1.5 rounded-lg bg-blue-50/50 dark:bg-blue-900/20 border border-blue-100/50 dark:border-blue-800/30 flex items-center gap-2">
                <FontAwesomeIcon icon={faFilter} className="text-[10px] text-blue-500/70" />
                <span className="text-xs font-bold text-blue-700/80 dark:text-blue-300/80">{p.name}</span>
              </div>
            ))}
            {selectedColumns.map(col => {
              const relevantUnits = getAvailableUnits(col.spec_type_id);
              return (
                <div key={col.name} className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center gap-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon icon={faTable} className="text-xs text-gray-400" />
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-200 tracking-tight">{col.name}</span>
                  </div>
                  {relevantUnits.length > 0 && (
                    <select
                      value={col.unit || ''}
                      onChange={(e) => updateColumnUnit(col.name, e.target.value || undefined)}
                      className="bg-gray-100 dark:bg-gray-700 border-none rounded px-1.5 py-0.5 text-[11px] font-black text-gray-600 dark:text-gray-400 outline-none cursor-pointer"
                    >
                      <option value="">UNIT</option>
                      {relevantUnits.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  )}
                  <button onClick={() => removeColumn(col.name)} className="text-gray-400 hover:text-red-500 transition-colors ml-1">
                    <FontAwesomeIcon icon={faTimes} className="text-[10px]" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
