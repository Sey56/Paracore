import React from 'react';
import { SidebarSection } from '../SidebarSection';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faGlobe, faSync, faChevronDown, faPlus } from "@fortawesome/free-solid-svg-icons";
import { TeamScriptSource } from '@/types/index';

interface TeamRegistryManagerProps {
  selectedUnclonedSourceId: number | null;
  setSelectedUnclonedSourceId: (id: number | null) => void;
  currentTeamSources: TeamScriptSource[];
  userSourcePaths: Record<string, { path: string; repo_url?: string }>;
  onClone: () => void;
  onRefresh: () => void;
  onRegister: () => void;
}

export const TeamRegistryManager: React.FC<TeamRegistryManagerProps> = ({
  selectedUnclonedSourceId,
  setSelectedUnclonedSourceId,
  currentTeamSources,
  userSourcePaths,
  onClone,
  onRefresh,
  onRegister
}) => {
  return (
    <SidebarSection
      title="TeamSource Registry"
      icon={faGlobe}
      iconColor="text-slate-400"
      defaultExpanded={false}
      actions={
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRegister();
            }}
            className="text-gray-400 hover:text-blue-500 p-1.5 transition-colors"
            title="Register TeamSource"
          >
            <FontAwesomeIcon icon={faPlus} className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
            className="text-gray-400 hover:text-blue-500 p-1.5 transition-colors"
            title="Refresh Team Sources"
          >
            <FontAwesomeIcon icon={faSync} className="w-3 h-3" />
          </button>
        </div>
      }
    >
      <div className="space-y-2 pr-2">
        <div className="relative group">
          <select
            value={selectedUnclonedSourceId ?? ''}
            onChange={(e) => setSelectedUnclonedSourceId(e.target.value === '' ? null : Number(e.target.value))}
            className="w-full appearance-none bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700/50 rounded-xl pl-3 pr-8 py-2 text-sm font-black text-gray-700 dark:text-gray-200 focus:border-blue-500/40 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all cursor-pointer group-hover:border-gray-200 dark:group-hover:border-gray-700 shadow-sm"
          >
            <option value="" disabled className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">Cloud availability...</option>
            {currentTeamSources.map((source) => (
              <option key={source.id} value={source.id} className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
                {source.name}
              </option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 dark:text-gray-500 border-l border-gray-100 dark:border-gray-800 pl-2">
            <FontAwesomeIcon icon={faChevronDown} className="text-[10px]" />
          </div>
        </div>

        {selectedUnclonedSourceId !== null && !userSourcePaths[selectedUnclonedSourceId] && (
          <div className="px-1 animate-in slide-in-from-top-1 duration-300">
            <button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-black uppercase tracking-widest py-1.5 rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-95 flex items-center justify-center gap-2"
              onClick={onClone}
            >
              <FontAwesomeIcon icon={faSync} className="text-[10px]" />
              Initialize Local Sync
            </button>
          </div>
        )}
      </div>
    </SidebarSection>
  );
};
