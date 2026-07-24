import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldHeart } from '@fortawesome/free-solid-svg-icons';
import { Script } from '@/types/scriptModel';
import { ScriptCard } from '../../ScriptCard/ScriptCard';
import { useScriptExecution } from '@/features/automation/hooks/useScriptExecution';

interface ScriptGridProps {
  favoriteScripts: Script[];
  otherScripts: Script[];
  handleScriptSelect: (script: Script) => void;
  isFromActiveSource: (script: Script) => boolean;
  isCompactView: boolean;
  handleEnterFocusMode: (rect: DOMRect) => void;
  handleReplaceScript: (script: Script) => void;
  handleDoubleClickScript?: (script: Script) => void;
  isAuthenticated: boolean;
  searchTerm: string;
}

export const ScriptGrid: React.FC<ScriptGridProps> = React.memo(({
  favoriteScripts,
  otherScripts,
  handleScriptSelect,
  isFromActiveSource,
  isCompactView,
  handleEnterFocusMode,
  handleReplaceScript,
  handleDoubleClickScript,
  isAuthenticated,
  searchTerm
}) => {
  const { selectedScript } = useScriptExecution();
  
  const getIsSelected = (scriptId: string) => {
    return selectedScript?.id?.toLowerCase().replace(/\\/g, '/') === scriptId.toLowerCase().replace(/\\/g, '/');
  };

  return (
    <div className="relative flex flex-col pt-1">
      {/* Favorites Section */}
      {favoriteScripts.length > 0 && (
        <div className="mb-8 w-full order-1">
          <div className="flex items-center gap-4 mb-6 opacity-60">
            <div className="flex items-center gap-2 shrink-0">
              <FontAwesomeIcon icon={faShieldHeart} className="text-[10px] text-yellow-500" />
              <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.25em]">
                Pinned Units
              </span>
            </div>
            <div className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent dark:from-slate-700" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {favoriteScripts.map((script) => (
              <ScriptCard
                key={script.id}
                script={script}
                isSelected={getIsSelected(script.id)}
                onSelect={() => handleScriptSelect(script)}
                isFromActiveSource={isFromActiveSource(script)}
                isCompact={true}
                onFocus={handleEnterFocusMode}
                onReplace={handleReplaceScript}
                onDoubleClick={handleDoubleClickScript ? () => handleDoubleClickScript(script) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Divider between sections */}
      {favoriteScripts.length > 0 && otherScripts.length > 0 && (
        <div className="flex items-center gap-4 mt-2 mb-8 order-2 w-full opacity-60">
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-1 h-1 rounded-full bg-slate-400" />
            <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.25em]">
              General Registry
            </span>
          </div>
          <div className="h-px flex-1 bg-gradient-to-r from-slate-200 to-transparent dark:from-slate-700" />
        </div>
      )}

      {/* Other Scripts Section */}
      {otherScripts.length > 0 && (
        <div className="w-full order-3">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {otherScripts.map((script) => (
              <ScriptCard
                key={script.id}
                script={script}
                isSelected={getIsSelected(script.id)}
                onSelect={() => handleScriptSelect(script)}
                isFromActiveSource={isFromActiveSource(script)}
                isCompact={isCompactView}
                onFocus={handleEnterFocusMode}
                onReplace={handleReplaceScript}
                onDoubleClick={handleDoubleClickScript ? () => handleDoubleClickScript(script) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty States */}
      {favoriteScripts.length === 0 && otherScripts.length === 0 && (
        <div className="text-gray-500 dark:text-gray-400 text-sm italic py-20 text-center order-4 w-full uppercase font-black tracking-widest opacity-40">
          {isAuthenticated ? (searchTerm ? 'No matching units found.' : 'No units stationed in this source.') : 'Sign in to load scripts.'}
        </div>
      )}
    </div>
  );
});
