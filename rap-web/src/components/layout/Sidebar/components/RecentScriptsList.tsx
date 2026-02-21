import React from 'react';
import { SidebarSection } from '../SidebarSection';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClock, faBroom } from "@fortawesome/free-solid-svg-icons";
import { Script } from '@/types/index';

interface RecentScriptsListProps {
  recentScripts: string[];
  scripts: Script[];
  setSelectedScript: (script: Script | null) => void;
  setActiveInspectorTab: (tab: any) => void;
  onClear: () => void;
}

export const RecentScriptsList: React.FC<RecentScriptsListProps> = ({
  recentScripts,
  scripts,
  setSelectedScript,
  setActiveInspectorTab,
  onClear
}) => {
  const scriptsToRender = recentScripts
    .map(id => scripts.find(s => s.id === id))
    .filter((s): s is Script => !!s);

  return (
    <SidebarSection
      title="Recent"
      icon={faClock}
      iconColor="text-indigo-400"
      defaultExpanded={false}
      actions={
        scriptsToRender.length > 0 && (
          <button
            className="text-gray-400 hover:text-red-500 p-1.5 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            title="Clear Recents"
          >
            <FontAwesomeIcon icon={faBroom} className="w-3 h-3" />
          </button>
        )
      }
    >
      <ul className="space-y-0.5 pr-2">
        {scriptsToRender.map((script: Script) => (
          <li
            key={script.id}
            className="group flex items-center py-1.5 px-3 rounded-xl hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 cursor-pointer text-gray-700 dark:text-gray-300 transition-all border border-transparent hover:border-indigo-100/50 dark:hover:border-indigo-900/30 active:scale-[0.98]"
            onClick={() => { setSelectedScript(script); setActiveInspectorTab('parameters'); }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-300 dark:bg-indigo-500 mr-3 shrink-0 group-hover:scale-125 transition-transform" />
            <span className="truncate text-sm font-bold leading-none">{(script.metadata?.displayName || script.name).replace(/\.cs$/, "")}</span>
          </li>
        ))}
        {scriptsToRender.length === 0 && (
          <li className="text-sm text-gray-400 italic px-2 py-1.5 bg-gray-50/50 dark:bg-gray-900/30 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">No recent activity</li>
        )}
      </ul>
    </SidebarSection>
  );
};
