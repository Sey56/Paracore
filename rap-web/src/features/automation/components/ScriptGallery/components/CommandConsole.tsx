import React, { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faExpandAlt, faCompressAlt, faChevronDown, faSortAmountDown } from '@fortawesome/free-solid-svg-icons';

interface CommandConsoleProps {
  isAuthenticated: boolean;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  typeFilter: 'all' | 'scripts' | 'guards';
  setTypeFilter: (filter: 'all' | 'scripts' | 'guards') => void;
  sortOrder: string;
  setSortOrder: (order: string) => void;
  isCompactView: boolean;
  setIsCompactView: (compact: boolean) => void;
}

const SORT_OPTIONS = [
  { value: 'name-asc', label: 'Name (A-Z)' },
  { value: 'name-desc', label: 'Name (Z-A)' },
  { value: 'author-asc', label: 'Author (A-Z)' },
  { value: 'author-desc', label: 'Author (Z-A)' },
  { value: 'lastRun-desc', label: 'Last Run (Newest)' },
  { value: 'lastRun-asc', label: 'Last Run (Oldest)' },
  { value: 'created-desc', label: 'Created (Newest)' },
  { value: 'created-asc', label: 'Created (Oldest)' },
  { value: 'modified-desc', label: 'Modified (Newest)' },
  { value: 'modified-asc', label: 'Modified (Oldest)' },
];

export const CommandConsole: React.FC<CommandConsoleProps> = ({
  isAuthenticated,
  searchTerm,
  setSearchTerm,
  typeFilter,
  setTypeFilter,
  sortOrder,
  setSortOrder,
  isCompactView,
  setIsCompactView
}) => {
  const [isSortOpen, setIsSortOpen] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setIsSortOpen(false);
    };
    if (isSortOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isSortOpen]);

  const activeSortLabel = SORT_OPTIONS.find(opt => opt.value === sortOrder)?.label || 'Sort By';

  return (
    <div className={`flex items-center gap-6 px-2 py-1 mb-6 border-b border-slate-100 dark:border-slate-800/50 ${!isAuthenticated ? 'opacity-50 pointer-events-none' : ''}`}>
      
      {/* 1. Minimalist Search */}
      <div className="flex-grow relative group max-w-md">
        <FontAwesomeIcon 
          icon={faSearch} 
          className="absolute left-0 top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600 group-focus-within:text-blue-500 transition-colors text-xs" 
        />
        <input
          type="text"
          placeholder="Filter automation library..."
          className="w-full pl-7 pr-4 py-2 bg-transparent text-[14px] font-bold text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600 transition-all border-b-2 border-transparent focus:border-blue-500/30"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          disabled={!isAuthenticated}
        />
      </div>

      {/* 2. Action Rail */}
      <div className="flex items-center gap-4 shrink-0">
        
        {/* Type Filter */}
        <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-900/50 p-1 rounded-xl border border-blue-500/5 dark:border-blue-400/5">
          {[
            { id: 'all', label: 'All' },
            { id: 'scripts', label: 'Scripts' },
            { id: 'guards', label: 'Sentinels' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTypeFilter(t.id as any)}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all
                ${typeFilter === t.id
                  ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm border border-blue-500/10'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Custom High-Contrast Sort Dropdown */}
        <div className="relative min-w-[180px]" ref={sortRef}>
          <div
            onClick={() => setIsSortOpen(!isSortOpen)}
            className="flex items-center justify-between w-full bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl px-3 py-2 text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 cursor-pointer transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700"
          >
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faSortAmountDown} className="text-slate-400" />
              <span>{activeSortLabel}</span>
            </div>
            <FontAwesomeIcon icon={faChevronDown} className={`text-[8px] text-slate-400 transition-transform ${isSortOpen ? 'rotate-180' : ''}`} />
          </div>

          {isSortOpen && (
            <div className="absolute top-full right-0 mt-2 min-w-[200px] bg-white dark:bg-slate-900 rounded-xl shadow-2xl z-[110] border border-slate-100 dark:border-slate-800 animate-in fade-in slide-in-from-top-1 overflow-hidden">
              <div className="max-h-64 overflow-y-auto custom-scrollbar">
                {SORT_OPTIONS.map(opt => (
                  <div
                    key={opt.value}
                    onClick={() => {
                      setSortOrder(opt.value);
                      setIsSortOpen(false);
                    }}
                    className={`px-4 py-2.5 text-[11px] font-bold cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors border-b border-slate-50 dark:border-slate-800 last:border-0 flex items-center justify-between ${sortOrder === opt.value ? 'text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/10' : 'text-slate-600 dark:text-slate-300'}`}
                  >
                    {opt.label}
                    {sortOrder === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* View Toggle */}
        <button
          onClick={() => setIsCompactView(!isCompactView)}
          className={`w-9 h-9 rounded-xl border transition-all flex items-center justify-center
            ${isCompactView
              ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-600'
              : 'bg-transparent border-transparent text-slate-300 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          title={isCompactView ? "Standard Grid" : "Compact Grid"}
        >
          <FontAwesomeIcon icon={isCompactView ? faExpandAlt : faCompressAlt} className="text-xs" />
        </button>
      </div>
    </div>
  );
};
