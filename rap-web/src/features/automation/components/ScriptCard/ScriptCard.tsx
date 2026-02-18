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
  faBroom,
  faCompressAlt,
  faLock,
  faTools,
  faBullseye,
  faTrash,
  faSyncAlt,
  faShieldHeart
} from "@fortawesome/free-solid-svg-icons";
import { faStar as farStar } from "@fortawesome/free-regular-svg-icons";
import { useRevitStatus } from "@/hooks/useRevitStatus";
import { Script, ScriptParameter } from "@/types/scriptModel";
import { useScriptExecution } from "@/features/automation";
import { useScripts } from "@/features/automation";
import { useUI } from "@/hooks/useUI";
import { filterVisibleParameters, validateParameters } from '@/utils/parameterVisibility';
import styles from './ScriptCard.module.css';
import { useAuth } from '@/features/auth';
import { Modal } from '@/components/common/Modal';
import { useWatchdog } from "@/context/providers/WatchdogProvider";

export interface ScriptCardProps {
  script: Script;
  onSelect: () => void;
  isFromActiveSource: boolean;
  isCompact?: boolean;
  showExitFocus?: boolean;
  onExitFocus?: () => void;
  onFocus?: (rect: DOMRect) => void;
  isHidden?: boolean;
  onReplace?: (script: Script) => void;
}

