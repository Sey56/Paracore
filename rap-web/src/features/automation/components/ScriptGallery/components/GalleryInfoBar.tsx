import React, { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@/components/ui/Icon';
import { faSync, faShieldHeart, faFolderOpen, faChevronDown, faCheck, faThLarge, faList } from '@/components/ui/iconAliases';
import { defaultCategories } from '@/data/categories';
import { ActiveScriptSource } from '@/context/providers/UIContext';
import { Tooltip } from '@/components/common/Tooltip';

interface GalleryInfoBarProps {
  isAuthenticated: boolean;
  selectedDefaultCategories: string[];
  handleDefaultCategoryChange: (categoryName: string) => void;
  activeScriptSource: ActiveScriptSource;
  selectedFolder: string | null;
  onRefresh: () => void;
  canCreateScripts: boolean;
  onNewScript: () => void;
  onNewSentinel: () => void;
  isCompactView: boolean;
  onToggleDensity: () => void;
}

export const GalleryInfoBar: React.FC<GalleryInfoBarProps> = ({
  isAuthenticated,
  selectedDefaultCategories,
  handleDefaultCategoryChange,
  activeScriptSource,
  selectedFolder,
  onRefresh,
  canCreateScripts,
  onNewScript,
  onNewSentinel,
  isCompactView,
  onToggleDensity,
}) => {
  const [catOpen, setCatOpen] = useState(false);
  const catRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (catRef.current && !catRef.current.contains(e.target as Node)) setCatOpen(false);
    };
    if (catOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [catOpen]);

  const activeCount = selectedDefaultCategories.length;
  const sourcePath = (activeScriptSource && 'path' in activeScriptSource) ? activeScriptSource.path : selectedFolder;
  const displayPath = sourcePath
    ? sourcePath.replace(/\\/g, '/').replace(/\/$/, '')
    : null;

  return (
    <div className={`flex items-center justify-between px-3 py-1.5 gap-3 ${!isAuthenticated ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Left: Path */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <FontAwesomeIcon icon={faFolderOpen} className="text-caption text-slate-400 shrink-0" />
        <span className="text-caption font-bold text-slate-500 dark:text-slate-400 truncate" title={displayPath ?? undefined}>
          {displayPath || 'No source selected'}
        </span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Category dropdown */}
        <div className="relative" ref={catRef}>
          <button
            onClick={() => setCatOpen(!catOpen)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-caption font-bold  tracking-wider text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-muted transition-colors"
          >
            <span>{activeCount > 0 ? `Category (${activeCount})` : 'Category'}</span>
            <FontAwesomeIcon icon={faChevronDown} className={`text-caption transition-transform ${catOpen ? 'rotate-180' : ''}`} />
          </button>

          {catOpen && (
            <div className="absolute right-0 top-full mt-1 min-w-[160px] bg-white dark:bg-slate-900 rounded-xl shadow-lg z-[110] border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
              <div className="py-1">
                {defaultCategories.map(cat => {
                  const isActive = selectedDefaultCategories.includes(cat.name);
                  return (
                    <button
                      key={cat.name}
                      onClick={() => { handleDefaultCategoryChange(cat.name); }}
                      className="w-full text-left px-4 py-2 text-caption font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2">
                        <FontAwesomeIcon icon={cat.icon} className={`text-caption ${cat.color}`} />
                        <span className="text-slate-600 dark:text-slate-300">{cat.name}</span>
                      </span>
                      {isActive && <FontAwesomeIcon icon={faCheck} className="text-caption text-blue-500" />}
                    </button>
                  );
                })}
              </div>
              {activeCount > 0 && (
                <>
                  <div className="border-t border-slate-100 dark:border-slate-800" />
                  <button
                    onClick={() => { [...selectedDefaultCategories].forEach(c => handleDefaultCategoryChange(c)); setCatOpen(false); }}
                    className="w-full text-left px-4 py-2 text-caption font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors  tracking-wider"
                  >
                    Clear All
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        <Tooltip text={isCompactView ? "Card View" : "Compact View"} position="bottom">
          <button
            onClick={onToggleDensity}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-500 hover:bg-muted transition-colors"
          >
            <FontAwesomeIcon icon={isCompactView ? faThLarge : faList} className="text-caption" />
          </button>
        </Tooltip>

        <Tooltip text="Refresh Gallery" position="bottom">
          <button
            onClick={onRefresh}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-500 hover:bg-muted transition-colors"
          >
            <FontAwesomeIcon icon={faSync} className="text-caption" />
          </button>
        </Tooltip>

        {canCreateScripts && (
          <div className="flex items-center gap-1">
            <button
              onClick={onNewScript}
              className="text-caption font-bold text-blue-600 dark:text-blue-400  tracking-wider hover:bg-blue-50 dark:hover:bg-blue-900/20 px-2 py-1 rounded-lg transition-colors whitespace-nowrap"
            >
              + New
            </button>
            <Tooltip text="New Sentinel" position="bottom">
              <button
                onClick={onNewSentinel}
                className="text-caption font-bold text-amber-500 hover:text-amber-600  tracking-wider hover:bg-amber-50 dark:hover:bg-amber-900/20 px-2 py-1 rounded-lg transition-colors flex items-center gap-1"
              >
                <FontAwesomeIcon icon={faShieldHeart} className="text-caption" />
              </button>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
};
