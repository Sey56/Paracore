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
  faCompressAlt
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
}

export const ScriptCard: React.FC<ScriptCardProps> = ({
  script,
  onSelect,
  isFromActiveWorkspace,
  isCompact = false,
  showExitFocus = false,
  onExitFocus
}) => {
  const {
    selectedScript,
    runningScriptPath,
    runScript,
    setSelectedScript,
    editScript,
    renameScript
  } = useScriptExecution();
  const { toggleFavoriteScript } = useScripts();
  const { setActiveInspectorTab } = useUI();
  const { ParacoreConnected } = useRevitStatus();
  const { isAuthenticated, activeRole } = useAuth();
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

  // Connectivity logic
  const isParacoreConnected = ParacoreConnected;
  const isCompatibleWithDocument = true;

  // Validation
  const visibleParameters = filterVisibleParameters(script.parameters ?? []);
  const validationErrors = validateParameters(visibleParameters);
  const isParamsValid = validationErrors.length === 0;

  // V2.5: Permissive UI treatment - only grayscale the RUN button if disconnected
  // File operations (Edit, Rename) should always be available if authenticated
  const isRunButtonDisabled = !isParacoreConnected || isRunning || !validationErrors.length === 0 || !isAuthenticated;

  const tooltipMessage = !isAuthenticated
    ? "Please sign in to run scripts"
    : !isParacoreConnected
      ? "Paracore is disconnected"
      : validationErrors.length > 0
        ? `Issues: ${validationErrors.join(', ')}`
        : "Run this script";

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
      className={`${styles.scriptCard} script-card bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col ${isSelected ? "ring-2 ring-blue-500" : ""
        } ${isRunning ? "opacity-70" : ""} ${!isAuthenticated ? "opacity-60 grayscale-[0.3]" : ""} ${isCompact ? "min-h-0" : ""} ${isMultiFile ? styles.multiFile : ""} ${showExitFocus ? styles.focusHero : ""}`}
      onClick={handleSelect}
    >
      {/* Exit Focus Button (integrated) */}
      {showExitFocus && onExitFocus && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onExitFocus();
          }}
          className={styles.focusExitButton}
          title="Exit Focus Mode"
        >
          <FontAwesomeIcon icon={faCompressAlt} />
        </button>
      )}

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
            <h3 className={`font-medium text-gray-800 dark:text-gray-100 ${isCompact ? "text-base" : "text-lg"} truncate w-full pr-6`}>
              {script.metadata.displayName || script.name.replace(/\.cs$/, "")}
              {isMultiFile && (
                <span className={styles.multiFileBadge}>
                  <FontAwesomeIcon icon={faFolder} className="mr-1" style={{ fontSize: '0.6rem' }} />
                  Multi
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
                  setActiveInspectorTab('metadata');
                  setSelectedScript(script);
                  setShowMenu(false);
                }}
              >
                <FontAwesomeIcon icon={faEllipsisH} className="mr-2 w-4" />
                View Metadata
              </button>
              {canCreateScripts && (
                <>
                  <button
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      // V2.5 FIX: Passing full object
                      editScript(script);
                      setShowMenu(false);
                    }}
                  >
                    <FontAwesomeIcon icon={faEdit} className="mr-2 w-4" />
                    Edit Code
                  </button>
                  <button
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                    onClick={handleStartRename}
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
