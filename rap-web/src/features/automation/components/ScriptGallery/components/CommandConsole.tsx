import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faExpandAlt, faCompressAlt } from '@fortawesome/free-solid-svg-icons';

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
  return (
    <div className={`flex flex-col xl:flex-row xl:items-center gap-3 p-3 rounded-2xl bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 shadow-xl mb-8 ${!isAuthenticated ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Search Cluster */}
      <div className="flex-1 relative group">
        <FontAwesomeIcon icon={faSearch} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
        <input
          type="text"
          placeholder="Search foundry..."
          className="w-full pl-11 pr-4 py-2.5 rounded-xl border border-transparent bg-slate-50 dark:bg-slate-900 text-sm font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          disabled={!isAuthenticated}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Family Segmented Control */}
        <div className="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/50">
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
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Sort Selector */}
        <div className="relative min-w-[160px]">
          <select
            className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-3 pr-8 py-2 text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 focus:outline-none transition-all cursor-pointer"
            onChange={(e) => setSortOrder(e.target.value)}
            value={sortOrder}
            disabled={!isAuthenticated}
          >
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="author-asc">Author (A-Z)</option>
            <option value="author-desc">Author (Z-A)</option>
            <option value="lastRun-desc">Last Run (Newest)</option>
            <option value="lastRun-asc">Last Run (Oldest)</option>
            <option value="created-desc">Created (Newest)</option>
            <option value="created-asc">Created (Oldest)</option>
            <option value="modified-desc">Modified (Newest)</option>
            <option value="modified-asc">Modified (Oldest)</option>
          </select>
          <FontAwesomeIcon icon={faExpandAlt} className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] text-slate-400 pointer-events-none rotate-45" />
        </div>

        {/* View Toggle */}
        <button
          onClick={() => setIsCompactView(!isCompactView)}
          className={`p-2 px-3 rounded-xl border transition-all flex items-center gap-2
            ${isCompactView
              ? 'bg-blue-50 border-blue-200 text-blue-600'
              : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-400'
            }`}
          title={isCompactView ? "Expand List" : "Compact View"}
        >
          <FontAwesomeIcon icon={isCompactView ? faExpandAlt : faCompressAlt} className="text-xs" />
        </button>
      </div>
    </div>
  );
};
