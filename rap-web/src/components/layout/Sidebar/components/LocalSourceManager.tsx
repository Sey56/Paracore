import React, { useState, useEffect } from 'react';
import { SidebarSection } from '../SidebarSection';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFolder, faPlus, faBroom, faChevronDown, faTrash } from "@fortawesome/free-solid-svg-icons";
import { ActiveScriptSource } from '@/context/providers/UIContext';
import { getFolderNameFromPath, normalizePath } from '@/utils/pathHelpers';

interface LocalSourceManagerProps {
  activeScriptSource: ActiveScriptSource;
  setActiveScriptSource: (source: ActiveScriptSource) => void;
  customScriptFolders: string[];
  onAddExisting: () => void;
  onClear: () => void;
  onUnload: (source: { id: number; name: string; repo_url: string; path: string }) => void;
}

export const LocalSourceManager: React.FC<LocalSourceManagerProps> = ({
  activeScriptSource,
  setActiveScriptSource,
  customScriptFolders,
  onAddExisting,
  onClear,
  onUnload
}) => {
  const [localDropdownOpen, setLocalDropdownOpen] = useState(false);

  useEffect(() => {
    const closeDropdown = () => setLocalDropdownOpen(false);
    if (localDropdownOpen) window.addEventListener('click', closeDropdown);
    return () => window.removeEventListener('click', closeDropdown);
  }, [localDropdownOpen]);

  return (
    <SidebarSection
      title="Local Sources"
      icon={faFolder}
      iconColor="text-amber-500"
      defaultExpanded={true}
      actions={
        <div className="flex items-center space-x-1 tooltip-left">
          <button
            className="text-gray-400 hover:text-blue-500 p-1.5 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onAddExisting();
            }}
            title="Load or Initialize Source">
            <FontAwesomeIcon icon={faFolder} className="w-3 h-3" />
          </button>
          {customScriptFolders.length > (activeScriptSource?.type === 'local' && activeScriptSource.path && customScriptFolders.some(f => normalizePath(f) === normalizePath(activeScriptSource.path)) ? 1 : 0) && (
            <button
              className="text-gray-400 hover:text-red-500 p-1.5 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
              }}
              title="Unload all non-active sources"
            >
              <FontAwesomeIcon icon={faBroom} className="w-3 h-3" />
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-1.5 pr-2">
        {customScriptFolders.length > 0 ? (
          <div className="flex items-center gap-3 group/source">
            <div className="relative flex-1">
              <div
                onClick={(e) => { e.stopPropagation(); setLocalDropdownOpen(!localDropdownOpen); }}
                className="w-full bg-gray-100 dark:bg-gray-900 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-800 rounded-xl pl-3 pr-3 py-2 text-sm font-bold text-gray-600 dark:text-gray-400 cursor-pointer transition-all flex items-center justify-between"
              >
                <span className="truncate">
                  {activeScriptSource?.type === 'local'
                    ? getFolderNameFromPath(activeScriptSource.path || '')
                    : 'Select source...'}
                </span>
                <FontAwesomeIcon icon={faChevronDown} className={`text-[10px] transition-transform duration-300 ${localDropdownOpen ? 'rotate-180' : ''}`} />
              </div>

              {localDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 z-[100] bg-white dark:bg-gray-800 shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="max-h-60 overflow-y-auto custom-scrollbar py-1.5">
                    {customScriptFolders.map((folder) => (
                      <div
                        key={folder}
                        onClick={() => {
                          setActiveScriptSource({ type: 'local', path: folder });
                          setLocalDropdownOpen(false);
                        }}
                        className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:text-blue-600 dark:hover:text-blue-300 cursor-pointer transition-colors"
                      >
                        {getFolderNameFromPath(folder)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="w-[34px] flex items-center justify-center shrink-0">
              {activeScriptSource?.type === 'local' && activeScriptSource.path && (
                <div className="opacity-100 transition-all duration-300" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 rounded-lg p-0.5 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnload({
                          id: 0,
                          name: getFolderNameFromPath(activeScriptSource.path || ''),
                          repo_url: '',
                          path: activeScriptSource.path || ''
                        });
                      }}
                      className="text-rose-400 hover:text-rose-600 transition-colors p-1.5 tooltip-left"
                      title="Unload active source"
                    >
                      <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-400 italic px-2 py-1.5 bg-gray-50/50 dark:bg-gray-900/30 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">No folders added</div>
        )}
      </div>
    </SidebarSection>
  );
};
