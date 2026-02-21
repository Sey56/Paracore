import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSync, faGlobe, faShieldHeart } from '@fortawesome/free-solid-svg-icons';
import { defaultCategories } from '@/data/categories';
import { ActiveScriptSource } from '@/context/providers/UIContext';

interface GalleryHeaderProps {
  isAuthenticated: boolean;
  selectedDefaultCategories: string[];
  handleDefaultCategoryChange: (categoryName: string) => void;
  activeScriptSource: ActiveScriptSource;
  selectedFolder: string | null;
  totalUnits: number;
  onRefresh: () => void;
  canCreateScripts: boolean;
  onNewScript: () => void;
  onNewSentinel: () => void;
}

export const GalleryHeader: React.FC<GalleryHeaderProps> = ({
  isAuthenticated,
  selectedDefaultCategories,
  handleDefaultCategoryChange,
  activeScriptSource,
  selectedFolder,
  totalUnits,
  onRefresh,
  canCreateScripts,
  onNewScript,
  onNewSentinel
}) => {
  return (
    <div className="flex flex-col space-y-4 mb-6">
      {/* Category Filter Chips */}
      <div className={`flex flex-wrap gap-1.5 ${!isAuthenticated ? 'opacity-50 pointer-events-none' : ''}`}>
        {defaultCategories.map(category => {
          const isActive = selectedDefaultCategories.includes(category.name);
          return (
            <button
              key={category.name}
              onClick={() => handleDefaultCategoryChange(category.name)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black transition-all duration-200 border uppercase tracking-wider
                ${isActive
                  ? 'bg-blue-600 border-blue-500 text-white shadow-md'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-blue-400'
                }`}
            >
              <FontAwesomeIcon icon={category.icon} className={isActive ? 'text-white' : `text-[10px] ${category.color}`} />
              <span>{category.name}</span>
            </button>
          );
        })}
      </div>

      <div className="flex justify-between items-start">
        <div className="flex flex-col space-y-1 min-w-0">
          <div className="flex items-center space-x-2">
            <div className="w-1 h-4 bg-blue-600 dark:bg-blue-500 rounded-full" />
            <h1 className="text-sm font-black text-slate-700 dark:text-slate-200 tracking-tight uppercase">
              {activeScriptSource?.type === 'team' ? 'Team Scripts' : (activeScriptSource?.type === 'local' ? 'Local Scripts' : 'All Scripts')}
            </h1>
          </div>
          {selectedFolder && (
            <div className="flex items-center space-x-2 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/30 max-w-[500px]">
              <FontAwesomeIcon icon={faGlobe} className="text-[10px] text-slate-400" />
              <span className="text-[12px] font-bold text-slate-500 dark:text-slate-400 truncate lowercase italic">
                {selectedFolder}
              </span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end space-y-1 shrink-0">
          <span className="text-[11px] font-black text-slate-400 dark:text-slate-500 tabular-nums tracking-[0.1em]">
            {totalUnits} UNITS STATIONED
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              className="p-1.5 text-slate-400 hover:text-blue-500 transition-colors"
              title="Refresh Gallery"
            >
              <FontAwesomeIcon icon={faSync} className="text-xs" />
            </button>
            {canCreateScripts && (
              <div className="flex items-center gap-0.5 relative group/newbtn ml-2">
                <button
                  onClick={onNewScript}
                  className="text-[11px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest hover:underline whitespace-nowrap"
                >
                  + New Script
                </button>
                <div className="w-px h-3 bg-slate-200 dark:bg-slate-700 mx-2" />
                <button
                  onClick={onNewSentinel}
                  className="text-[11px] font-black text-amber-500 hover:text-amber-600 uppercase tracking-widest hover:underline flex items-center gap-1"
                  title="New Sentinel"
                >
                  <FontAwesomeIcon icon={faShieldHeart} className="text-[9px]" />
                  Sentinel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
