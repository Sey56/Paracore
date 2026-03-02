import React, { useState, useEffect } from 'react';
import { SidebarSection } from '../SidebarSection';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCodeBranch, faSync, faChevronDown, faTrash } from "@fortawesome/free-solid-svg-icons";
import { ActiveScriptSource } from '@/context/providers/UIContext';
import { TeamScriptSource } from '@/types/index';
import { Role } from '@/features/auth';
import { getFolderNameFromPath } from '@/utils/pathHelpers';

interface TeamSourceManagerProps {
  activeScriptSource: ActiveScriptSource;
  setActiveScriptSource: (source: ActiveScriptSource) => void;
  teamScriptSources: (TeamScriptSource & { isOrphaned?: boolean; path?: string })[];
  userSourcePaths: Record<string, { path: string; repo_url?: string }>;
  onUnload: (source: TeamScriptSource) => void;
  onUpdate: (path: string) => void;
  activeRole: string | null;
}

export const TeamSourceManager: React.FC<TeamSourceManagerProps> = ({
  activeScriptSource,
  setActiveScriptSource,
  teamScriptSources,
  userSourcePaths,
  onUnload,
  onUpdate,
  activeRole
}) => {
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);

  useEffect(() => {
    const closeDropdown = () => setTeamDropdownOpen(false);
    if (teamDropdownOpen) window.addEventListener('click', closeDropdown);
    return () => window.removeEventListener('click', closeDropdown);
  }, [teamDropdownOpen]);

  return (
    <SidebarSection
      title="Team Script Sources"
      icon={faCodeBranch}
      iconColor="text-green-500"
      defaultExpanded={true}
      actions={
        activeRole === Role.User && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (activeScriptSource?.type === 'team' && activeScriptSource.path) {
                onUpdate(activeScriptSource.path);
              }
            }}
            disabled={activeScriptSource?.type !== 'team'}
            className="text-gray-400 hover:text-blue-500 p-1.5 transition-colors"
            title="Update Source"
          >
            <FontAwesomeIcon icon={faSync} className="w-3 h-3" />
          </button>
        )
      }
    >
      <div className="space-y-2 pr-2">
        <div className="flex items-center gap-3 group/team-source">
          <div className="relative flex-1">
            <div
              onClick={(e) => { e.stopPropagation(); setTeamDropdownOpen(!teamDropdownOpen); }}
              className="w-full bg-gray-100 dark:bg-gray-900 border-2 border-transparent hover:border-gray-200 dark:hover:border-gray-800 rounded-xl pl-3 pr-3 py-2 text-sm font-bold text-gray-600 dark:text-gray-400 cursor-pointer transition-all flex items-center justify-between"
            >
              <span className="truncate">
                {activeScriptSource?.type === 'team'
                  ? (teamScriptSources.find(s => String(s.id) === activeScriptSource.id)?.name || 'Select source...')
                  : 'Select source...'}
              </span>
              <FontAwesomeIcon icon={faChevronDown} className={`text-[10px] transition-transform duration-300 ${teamDropdownOpen ? 'rotate-180' : ''}`} />
            </div>

            {teamDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 z-[100] bg-white dark:bg-gray-800 shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="max-h-60 overflow-y-auto py-1.5">
                  {teamScriptSources.map((source) => (
                    <div
                      key={source.id}
                      onClick={() => {
                        const localPath = userSourcePaths[source.id]?.path;
                        if (localPath) setActiveScriptSource({ type: 'team', id: String(source.id), path: localPath });
                        setTeamDropdownOpen(false);
                      }}
                      className="px-4 py-2 text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:text-blue-600 dark:hover:text-blue-300 cursor-pointer transition-colors flex items-center justify-between"
                    >
                      <span>{source.name}</span>
                      {source.isOrphaned && <span className="text-[10px]">⚠️</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="w-[34px] flex items-center justify-center shrink-0">
            {activeScriptSource?.type === 'team' && (
              <div className="opacity-0 group-hover/team-source:opacity-100 transition-all duration-300 translate-x-2 group-hover/team-source:translate-x-0" onClick={e => e.stopPropagation()}>
                <div className="flex items-center bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 rounded-lg p-0.5 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (activeScriptSource?.type === 'team') {
                        const path = activeScriptSource.path;
                        const sourceToRemove: any = {
                          id: Number(activeScriptSource.id) || 0,
                          name: getFolderNameFromPath(path),
                          repo_url: userSourcePaths[Number(activeScriptSource.id)]?.repo_url || '',
                          path: path
                        };
                        onUnload(sourceToRemove);
                      }
                    }}
                    className="text-gray-400 hover:text-red-500 transition-colors p-1.5"
                    title="Unload active source"
                  >
                    <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </SidebarSection>
  );
};
