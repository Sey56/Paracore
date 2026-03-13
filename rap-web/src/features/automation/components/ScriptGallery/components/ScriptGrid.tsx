import React, { memo, useMemo } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldHeart } from '@fortawesome/free-solid-svg-icons';
import { Script } from '@/types/scriptModel';
import { ScriptCard } from '../../ScriptCard/ScriptCard';
import { 
  useExecutionState, 
  useScriptSelection, 
  useScriptData 
} from '../../../hooks/useScriptExecution';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { useAuth } from '@/features/auth';
import { useWatchdog } from '@/context/providers/WatchdogProvider';
import { useScripts } from '../../../hooks/useScripts';
import { filterVisibleParameters, validateParameters } from '@/utils/parameterVisibility';

interface ScriptGridProps {
  favoriteScripts: Script[];
  otherScripts: Script[];
  handleScriptSelect: (script: Script) => void;
  isFromActiveSource: (script: Script) => boolean;
  isCompactView: boolean;
  handleEnterFocusMode: (rect: DOMRect) => void;
  handleReplaceScript: (script: Script) => void;
  isAuthenticated: boolean;
  searchTerm: string;
}

const ScriptGridComponent = ({
  favoriteScripts,
  otherScripts,
  handleScriptSelect,
  isFromActiveSource,
  isCompactView,
  handleEnterFocusMode,
  handleReplaceScript,
  isAuthenticated,
  searchTerm
}: ScriptGridProps) => {
  // 1. Pull all volatile context once at the grid level
  const { runningScriptPath } = useExecutionState();
  const { selectedScript } = useScriptSelection();
  const { userEditedScriptParameters } = useScriptData();
  const { ParacoreConnected, revitStatus } = useRevitStatus();
  const { watchdogs } = useWatchdog();
  const { isSyncActive } = useScripts();

  // 2. Helper to calculate props for a script (Dumb Card Pattern)
  const getScriptProps = (script: Script) => {
    const isSelected = selectedScript?.id?.toLowerCase().replace(/\\/g, '/') === script.id?.toLowerCase().replace(/\\/g, '/');
    const isRunning = runningScriptPath === script.id;
    
    const path = (script.absolutePath || script.id || script.name || "").toLowerCase().replace(/\\/g, '/');
    const isWTool = path.endsWith('.wtool') || path.includes('.wtool/');
    const isPTool = path.endsWith('.ptool') || path.includes('.ptool/');
    
    const isGuard = script.metadata?.isWatchdog === true ||
      script.metadata?.is_watchdog === true ||
      (script.metadata as any)?.IsWatchdog === true ||
      path.endsWith('.wtool') ||
      path.includes('.wtool');

    const isProtectedTool = script.metadata?.isProtected === true || script.metadata?.isCompiled === true || isPTool || isWTool;

    const isArmed = isGuard && watchdogs.some(w => w.script_path.toLowerCase().replace(/\\/g, '/') === path);
    const isActiveInIDE = isSyncActive(script.absolutePath);

    const requiredDocType = script.metadata.documentType || 'Any';
    const currentDocType = revitStatus?.documentType || 'Any';

    const isCompatibleWithDocument = !ParacoreConnected || revitStatus?.document === null || requiredDocType === 'Any' || currentDocType === 'Any' || requiredDocType.toLowerCase() === currentDocType.toLowerCase();

    const currentParams = userEditedScriptParameters[script.id] || script.parameters || [];
    const visibleParameters = filterVisibleParameters(currentParams);
    const validationErrors = validateParameters(visibleParameters);

    const isRunButtonDisabled = !ParacoreConnected || !isCompatibleWithDocument || isRunning || validationErrors.length > 0 || !isAuthenticated;

    const tooltipMessage = !isAuthenticated
      ? "Please sign in to run scripts"
      : !ParacoreConnected
        ? "Paracore is disconnected"
        : revitStatus?.document === null
          ? "No document opened in Revit"
          : !isCompatibleWithDocument
            ? `Script requires '${requiredDocType}' but current is '${currentDocType}'`
            : validationErrors.length > 0
              ? validationErrors.join('\n')
              : "";

    return {
      isRunning,
      isSelected,
      isArmed,
      isActiveInIDE,
      isRunButtonDisabled,
      tooltipMessage
    };
  };

  return (
    <div className="relative flex flex-col">
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
            {favoriteScripts.map((script) => {
              const statusProps = getScriptProps(script);
              return (
                <ScriptCard
                  key={script.id}
                  script={script}
                  {...statusProps}
                  onSelect={() => handleScriptSelect(script)}
                  isFromActiveSource={isFromActiveSource(script)}
                  isCompact={true}
                  onFocus={handleEnterFocusMode}
                  onReplace={handleReplaceScript}
                />
              );
            })}
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
            {otherScripts.map((script) => {
              const statusProps = getScriptProps(script);
              return (
                <ScriptCard
                  key={script.id}
                  script={script}
                  {...statusProps}
                  onSelect={() => handleScriptSelect(script)}
                  isFromActiveSource={isFromActiveSource(script)}
                  isCompact={isCompactView}
                  onFocus={handleEnterFocusMode}
                  onReplace={handleReplaceScript}
                />
              );
            })}
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
};

export const ScriptGrid = memo(ScriptGridComponent);
ScriptGrid.displayName = 'ScriptGrid';
