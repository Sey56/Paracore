import React, { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlay, faSpinner, faStar as fasStar,
  faCode, faBullseye, faEdit, faEllipsisH, faSlidersH,
  faICursor, faSyncAlt, faTags, faTrash, faTools, faBroom,
  faExclamationTriangle
} from '@fortawesome/free-solid-svg-icons';
import { faStar as farStar } from '@fortawesome/free-regular-svg-icons';
import { Script } from '@/types/scriptModel';
import { useScriptExecution, useScripts } from '@/features/automation';
import { useUI } from '@/hooks/useUI';
import { useAuth } from '@/features/auth';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { useNotifications } from '@/hooks/useNotifications';
import { useWatchdog } from '@/context/providers/WatchdogProvider';
import { Tooltip } from '@/components/common/Tooltip';
import { Modal } from '@/components/common/Modal';

interface GalleryActionBarProps {
  script: Script;
  onFocus?: (rect: DOMRect) => void;
  onReplace?: (script: Script) => void;
  onConfigure?: (script: Script) => void;
  onRenameStart?: () => void;
  onMetadataEdit?: () => void;
}

export const GalleryActionBar: React.FC<GalleryActionBarProps> = ({
  script,
  onFocus,
  onReplace,
  onConfigure,
  onRenameStart,
  onMetadataEdit,
}) => {
  const { runScript, runningScriptPath, selectedScript } = useScriptExecution();
  const { toggleFavoriteScript, editScript, deleteScript: deleteScriptApi, reloadScript } = useScripts();
  const { toggleFloatingCodeViewer, setActiveInspectorTab } = useUI();
  const { ParacoreConnected } = useRevitStatus();
  const { isAuthenticated, activeRole } = useAuth();
  const { showNotification } = useNotifications();
  const { watchdogs } = useWatchdog();

  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isRunning = runningScriptPath === script.absolutePath;
  const canCreateScripts = activeRole === 'admin' || activeRole === 'developer';
  const isProtectedTool = script.metadata?.isProtected || script.metadata?.isCompiled;
  const isGuard = script.metadata?.isWatchdog || script.metadata?.is_watchdog || (script.name ?? '').endsWith('.wtool');
  const isActiveInIDE = false; // simplified for action bar

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    if (showMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMenu]);

  const handleRun = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!ParacoreConnected || !isAuthenticated || isRunning) return;
    runScript(script);
  };

  const handleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavoriteScript(script.id);
  };

  const handleViewCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFloatingCodeViewer();
  };

  const handleFocus = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onFocus) {
      const card = document.getElementById(`script-card-${script.id}`);
      if (card) onFocus(card.getBoundingClientRect());
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    editScript(script);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const success = await deleteScriptApi(script);
      if (!success) setDeleteError('Failed to delete script. The file may be locked or in use.');
      else setShowDeleteModal(false);
    } catch {
      setDeleteError('An unexpected error occurred while deleting.');
    } finally {
      setIsDeleting(false);
    }
  };

  const runDisabled = !ParacoreConnected || !isAuthenticated || isRunning;
  const runTooltip = !ParacoreConnected ? 'Paracore disconnected' : !isAuthenticated ? 'Sign in to run' : isRunning ? 'Running...' : 'Run Script';

  return (
    <>
      <div className="w-full mb-4 px-0.5 animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/80 dark:bg-slate-800/60 border border-blue-200/50 dark:border-blue-700/30 shadow-sm">
          {/* Script name */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate max-w-[180px]">
              {script.metadata?.displayName || script.name}
            </span>
          </div>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />

          {/* Primary actions */}
          <div className="flex items-center gap-0.5">
            <Tooltip text={runTooltip}>
              <button
                onClick={handleRun}
                disabled={runDisabled}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all
                  ${runDisabled
                    ? 'text-slate-400 cursor-not-allowed'
                    : 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                  }`}
              >
                <FontAwesomeIcon icon={isRunning ? faSpinner : faPlay} className={`text-[10px] ${isRunning ? 'animate-spin' : ''}`} />
                <span>Run</span>
              </button>
            </Tooltip>

            {onConfigure && (
              <button
                onClick={(e) => { e.stopPropagation(); onConfigure(script); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all"
                title="Configure Parameters"
              >
                <FontAwesomeIcon icon={faSlidersH} className="text-[10px]" />
                <span>Configure</span>
              </button>
            )}

            <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />

            <button
              onClick={handleFavorite}
              className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors
                ${script.isFavorite
                  ? 'text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20'
                  : 'text-slate-400 hover:text-yellow-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
              title={script.isFavorite ? 'Unfavorite' : 'Favorite'}
            >
              <FontAwesomeIcon icon={script.isFavorite ? fasStar : farStar} className="text-xs" />
            </button>

            <button
              onClick={handleViewCode}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              title="View Code"
            >
              <FontAwesomeIcon icon={faCode} className="text-xs" />
            </button>

            {onFocus && (
              <button
                onClick={handleFocus}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-purple-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                title="Focus Mode"
              >
                <FontAwesomeIcon icon={faBullseye} className="text-xs" />
              </button>
            )}

            {canCreateScripts && !isProtectedTool && (
              <button
                onClick={handleEdit}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                title="Edit Script"
              >
                <FontAwesomeIcon icon={faEdit} className="text-xs" />
              </button>
            )}

            {canCreateScripts && (
              <button
                onClick={(e) => { e.stopPropagation(); if (onRenameStart) onRenameStart(); }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                title="Rename"
              >
                <FontAwesomeIcon icon={faICursor} className="text-xs" />
              </button>
            )}

            {/* More menu */}
            {canCreateScripts && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                  title="More"
                >
                  <FontAwesomeIcon icon={faEllipsisH} className="text-[11px]" />
                </button>

                {showMenu && (
                  <div className="absolute left-0 bottom-full mb-1.5 w-48 bg-white dark:bg-slate-900 rounded-xl shadow-2xl z-[60] border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in slide-in-from-bottom-1 duration-150">
                    {/* Delete at the top — deliberate action required */}
                    <button
                      className="w-full text-left px-4 py-2.5 text-[11px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2 transition-colors"
                      onClick={(e) => { e.stopPropagation(); setShowDeleteModal(true); setShowMenu(false); }}
                    >
                      <FontAwesomeIcon icon={faTrash} className="text-[10px] w-3" />
                      {isGuard ? 'Delete Sentinel' : 'Delete Script'}
                    </button>
                    <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
                    {!isProtectedTool && (
                      <>
                        <button
                          className="w-full text-left px-4 py-2.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
                          onClick={(e) => { e.stopPropagation(); editScript(script, true); setShowMenu(false); }}
                        >
                          <FontAwesomeIcon icon={faTools} className="text-[10px] w-3 text-blue-500" /> Fix Scaffolding
                        </button>
                        <button
                          className="w-full text-left px-4 py-2.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
                          onClick={(e) => { e.stopPropagation(); deleteScriptApi(script, true); setShowMenu(false); }}
                        >
                          <FontAwesomeIcon icon={faBroom} className="text-[10px] w-3 text-amber-500" /> Remove Scaffolding
                        </button>
                      </>
                    )}
                    {!isProtectedTool && (
                      <button
                        className="w-full text-left px-4 py-2.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
                        onClick={(e) => { e.stopPropagation(); if (onReplace) onReplace(script); setShowMenu(false); }}
                      >
                        <FontAwesomeIcon icon={faSyncAlt} className="text-[10px] w-3" /> Replace Code
                      </button>
                    )}
                    {!isProtectedTool && (
                      <button
                        className="w-full text-left px-4 py-2.5 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 transition-colors"
                        onClick={(e) => { e.stopPropagation(); if (onMetadataEdit) onMetadataEdit(); setShowMenu(false); }}
                      >
                        <FontAwesomeIcon icon={faTags} className="text-[10px] w-3" /> Edit Metadata
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={showDeleteModal} onClose={() => { if (!isDeleting) setShowDeleteModal(false); }} title={isGuard ? 'Delete Sentinel' : 'Delete Script'} size="sm">
        <div className="p-2 space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800/50">
            <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-700 dark:text-red-400">
                Delete "{script.metadata?.displayName || script.name}"?
              </p>
              <p className="text-[11px] text-red-600/80 dark:text-red-400/80 mt-1">
                This will permanently delete the script file and all associated scaffolding. This action cannot be undone.
              </p>
            </div>
          </div>

          {deleteError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800/50 text-[11px] text-red-600 dark:text-red-400 font-bold">
              {deleteError}
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowDeleteModal(false)}
              disabled={isDeleting}
              className="px-4 py-2 text-[11px] font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[11px] font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isDeleting && <FontAwesomeIcon icon={faSpinner} spin className="text-[10px]" />}
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};