export const ScriptCard: React.FC<ScriptCardProps> = ({
  script,
  onSelect,
  isFromActiveSource,
  isCompact = false,
  showExitFocus = false,
  onExitFocus,
  onFocus,
  isHidden = false,
  onReplace
}) => {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const {
    selectedScript,
    runningScriptPath,
    runScript,
    setSelectedScript,
    editScript,
    renameScript,
    userEditedScriptParameters
  } = useScriptExecution();
  const { toggleFavoriteScript, deleteScript, isSyncActive } = useScripts();
  const { setActiveInspectorTab } = useUI();
  const { ParacoreConnected, revitStatus } = useRevitStatus();
  const { isAuthenticated, activeRole, user, cloudToken } = useAuth();
  const { watchdogs } = useWatchdog();
  const [showMenu, setShowMenu] = React.useState(false);
  const [isRenaming, setIsRenaming] = React.useState(false);
  const [renameValue, setRenameValue] = React.useState('');
  const [showDeleteModal, setShowDeleteModal] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

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
  
  // Robust Type Identification
  const path = (script.absolutePath || script.id || script.name || "").toLowerCase().replace(/\\/g, '/');
  const isWTool = path.endsWith('.wtool') || path.includes('.wtool/'); // Handle folder cases if any
  const isPTool = path.endsWith('.ptool') || path.includes('.ptool/');
  
  // V4: Extra-aggressive Sentinel detection
  const isGuard = script.metadata?.isWatchdog === true || 
                  script.metadata?.is_watchdog === true || 
                  (script.metadata as any)?.IsWatchdog === true ||
                  path.endsWith('.wtool') || 
                  path.includes('.wtool');

  const isProtectedTool = script.metadata?.isProtected === true || script.metadata?.isCompiled === true || isPTool || isWTool;

  // Real-time armed status for pulse animation
  const isArmed = React.useMemo(() => {
    if (!isGuard) return false;
    const normalizedCardPath = path.replace(/\\/g, '/');
    return watchdogs.some(w => w.script_path.toLowerCase().replace(/\\/g, '/') === normalizedCardPath);
  }, [isGuard, path, watchdogs]);

  const isActiveInIDE = isSyncActive(script.absolutePath);

  // Connectivity logic
  const isParacoreConnected = ParacoreConnected;

  // FIXED: Document Type Validation
  const requiredDocType = script.metadata.documentType || 'Any';
  const currentDocType = revitStatus?.documentType || 'Any';

  const isCompatibleWithDocument = React.useMemo(() => {
    if (!isParacoreConnected) return true; // Let connection check handle state

    // If connected but no document is open, nothing is compatible
    if (revitStatus?.document === null) return false;

    if (requiredDocType === 'Any' || currentDocType === 'Any') return true;
    return requiredDocType.toLowerCase() === currentDocType.toLowerCase();
  }, [isParacoreConnected, requiredDocType, currentDocType, revitStatus?.document]);

  // Validation - use cached parameters if available
  const currentParams = userEditedScriptParameters[script.id] || script.parameters || [];
  const visibleParameters = filterVisibleParameters(currentParams);
  const validationErrors = validateParameters(visibleParameters);

  // V2.5: Permissive UI treatment - only grayscale the RUN button if disconnected
  // File operations (Edit, Rename) should always be available if authenticated
  const isRunButtonDisabled = !isParacoreConnected || !isCompatibleWithDocument || isRunning || validationErrors.length > 0 || !isAuthenticated;

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
      : revitStatus?.document === null
        ? "No document opened in Revit"
        : !isCompatibleWithDocument
          ? `Script requires '${requiredDocType}' but current is '${currentDocType}'`
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
    setRenameValue(getDisplayName());
    setIsRenaming(true);
    setShowMenu(false);
  };

  const handleRenameSubmit = async () => {
    const currentName = getDisplayName();
    if (!renameValue.trim() || renameValue === currentName) {
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

  const handleDelete = async (scaffoldingOnly: boolean = false) => {
    setIsDeleting(true);
    setDeleteError(null);
    const result = await deleteScript(script, scaffoldingOnly);
    setIsDeleting(false);
    
    if (result.success) {
      setShowDeleteModal(false);
    } else {
      setDeleteError(result.message || "An unexpected error occurred.");
    }
  };

  const getDisplayName = () => {
    return script.metadata.displayName || script.name.replace(/\.(cs|ptool|wtool)$/i, "");
  };

  return (
    <div
      id={`script-card-${script.id}`}
      ref={cardRef}
      className={`${styles.scriptCard} script-card group bg-white dark:bg-gray-800 rounded-xl shadow-sm transition-all duration-200 cursor-pointer flex flex-col ${isSelected ? styles.selectedCard : ""
        } ${isRunning ? "opacity-70" : ""} ${!isAuthenticated ? "opacity-60 grayscale-[0.3]" : ""} ${isCompact ? "min-h-0" : ""} ${isProtectedTool ? styles.toolFile : ""} ${isGuard ? styles.guardCard : ""} ${showExitFocus ? styles.focusHero : ""} ${isHidden ? "opacity-0 pointer-events-none" : ""}`}
      onClick={handleSelect}
    >
      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => !isDeleting && setShowDeleteModal(false)}
        title={isProtectedTool ? "Delete Sealed Automation Tool" : "Manage Automation Script"}
        size="md"
      >
        <div className="space-y-6">
          {deleteError && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 animate-in shake duration-300">
              <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-red-800 dark:text-red-200">Deletion Failed</h4>
                <p className="text-xs text-red-700/70 dark:text-red-400/70 leading-relaxed font-medium">{deleteError}</p>
              </div>
            </div>
          )}

          {isActiveInIDE && (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-3">
              <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-500 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-amber-800 dark:text-amber-200">
                  Active IDE Session Detected
                </h4>
                <p className="text-xs text-amber-700/70 dark:text-amber-400/70 leading-relaxed font-medium">
                  This automation script is currently open in VS Code. To prevent data corruption and Windows file lock errors, please close the script environment in VS Code before deleting.
                </p>
              </div>
            </div>
          )}

          {isProtectedTool ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Are you sure you want to permanently delete the sealed tool <span className="font-bold text-gray-900 dark:text-white">"{getDisplayName()}"</span>?
              </p>
              <div
                className="p-4 rounded-xl border-2 border-red-50 dark:border-red-900/30 bg-red-50/30 dark:bg-red-900/10 hover:border-red-200 dark:hover:border-red-800 transition-all cursor-pointer group"
                onClick={() => !isDeleting && handleDelete(false)}
              >
                <div className="flex justify-between items-center mb-1">
                  <h4 className="font-bold text-red-700 dark:text-red-400">Delete Sealed Tool</h4>
                  {isDeleting ? <FontAwesomeIcon icon={faSpinner} spin className="text-red-500" /> : <FontAwesomeIcon icon={faTrash} className="text-red-400 group-hover:scale-110 transition-transform" />}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Permanently removes the .ptool or .wtool file from the library. This action cannot be undone.</p>
              </div>
            </div>
          ) : (
            <>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Choose how you want to manage <span className="font-bold text-gray-900 dark:text-white">"{getDisplayName()}"</span>:
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {/* Option 1: Clean Construction */}
                <div
                  className="p-4 rounded-xl border-2 border-blue-50 dark:border-blue-900/30 bg-blue-50/30 dark:bg-red-900/10 hover:border-blue-200 dark:hover:border-blue-800 transition-all cursor-pointer group"
                  onClick={() => !isDeleting && handleDelete(true)}
                >
                  <div className="flex justify-between items-center mb-1">
                    <h4 className="font-bold text-blue-700 dark:text-blue-400">Clear Construction Files</h4>
                    {isDeleting ? <FontAwesomeIcon icon={faSpinner} spin className="text-blue-500" /> : <FontAwesomeIcon icon={faBroom} className="text-blue-400 group-hover:scale-110 transition-transform" />}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Removes .sln, .csproj and other IDE files. Your C# logic in <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">Scripts/</code> will be preserved.</p>
                </div>

                {/* Option 2: Full Delete */}
                <div
                  className="p-4 rounded-xl border-2 border-red-50 dark:border-red-900/30 bg-red-50/30 dark:bg-red-900/10 hover:border-red-200 dark:hover:border-red-800 transition-all cursor-pointer group"
                  onClick={() => !isDeleting && handleDelete(false)}
                >
                  <div className="flex justify-between items-center mb-1">
                    <h4 className="font-bold text-red-700 dark:text-red-400">Full Delete</h4>
                    {isDeleting ? <FontAwesomeIcon icon={faSpinner} spin className="text-red-500" /> : <FontAwesomeIcon icon={faTrash} className="text-red-400 group-hover:scale-110 transition-transform" />}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Permanently removes the entire automation folder and all its contents. This cannot be undone.</p>
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end pt-2">
            <button
              onClick={() => setShowDeleteModal(false)}
              disabled={isDeleting}
              className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

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
            <div className="flex items-center gap-2 overflow-hidden w-full">
              {/* Family Icons */}
              {isGuard ? (
                <FontAwesomeIcon 
                  icon={faShieldHeart} 
                  className={`shrink-0 ${isArmed ? styles.sentinelPulse : styles.guardIcon}`} 
                  style={{ fontSize: '0.9rem' }}
                />
              ) : (
                /* Only show wrench for Automation TOOLS, not scripts */
                isProtectedTool && (
                  <FontAwesomeIcon 
                    icon={faTools} 
                    className="shrink-0 text-slate-400 dark:text-slate-500" 
                    style={{ fontSize: '0.9rem' }}
                  />
                )
              )}
              
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <h3
                  className={`font-medium truncate ${(isSelected || showExitFocus) ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'} group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors duration-200 ${isCompact ? "text-base" : "text-lg"}`}
                  title={getDisplayName()}
                >
                  {getDisplayName()}
                </h3>
                
                {/* Binary Indicator Badge - OUTSIDE truncate */}
                {isProtectedTool && (
                  <span className={`${styles.multiFileBadge} !bg-slate-100 !text-slate-600 dark:!bg-slate-900/40 dark:!text-slate-400 border border-slate-200 dark:border-slate-800 whitespace-nowrap shrink-0`}>
                    <FontAwesomeIcon icon={faLock} className="mr-1" style={{ fontSize: '0.6rem' }} />
                    Sealed
                  </span>
                )}
              </div>
            </div>
          )}
          <button
            onClick={handleFavoriteClick}
            className={`${script.isFavorite
              ? "text-yellow-400 hover:text-yellow-500 ml-2"
              : "text-gray-400 dark:text-gray-500 hover:text-yellow-400 dark:hover:text-yellow-300 ml-2"
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
                } else if (onFocus && cardRef.current) {
                  onSelect();
                  const el = cardRef.current;
                  requestAnimationFrame(() => {
                    onFocus(el.getBoundingClientRect());
                  });
                }
              }}
              title={showExitFocus ? "Exit Focus Mode" : "Focus View"}
            >
              <FontAwesomeIcon icon={showExitFocus ? faCompressAlt : faBullseye} />
            </button>
          )}
          {isProtectedTool && (
            <div className="mr-2 text-slate-400 dark:text-slate-500" title="This is a sealed binary tool">
              <FontAwesomeIcon icon={isGuard ? faShieldHeart : faTools} />
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
              {canCreateScripts && (
                <>
                  {!isProtectedTool && (
                    <button
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect();
                        editScript(script);
                        setShowMenu(false);
                      }}
                      title={editTooltipMessage}
                    >
                      <FontAwesomeIcon icon={faEdit} className="mr-2 w-4" />
                      Edit Script
                    </button>
                  )}

                  <button
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect();
                      handleStartRename(e);
                    }}
                    title="Rename Script"
                  >
                    <FontAwesomeIcon icon={faICursor} className="mr-2 w-4" />
                    Rename
                  </button>
                  {!isProtectedTool && (
                    <button
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect();
                        if (onReplace) onReplace(script);
                        setShowMenu(false);
                      }}
                      title="Replace with Template/Query"
                    >
                      <FontAwesomeIcon icon={faSyncAlt} className="mr-2 w-4" />
                      Replace Code
                    </button>
                  )}
                  <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
                  <button
                    className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect();
                      setDeleteError(null);
                      setShowDeleteModal(true);
                      setShowMenu(false);
                    }}
                    title="Delete Script"
                  >
                    <FontAwesomeIcon icon={faTrash} className="mr-2 w-4" />
                    Delete Script
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
