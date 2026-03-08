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
    <div className="w-full mb-8">
      <div className={`w-full flex flex-col md:flex-row items-center justify-between gap-4 px-4 py-2.5 rounded-2xl bg-white/60 dark:bg-slate-800/40 backdrop-blur-md border border-slate-200/50 dark:border-slate-600/50 shadow-sm ${!isAuthenticated ? 'opacity-50 pointer-events-none' : ''}`}>

        {/* 1. Minimalist Search */}
        <div className="flex-grow relative group max-w-md w-full md:w-auto">
          <FontAwesomeIcon
            icon={faSearch}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 group-focus-within:text-blue-500 transition-colors text-xs"
          />
          <input
            type="text"
            placeholder="Search gallery..."
            className="w-full pl-9 pr-4 py-2 bg-white/40 dark:bg-slate-800/80 rounded-xl text-[13px] font-bold text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all border border-slate-200/50 dark:border-slate-600/60 focus:border-blue-500/50 focus:bg-white dark:focus:bg-slate-800 shadow-inner"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            disabled={!isAuthenticated}
          />
        </div>

        {/* 2. Action Rail */}
        <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 w-full md:w-auto">

          {/* Type Filter */}
          <div className="flex items-center gap-1 bg-white/40 dark:bg-slate-800/80 p-1.5 rounded-xl border border-slate-200/50 dark:border-slate-600/60 shadow-inner">
            {[
              { id: 'all', label: 'All' },
              { id: 'scripts', label: 'Scripts' },
              { id: 'guards', label: 'Sentinels' }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTypeFilter(t.id as any)}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all
                  ${typeFilter === t.id
                    ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm border border-slate-200/60 dark:border-slate-700/60'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-400'
                  }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Custom High-Contrast Sort Dropdown */}
          <div className="relative min-w-[170px]" ref={sortRef}>
            <div
              onClick={() => setIsSortOpen(!isSortOpen)}
              className="flex items-center justify-between w-full bg-white/40 hover:bg-white/60 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase text-slate-500 dark:text-slate-300 cursor-pointer transition-all border border-slate-200/50 dark:border-slate-600/60 shadow-sm"
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
                      className={`px-4 py-2.5 text-[11px] font-bold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors border-b border-slate-50 dark:border-slate-800/50 last:border-0 flex items-center justify-between ${sortOrder === opt.value ? 'text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-900/20' : 'text-slate-600 dark:text-slate-300'}`}
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
            className={`w-9 h-9 rounded-xl border transition-all flex items-center justify-center shrink-0
              ${isCompactView
                ? 'bg-blue-50 dark:bg-blue-900/40 border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-400'
                : 'bg-transparent border-transparent text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
              }`}
            title={isCompactView ? "Standard Grid" : "Compact Grid"}
          >
            <FontAwesomeIcon icon={isCompactView ? faExpandAlt : faCompressAlt} className="text-xs" />
          </button>
        </div>
      </div>
    </div>
  );
};
