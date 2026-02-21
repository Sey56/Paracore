import React from 'react';
import { SidebarSection } from '../SidebarSection';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faStar, faBroom } from "@fortawesome/free-solid-svg-icons";
import { Script } from '@/types/index';

interface FavoritesListProps {
  scripts: Script[];
  setSelectedScript: (script: Script | null) => void;
  setActiveInspectorTab: (tab: any) => void;
  onClear: () => void;
}

export const FavoritesList: React.FC<FavoritesListProps> = ({
  scripts,
  setSelectedScript,
  setActiveInspectorTab,
  onClear
}) => {
  const favoriteScripts = scripts.filter((s: Script) => s.isFavorite);

  return (
    <SidebarSection
      title="Favorites"
      icon={faStar}
      iconColor="text-yellow-400"
      defaultExpanded={true}
      actions={
        favoriteScripts.length > 0 && (
          <button
            className="text-gray-400 hover:text-red-500 p-1.5 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onClear();
            }}
            title="Clear Favorites"
          >
            <FontAwesomeIcon icon={faBroom} className="w-3 h-3" />
          </button>
        )
      }
    >
      <ul className="space-y-0.5 pr-2">
        {favoriteScripts.map((script: Script) => (
          <li
            key={script.id}
            className="group flex items-center py-1.5 px-3 rounded-xl hover:bg-blue-50/50 dark:hover:bg-blue-900/10 cursor-pointer text-gray-700 dark:text-gray-300 transition-all border border-transparent hover:border-blue-100/50 dark:hover:border-blue-900/30 active:scale-[0.98]"
            onClick={() => { setSelectedScript(script); setActiveInspectorTab('parameters'); }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 mr-3 shrink-0 group-hover:scale-125 transition-transform" />
            <span className="truncate text-sm font-bold leading-none">{(script.metadata?.displayName || script.name).replace(/\.cs$/, "")}</span>
          </li>
        ))}
        {favoriteScripts.length === 0 && (
          <li className="text-sm text-gray-400 italic px-2 py-1.5 bg-gray-50/50 dark:bg-gray-900/30 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">No favorites yet</li>
        )}
      </ul>
    </SidebarSection>
  );
};
