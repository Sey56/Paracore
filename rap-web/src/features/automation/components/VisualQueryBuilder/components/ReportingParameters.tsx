import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTable, faFilter, faTimes } from '@fortawesome/free-solid-svg-icons';
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
  const filteredColumns = availableParams.filter(p =>
    p.name.toLowerCase().includes(columnSearch.toLowerCase()) &&
    !selectedColumns.some(sc => sc.name === p.name)
  );

  const rootGroupJson = JSON.stringify(rootGroup);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <FontAwesomeIcon icon={faTable} className="text-gray-400 text-xs" />
        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Reporting Parameters</h3>
      </div>
      <div className="bg-gray-50/50 dark:bg-gray-800/30 rounded-2xl p-6 border border-gray-100 dark:border-gray-800">
        <div className="flex flex-col gap-6">
          <div className="relative max-w-md">
            <input 
              type="text" 
              placeholder="Add additional data columns..." 
              value={columnSearch} 
              onFocus={() => setIsColumnDropdownOpen(true)} 
              onChange={(e) => setColumnSearch(e.target.value)} 
              className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-sm font-semibold focus:ring-4 focus:ring-blue-500/10 outline-none transition-all dark:text-white shadow-sm" 
            />
            {isColumnDropdownOpen && (
              <>
                <div className="fixed inset-0 z-[90]" onClick={() => setIsColumnDropdownOpen(false)} />
                <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-2xl z-[100] max-h-60 overflow-y-auto custom-scrollbar border-t-4 border-t-blue-500">
                  {filteredColumns.map(p => (
                    <div key={p.name} onClick={() => addColumn(p)} className="px-4 py-3 text-sm font-bold cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-gray-300 transition-colors flex items-center justify-between group">
                      <span>{p.name}</span>
                      <div className="flex items-center gap-2">
                        {rootGroupJson.includes(`"${p.name}"`) && <span className="text-[8px] font-black text-blue-500">FILTERED</span>}
                        <span className="text-[9px] font-black text-gray-400">{p.storage_type}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {availableParams.filter(p => rootGroupJson.includes(`"${p.name}"`)).map(p => (
              <div key={p.name} className="px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800/50 flex items-center gap-2">
                <FontAwesomeIcon icon={faFilter} className="text-[10px] text-blue-500" />
                <span className="text-xs font-bold text-blue-700 dark:text-blue-300">{p.name}</span>
              </div>
            ))}
            {selectedColumns.map(col => {
              const relevantUnits = getAvailableUnits(col.spec_type_id);
              return (
                <div key={col.name} className="px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center gap-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <FontAwesomeIcon icon={faTable} className="text-[10px] text-gray-400" />
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{col.name}</span>
                  </div>
                  {relevantUnits.length > 0 && (
                    <select 
                      value={col.unit || ''} 
                      onChange={(e) => updateColumnUnit(col.name, e.target.value || undefined)} 
                      className="bg-gray-100 dark:bg-gray-700 border-none rounded px-1.5 py-0.5 text-[9px] font-black text-gray-600 dark:text-gray-400 outline-none cursor-pointer"
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
