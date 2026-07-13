import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar as fasStar, faChevronUp, faChevronDown, faTools } from '@fortawesome/free-solid-svg-icons';
import { faStar as farStar } from '@fortawesome/free-regular-svg-icons';
import { Script } from '@/types/scriptModel';

interface ScriptHeaderProps {
  script: Script;
  onToggleFavorite: (scriptId: string) => void;
  disabled?: boolean;
  isFavoriteProp: boolean;
  hideFavoriteButton?: boolean;
}

export const ScriptHeader: React.FC<ScriptHeaderProps> = ({ script, onToggleFavorite, disabled, isFavoriteProp, hideFavoriteButton }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className={`mb-6 border-b border-slate-200/50 dark:border-slate-700/40 pb-4 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-medium text-xl text-slate-700 dark:text-slate-100 flex items-center gap-2">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 text-sm focus:outline-none"
            title={isCollapsed ? "Expand Details" : "Collapse Details"}
          >
            <FontAwesomeIcon icon={isCollapsed ? faChevronDown : faChevronUp} />
          </button>
          {(script.metadata?.displayName || script.name || "").replace(/\.cs$/, "")}
          {script.metadata?.isProtected && (
            <span className="ml-2 px-1.5 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded border border-amber-200 dark:border-amber-800 flex items-center inline-flex">
              <FontAwesomeIcon icon={faTools} className="mr-1" style={{ fontSize: '0.6rem' }} />
              Tool
            </span>
          )}
        </h3>
        {!hideFavoriteButton && (
          <button
            onClick={() => onToggleFavorite(script.id)}
            className={`${isFavoriteProp ? 'text-yellow-400 hover:text-yellow-500' : 'text-slate-400 dark:text-slate-500 hover:text-yellow-400 dark:hover:text-yellow-300'}`}
          >
            {isFavoriteProp ? (
              <FontAwesomeIcon icon={fasStar} />
            ) : (
              <FontAwesomeIcon icon={farStar} />
            )}
          </button>
        )}
      </div>

      {!isCollapsed && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Categories */}
          {script.metadata?.categories && script.metadata.categories.length > 0 && (
            <div className="text-sm text-slate-500 dark:text-slate-400 mb-2 pl-6">
              {script.metadata.categories.join(', ')}
            </div>
          )}

          {/* Description */}
          {script.metadata?.description && (
            <p className="text-slate-500 dark:text-slate-400 mb-4 pl-6 text-sm leading-relaxed">{script.metadata.description}</p>
          )}

          {/* Author */}
          <div className="flex justify-between items-center text-sm text-slate-500 dark:text-slate-400 pl-6">
            <span>{script.metadata?.author || 'Unknown Author'}</span>
          </div>
        </div>
      )}
    </div>
  );
};

