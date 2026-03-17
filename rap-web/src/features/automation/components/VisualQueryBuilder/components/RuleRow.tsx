import React, { useState, useRef, useEffect, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUp, faArrowDown, faTrash, faChevronDown, faSearch } from '@fortawesome/free-solid-svg-icons';
import { ParameterDefinition, QueryRule, OPERATORS, getAvailableUnits } from '../types/queryBuilderTypes';

interface RuleRowProps {
  child: QueryRule;
  childPath: number[];
  availableParams: ParameterDefinition[];
  updateRootGroupRecursive: (path: number[], updates: Partial<QueryRule>, action: 'update' | 'remove' | 'add_rule' | 'add_group' | 'move_up' | 'move_down') => void;
}

interface CustomMiniSelectProps {
  value: string;
  options: string[];
  onChange: (val: string) => void;
  className?: string;
  placeholder?: string;
}

const CustomMiniSelect: React.FC<CustomMiniSelectProps> = ({ value, options, onChange, className = "", placeholder = "Select..." }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-white dark:bg-slate-900/50 border border-slate-100/50 dark:border-slate-700/30 rounded-lg px-2 py-1.5 text-xs font-bold flex items-center justify-between cursor-pointer hover:border-blue-500/30 hover:bg-white dark:hover:bg-slate-900 transition-all shadow-sm"
      >
        <span className="truncate dark:text-white uppercase tracking-tighter">{value || placeholder}</span>
        <FontAwesomeIcon icon={faChevronDown} className={`text-[9px] text-slate-400 transition-transform ml-1.5 ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      {isOpen && (
        <div className="absolute top-full left-0 min-w-full w-max mt-1 bg-white dark:bg-slate-900 rounded-xl shadow-2xl z-[110] border border-slate-100 dark:border-slate-800 animate-in fade-in slide-in-from-top-1 overflow-hidden">
          <div className="max-h-48 overflow-y-auto custom-scrollbar">
            {options.map(opt => (
              <div
                key={opt}
                onClick={() => { onChange(opt); setIsOpen(false); }}
                className={`px-4 py-2 text-[11px] font-bold cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors border-b border-slate-50 dark:border-slate-800 last:border-0 ${value === opt ? 'text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/10' : 'text-slate-600 dark:text-slate-300'}`}
              >
                {opt}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const RuleRow: React.FC<RuleRowProps> = ({
  child,
  childPath,
  availableParams,
  updateRootGroupRecursive
}) => {
  const relevantUnits = getAvailableUnits(child.spec_type_id);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const filteredParams = useMemo(() => {
    if (!search) return availableParams;
    const lowSearch = search.toLowerCase();

    return availableParams
      .filter(p => {
        const nameMatch = p.name.toLowerCase().includes(lowSearch) || (p.displayName || '').toLowerCase().includes(lowSearch);
        const metaMatch = p.storage_type.toLowerCase().includes(lowSearch) ||
          (p.builtin_name || '').toLowerCase().includes(lowSearch) ||
          (p.is_type ? 'type' : 'instance').toLowerCase().includes(lowSearch);
        return nameMatch || metaMatch;
      })
      .sort((a, b) => {
        const aNameLow = a.name.toLowerCase();
        const bNameLow = b.name.toLowerCase();
        if (aNameLow === lowSearch && bNameLow !== lowSearch) return -1;
        if (bNameLow === lowSearch && aNameLow !== lowSearch) return 1;
        const aStarts = aNameLow.startsWith(lowSearch);
        const bStarts = bNameLow.startsWith(lowSearch);
        if (aStarts && !bStarts) return -1;
        if (bStarts && !aStarts) return 1;
        const aContains = aNameLow.includes(lowSearch);
        const bContains = bNameLow.includes(lowSearch);
        if (aContains && !bContains) return -1;
        if (bContains && !aContains) return 1;
        return 0;
      });
  }, [availableParams, search]);

  return (
    <div className="flex items-center gap-2 group/item">
      <div className="w-1.5 h-1.5 rounded-full bg-blue-500/20 shrink-0" />
      
      {/* 1. Parameter Selector: Custom Dropdown */}
      <div className="flex-[2] min-w-[150px] relative" ref={dropdownRef}>
        <div
          onClick={() => setIsOpen(!isOpen)}
          className="w-full bg-white dark:bg-slate-900/50 border border-blue-500/10 dark:border-blue-400/10 rounded-lg px-3 py-1.5 text-xs font-bold flex items-center justify-between cursor-pointer hover:border-blue-500/30 transition-all shadow-sm"
        >
          <span className="truncate dark:text-white">{child.name}</span>
          <FontAwesomeIcon icon={faChevronDown} className={`text-[10px] text-slate-400 transition-transform ml-1.5 ${isOpen ? 'rotate-180' : ''}`} />
        </div>

        {isOpen && (
          <div className="absolute top-full left-0 min-w-full w-max max-w-[400px] mt-1 bg-white dark:bg-slate-900 rounded-xl shadow-2xl z-[100] border border-slate-100 dark:border-slate-800 animate-in fade-in slide-in-from-top-1">
            <div className="p-2 border-b border-slate-50 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40">
              <div className="relative">
                <input
                  autoFocus
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border-none px-3 py-1.5 text-xs font-bold outline-none dark:text-white"
                />
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto custom-scrollbar">
              {filteredParams.length === 0 ? (
                <div className="px-4 py-3 text-xs font-bold text-slate-400 text-center uppercase">No matches</div>
              ) : (
                filteredParams.map(p => (
                  <div
                    key={p.name}
                    onClick={() => {
                      updateRootGroupRecursive(childPath, { name: p.name }, 'update');
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`px-4 py-2 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 border-b border-slate-50 dark:border-slate-800 last:border-0 transition-colors flex flex-col gap-0.5 ${child.name === p.name ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''}`}
                  >
                    <span className={`text-sm font-bold ${child.name === p.name ? 'text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-200'}`}>{p.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{p.storage_type}</span>
                      <span className="w-1 h-1 rounded-full bg-slate-200 dark:bg-slate-700" />
                      <span className={`text-[10px] font-black uppercase tracking-tighter ${p.is_type ? 'text-amber-500/70' : 'text-indigo-500/70'}`}>{p.is_type ? 'Type' : 'Instance'}</span>
                      {p.builtin_name && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-slate-200 dark:bg-slate-700" />
                          <span className="text-[10px] font-bold text-slate-400/60 font-mono tracking-tight">{p.builtin_name}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. Operator Selector: Unified Custom Mini Select */}
      <div className="flex-1 min-w-[80px]">
        <CustomMiniSelect
          value={child.operator}
          options={OPERATORS[child.storage_type] || ['==', '!=']}
          onChange={(val) => updateRootGroupRecursive(childPath, { operator: val }, 'update')}
          className="border border-blue-500/10 dark:border-blue-400/10 rounded-lg shadow-sm"
        />
      </div>

      {/* 3. Value Input: Matches Trigger Styling */}
      <div className="flex-[1.5] min-w-[120px]">
        {child.storage_type === 'ElementId' && child.revit_element_type && child.revit_element_type !== 'ElementId' ? (
          <div className="px-3 py-1.5 bg-blue-50/30 dark:bg-blue-900/10 border border-blue-500/10 dark:border-blue-400/10 rounded-lg text-xs font-bold text-blue-600 dark:text-blue-400 italic text-center uppercase tracking-tight">Select {child.revit_element_type}</div>
        ) : (
          <input
            type="text"
            value={child.value}
            onChange={(e) => {
              const val = e.target.value;
              if (child.storage_type === 'String' || val === "" || /^-?\d*\.?\d*$/.test(val)) updateRootGroupRecursive(childPath, { value: val }, 'update');
            }}
            placeholder="Value..."
            className="w-full bg-white dark:bg-slate-900/50 border border-blue-500/10 dark:border-blue-400/10 rounded-lg px-4 py-1.5 text-xs font-bold outline-none dark:text-white transition-all hover:border-blue-500/30 shadow-sm"
            inputMode={child.storage_type === 'String' ? 'text' : 'decimal'}
          />
        )}
      </div>

      {/* 4. Unit Selector: Unified Custom Mini Select */}
      {relevantUnits.length > 0 && (
        <div className="flex-[0.8] min-w-[80px]">
          <CustomMiniSelect
            value={child.unit || ''}
            placeholder="UNIT"
            options={relevantUnits}
            onChange={(val) => updateRootGroupRecursive(childPath, { unit: val || undefined }, 'update')}
            className="border border-blue-500/10 dark:border-blue-400/10 rounded-lg shadow-sm"
          />
        </div>
      )}

      <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity">
        <button onClick={() => updateRootGroupRecursive(childPath, {}, 'move_up')} className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-blue-500 transition-all"><FontAwesomeIcon icon={faArrowUp} className="text-[10px]" /></button>
        <button onClick={() => updateRootGroupRecursive(childPath, {}, 'move_down')} className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-blue-500 transition-all"><FontAwesomeIcon icon={faArrowDown} className="text-[10px]" /></button>
        <button onClick={() => updateRootGroupRecursive(childPath, {}, 'remove')} className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-rose-500 transition-all active:scale-90"><FontAwesomeIcon icon={faTrash} className="text-[10px]" /></button>
      </div>
    </div>
  );
};
