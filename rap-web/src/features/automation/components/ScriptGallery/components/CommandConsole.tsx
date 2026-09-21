import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faExpandAlt, faCompressAlt, faChevronDown, faSortAmountDown, faClock, faTimes } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '@/features/auth';

const SEARCH_HISTORY_KEY = 'paracore_search_history';
const MAX_HISTORY = 10;

function loadSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(SEARCH_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSearchHistory(history: string[]) {
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

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
  totalUnits: number;
  filteredCount: number;
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
  setIsCompactView,
  totalUnits,
  filteredCount
}) => {
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(loadSearchHistory);
  const [showHistory, setShowHistory] = useState(false);
  const sortRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const { isEnterprise } = useAuth();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setIsSortOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowHistory(false);
    };
    if (isSortOpen || showHistory) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isSortOpen, showHistory]);

  const addToHistory = useCallback((term: string) => {
    if (!term.trim()) return;
    setSearchHistory(prev => {
      const next = [term, ...prev.filter(t => t !== term)].slice(0, MAX_HISTORY);
      saveSearchHistory(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setSearchHistory([]);
    saveSearchHistory([]);
  }, []);

  const handleSearchSubmit = useCallback((term: string) => {
    setSearchTerm(term);
    addToHistory(term);
    setShowHistory(false);
  }, [setSearchTerm, addToHistory]);

  const activeSortLabel = SORT_OPTIONS.find(opt => opt.value === sortOrder)?.label || 'Sort';

  return (
    <div className="w-full mb-1 relative z-20">
      <div className={`w-full flex flex-wrap items-center gap-2.5 px-3 py-2 rounded-xl bg-white/70 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/50 ${!isAuthenticated ? 'opacity-50 pointer-events-none' : ''}`}>

        {/* Search */}
        <div className="flex-1 min-w-[140px] relative" ref={searchRef}>
          <FontAwesomeIcon
            icon={faSearch}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[11px] z-10"
          />
          <input
            type="text"
            placeholder="Search..."
            className="w-full pl-8 py-1.5 bg-transparent rounded-lg text-[12px] font-medium text-slate-700 dark:text-slate-200 outline-none placeholder:text-slate-400 transition-colors border border-transparent focus:border-blue-300/50 dark:focus:border-blue-600/50 focus:bg-white/60 dark:focus:bg-slate-800/80"
            style={{ paddingRight: totalUnits > 0 ? '3.5rem' : '0.75rem' }}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setShowHistory(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                addToHistory(searchTerm);
                setShowHistory(false);
              }
            }}
            disabled={!isAuthenticated}
          />
          {totalUnits > 0 && (
            <span className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-medium tabular-nums select-none pointer-events-none
              ${filteredCount !== totalUnits
                ? 'text-blue-500 dark:text-blue-400'
                : 'text-slate-300 dark:text-slate-600'
              }`}>
              {filteredCount}/{totalUnits}
            </span>
          )}

          {/* Search History Dropdown */}
          {showHistory && searchHistory.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-slate-900 rounded-xl shadow-2xl z-[120] border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Recent</span>
                <button onClick={clearHistory} className="text-[9px] text-slate-400 hover:text-red-500 transition-colors">
                  <FontAwesomeIcon icon={faTimes} className="text-[9px]" />
                </button>
              </div>
              {searchHistory.map((item, i) => (
                <button
                  key={i}
                  onClick={() => handleSearchSubmit(item)}
                  className="w-full text-left px-3 py-2 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2"
                >
                  <FontAwesomeIcon icon={faClock} className="text-[9px] text-slate-400 shrink-0" />
                  <span className="truncate">{item}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Type Filter */}
        <div className="flex items-center gap-0.5 bg-slate-100/60 dark:bg-slate-800/80 p-0.5 rounded-lg shrink-0">
          {[
            { id: 'all', label: 'All' },
            { id: 'scripts', label: 'Scripts' },
            ...(isEnterprise ? [{ id: 'guards', label: 'Sentinels' }] : [])
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTypeFilter(t.id as 'all' | 'scripts' | 'guards')}
              className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all
                ${typeFilter === t.id
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Sort + View Toggle */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="relative" ref={sortRef}>
            <button
              onClick={() => setIsSortOpen(!isSortOpen)}
              className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              <FontAwesomeIcon icon={faSortAmountDown} className="text-[10px]" />
              <span className="hidden sm:inline">{activeSortLabel}</span>
              <FontAwesomeIcon icon={faChevronDown} className={`text-[7px] transition-transform ${isSortOpen ? 'rotate-180' : ''}`} />
            </button>

            {isSortOpen && (
              <div className="absolute top-full right-0 mt-1.5 min-w-[180px] bg-white dark:bg-slate-900 rounded-xl shadow-2xl z-[110] border border-slate-200 dark:border-slate-700 animate-in fade-in slide-in-from-top-1 overflow-hidden">
                <div className="max-h-56 overflow-y-auto custom-scrollbar py-1">
                  {SORT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => { setSortOrder(opt.value); setIsSortOpen(false); }}
                      className={`w-full text-left px-4 py-2 text-[11px] font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between ${sortOrder === opt.value ? 'text-blue-600 dark:text-blue-400 bg-blue-50/30 dark:bg-blue-900/10' : 'text-slate-600 dark:text-slate-300'}`}
                    >
                      {opt.label}
                      {sortOrder === opt.value && <div className="w-1 h-1 rounded-full bg-blue-500" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={() => setIsCompactView(!isCompactView)}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all
              ${isCompactView
                ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50'
              }`}
            title={isCompactView ? "Standard Grid" : "Compact Grid"}
          >
            <FontAwesomeIcon icon={isCompactView ? faExpandAlt : faCompressAlt} className="text-[10px]" />
          </button>
        </div>
      </div>
    </div>
  );
};
