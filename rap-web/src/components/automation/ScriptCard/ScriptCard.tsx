import React from 'react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faStar as fasStar,
  faPlay,
  faEllipsisH,
  faSpinner,
  faExclamationTriangle,
  faCodeBranch,
  faEdit,
  faICursor,
  faFolder,
  faCompressAlt,
  faLock,
  faTools,
  faBullseye
} from "@fortawesome/free-solid-svg-icons";
import { faStar as farStar } from "@fortawesome/free-regular-svg-icons";
import { useRevitStatus } from "@/hooks/useRevitStatus";
import { Script } from "@/types/scriptModel";
import { useScriptExecution } from "@/hooks/useScriptExecution";
import { useScripts } from "@/hooks/useScripts";
import { useUI } from "@/hooks/useUI";
import { filterVisibleParameters, validateParameters } from '@/utils/parameterVisibility';
import styles from './ScriptCard.module.css';
import { useAuth } from '@/hooks/useAuth';

export interface ScriptCardProps {
  script: Script;
  onSelect: () => void;
  isFromActiveWorkspace: boolean;
  isCompact?: boolean;
  showExitFocus?: boolean;
  onExitFocus?: () => void;
  onFocus?: () => void;
}

export const ScriptCard: React.FC<ScriptCardProps> = ({
  script,
  onSelect,
  isFromActiveWorkspace,
  isCompact = false,
  showExitFocus = false,
  onExitFocus,
  onFocus
}) => {
  const {
    selectedScript,
    runningScriptPath,
    runScript,
    setSelectedScript,
    editScript,
    renameScript,
    userEditedScriptParameters
  } = useScriptExecution();
  const { toggleFavoriteScript } = useScripts();
  const { setActiveInspectorTab } = useUI();
  const { ParacoreConnected } = useRevitStatus();
  const { isAuthenticated, activeRole, user } = useAuth();
  const [showMenu, setShowMenu] = React.useState(false);
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState('');
  const menuRef = React.useRef<HTMLDivElement>(null);
  const renameInputRef = React.useRef<HTMLInputElement>(null);

  const canCreateScripts = activeRole === 'admin' || activeRole === 'developer';

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const isSelected = selectedScript?.id === script.id;
  const isRunning = runningScriptPath === script.id;
  const isMultiFile = script.type === 'multi-file';
  const isTool = script.metadata?.isProtected === true;

  // Connectivity logic
  const isParacoreConnected = ParacoreConnected;
  const isCompatibleWithDocument = true;

  // Validation - use cached parameters if available
  const currentParams = userEditedScriptParameters[script.id] || script.parameters || [];
  const visibleParameters = filterVisibleParameters(currentParams);
  const validationErrors = validateParameters(visibleParameters);
  const isParamsValid = validationErrors.length === 0;

  // V2.5: Permissive UI treatment - only grayscale the RUN button if disconnected
  // File operations (Edit, Rename) should always be available if authenticated
  const isRunButtonDisabled = !isParacoreConnected || isRunning || validationErrors.length > 0 || !isAuthenticated;
  const canEdit = !!user && ParacoreConnected && !script.metadata.isProtected;

  const getEditTitleMessage = () => {
    if (!user) return "You must be signed in to edit scripts";
    if (!ParacoreConnected) return "Paracore is disconnected. Please connect to Revit.";
    if (script.metadata.isProtected) return "Source code for this tool is protected and cannot be edited.";
    return "Edit Script";
  };

  const tooltipMessage = !isAuthenticated
    ? "Please sign in to run scripts"
    : !isParacoreConnected
      ? "Paracore is disconnected"
      : validationErrors.length > 0
        ? `Issues: ${validationErrors.join(', ')}`
        : "Run this script";

  const editTooltipMessage = getEditTitleMessage();

  const handleRunClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRunButtonDisabled) return;

    // UI Activation: Select script and switch to console for immediate feedback
    setSelectedScript(script);
    setActiveInspectorTab('console');

    // Execute
    runScript(script);
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavoriteScript(script.id);
  };

  const handleSelect = () => {
    if (!isAuthenticated) return;
    onSelect();
  };

  const handleStartRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameValue(script.metadata.displayName || script.name.replace(/\.cs$/, ""));
    setIsRenaming(true);
    setShowMenu(false);
  };

  const handleRenameSubmit = async () => {
    if (!renameValue.trim() || renameValue === script.name) {
      setIsRenaming(false);
      return;
    }
    // V2.5 FIX: Passing the full script object
    await renameScript(script, renameValue);
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setIsRenaming(false);
    }
  };

  return (
    <div
      className={`${styles.scriptCard} script-card group bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col ${isSelected ? "ring-2 ring-blue-500" : ""
        } ${isRunning ? "opacity-70" : ""} ${!isAuthenticated ? "opacity-60 grayscale-[0.3]" : ""} ${isCompact ? "min-h-0" : ""} ${isMultiFile ? styles.multiFile : ""} ${isTool ? styles.toolFile : ""} ${showExitFocus ? styles.focusHero : ""}`}
      onClick={handleSelect}
    >

      <div className={`p-4 flex-grow flex flex-col ${isCompact ? "py-2" : ""}`}>
        <div className="flex justify-between items-start mb-2">
          {isRenaming ? (
            <input
              ref={renameInputRef}
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={handleRenameSubmit}
              onClick={(e) => e.stopPropagation()}
              className={`${styles.renameInput} text-gray-800 dark:text-gray-100`}
              autoFocus
            />
          ) : (
            <h3
              className={`font-medium ${(isSelected || showExitFocus) ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'} group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors duration-200 ${isCompact ? "text-base" : "text-lg"} truncate w-full pr-6`}
              title={script.metadata.displayName || script.name.replace(/\.cs$/, "")}
            >
              {script.metadata.displayName || script.name.replace(/\.cs$/, "")}
              {isMultiFile && (
                <span className={styles.multiFileBadge}>
                  <FontAwesomeIcon icon={faFolder} className="mr-1" style={{ fontSize: '0.6rem' }} />
                  Multi
                </span>
              )}
              {script.metadata.isProtected && (
                <span className={`${styles.multiFileBadge} !bg-amber-100 !text-amber-700 dark:!bg-amber-900/30 dark:!text-amber-400 border border-amber-200 dark:border-amber-800 ml-2`}>
                  <FontAwesomeIcon icon={faTools} className="mr-1" style={{ fontSize: '0.6rem' }} />
                  Tool
                </span>
              )}
            </h3>
          )}
          <button
            onClick={handleFavoriteClick}
            className={`${script.isFavorite
              ? "text-yellow-400 hover:text-yellow-500"
              : "text-gray-400 dark:text-gray-500 hover:text-yellow-400 dark:hover:text-yellow-300"
              }`}
          >
            {script.isFavorite ? <FontAwesomeIcon icon={fasStar} /> : <FontAwesomeIcon icon={farStar} />}
          </button>
        </div>

        {!isCompact && (
          <>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2 truncate">
              {script.metadata.categories?.join(', ') || ''}
            </div>
            <p className={`${styles.description} text-gray-600 dark:text-gray-300 text-sm mb-4 flex-grow`}>
              {script.metadata.description}
            </p>
            <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
              <span className="truncate mr-2">{script.metadata.author || 'Unknown Author'}</span>
              <span className="shrink-0">{script.metadata.documentType || 'Any'}</span>
            </div>
          </>
        )}
      </div>

      <div className="card-actions border-t border-gray-200 dark:border-gray-700 p-2 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50 rounded-b-lg">
        <div className="relative">
          <button
            className={`text-sm px-3 py-1 flex items-center rounded transition-colors ${isRunButtonDisabled
              ? 'text-gray-400 cursor-not-allowed opacity-50'
              : 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-bold'
              }`}
            onClick={handleRunClick}
            disabled={isRunButtonDisabled}
            title={tooltipMessage}
          >
            <FontAwesomeIcon
              icon={isRunning ? faSpinner : faPlay}
              className={`mr-1 ${isRunning ? "animate-spin" : ""}`}
            />
            {isRunning ? "Running..." : "Run"}
          </button>
        </div>

        <div className="flex items-center relative" ref={menuRef}>
          {((onFocus && !showExitFocus) || (onExitFocus && showExitFocus)) && (
            <button
              className={showExitFocus
                ? "text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 rounded-full w-8 h-8 flex items-center justify-center mr-2 transition-all shadow-sm"
                : "text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 p-1 mr-1"}
              onClick={(e) => {
                e.stopPropagation();
                if (showExitFocus && onExitFocus) {
                  onExitFocus();
                } else if (onFocus) {
                  onSelect();
                  onFocus();
                }
              }}
              title={showExitFocus ? "Exit Focus Mode" : "Focus View"}
            >
              <FontAwesomeIcon icon={showExitFocus ? faCompressAlt : faBullseye} />
            </button>
          )}
          {isMultiFile && (
            <div className="mr-2 text-blue-500" title="This is a multi-file script">
              <FontAwesomeIcon icon={faFolder} />
            </div>
          )}
          {script.metadata.isProtected && (
            <div className="mr-2 text-amber-500" title="This is a protected tool">
              <FontAwesomeIcon icon={faTools} />
            </div>
          )}
          <button
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
          >
            <FontAwesomeIcon icon={faEllipsisH} />
          </button>

          {showMenu && (
            <div className="absolute right-0 bottom-full mb-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-xl border border-gray-200 dark:border-gray-700 z-50 overflow-hidden">
              <button
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect();
                  setActiveInspectorTab('metadata');
                  setSelectedScript(script);
                  setShowMenu(false);
                }}
              >
                <FontAwesomeIcon icon={faEllipsisH} className="mr-2 w-4" />
                View Metadata
              </button>
              {canCreateScripts && !script.metadata.isProtected && (
                <>
                  <button
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect();
                      // V2.5 FIX: Passing full object
                      editScript(script);
                      setShowMenu(false);
                    }}
                    title={editTooltipMessage}
                  >
                    <FontAwesomeIcon icon={faEdit} className="mr-2 w-4" />
                    Edit Code
                  </button>
                  <button
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                    onClick={(e) => {
                      onSelect();
                      handleStartRename(e);
                    }}
                  >
                    <FontAwesomeIcon icon={faICursor} className="mr-2 w-4" />
                    Rename
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
