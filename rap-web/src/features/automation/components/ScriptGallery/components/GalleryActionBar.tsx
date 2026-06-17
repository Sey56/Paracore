import React, { useState, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlay, faSpinner, faStar as fasStar,
  faCode, faBullseye, faEdit, faSlidersH,
  faICursor, faSyncAlt, faTags, faTrash, faTools, faBroom,
  faExclamationTriangle, faBook, faFolderOpen
} from '@fortawesome/free-solid-svg-icons';
import { faStar as farStar } from '@fortawesome/free-regular-svg-icons';
import { Script } from '@/types/scriptModel';
import { useScriptExecution, useScripts } from '@/features/automation';
import api from '@/api/axios';
import { useUI } from '@/hooks/useUI';
import { useAuth } from '@/features/auth';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { Tooltip } from '@/components/common/Tooltip';
import { Modal } from '@/components/common/Modal';
import { EditMetadataModal } from '@/features/automation/components/ScriptCard/components/EditMetadataModal';

interface GalleryActionBarProps {
  script: Script;
  onFocus?: (rect: DOMRect) => void;
  onReplace?: (script: Script) => void;
  onConfigure?: (script: Script) => void;
}

export const GalleryActionBar: React.FC<GalleryActionBarProps> = ({
  script,
  onFocus,
  onReplace,
  onConfigure,
}) => {
  const { runScript, runningScriptPath, renameScript, openFolder } = useScriptExecution();
  const { toggleFavoriteScript, editScript, deleteScript: deleteScriptApi, reloadScript } = useScripts();
  const { toggleFloatingCodeViewer } = useUI();
  const { ParacoreConnected } = useRevitStatus();
  const { isAuthenticated, activeRole } = useAuth();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showMetadataModal, setShowMetadataModal] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const isRunning = runningScriptPath === script.absolutePath;
  const canCreateScripts = activeRole === 'admin' || activeRole === 'developer';
  const isProtectedTool = script.metadata?.isProtected || script.metadata?.isCompiled;
  const isGuard = script.metadata?.isWatchdog || script.metadata?.is_watchdog || (script.name ?? '').endsWith('.wtool');

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

  const handleDoc = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.post('/api/open-doc', { scriptPath: script.absolutePath });
    } catch (err: any) {
      console.error('[Doc] Failed:', err.response?.data?.detail || err.message);
    }
  };

  const handleOpenFolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (openFolder) openFolder(script);
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

  const handleStartRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameValue(script.metadata?.displayName || script.name);
    setIsRenaming(true);
    setTimeout(() => renameInputRef.current?.focus(), 50);
  };

  const handleRenameSubmit = async () => {
    const currentName = script.metadata?.displayName || script.name;
    if (!renameValue.trim() || renameValue === currentName) {
      setIsRenaming(false);
      return;
    }
    await renameScript(script, renameValue.trim());
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); handleRenameSubmit(); }
    else if (e.key === 'Escape') setIsRenaming(false);
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

  const Sep = () => <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 shrink-0" />;

  return (
    <>
      <div className="w-full mb-1 px-0.5 animate-in fade-in slide-in-from-top-2 duration-200">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 rounded-xl bg-white/80 dark:bg-slate-800/60 border border-blue-200/50 dark:border-blue-700/30 shadow-sm">
          {/* Name */}
          <div className="flex items-center gap-2 shrink-0 w-[140px]">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate" title={script.metadata?.displayName || script.name}>
              {script.metadata?.displayName || script.name}
            </span>
          </div>
          <Sep />

          {/* ── Group 1: Execute & Inspect ── */}
          <Tooltip text={runTooltip}>
            <button onClick={handleRun} disabled={runDisabled}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all shrink-0
                ${runDisabled ? 'text-slate-400 cursor-not-allowed' : 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30'}`}>
              <FontAwesomeIcon icon={isRunning ? faSpinner : faPlay} className={`text-[10px] ${isRunning ? 'animate-spin' : ''}`} />
              <span>Run</span>
            </button>
          </Tooltip>

          {onConfigure && (
            <button onClick={(e) => { e.stopPropagation(); onConfigure(script); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all shrink-0"
              title="Configure Parameters">
              <FontAwesomeIcon icon={faSlidersH} className="text-[10px]" />
              <span>Configure</span>
            </button>
          )}
          <button onClick={handleViewCode}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors shrink-0"
            title="View Code">
            <FontAwesomeIcon icon={faCode} className="text-xs" />
          </button>
          {script.hasDoc && (
            <button onClick={handleDoc}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors shrink-0"
              title="Documentation">
              <FontAwesomeIcon icon={faBook} className="text-xs" />
            </button>
          )}
          <Sep />

          {/* ── Group 2: Modify ── */}
          {canCreateScripts && !isProtectedTool && (
            <button onClick={handleEdit}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors shrink-0"
              title="Edit Script">
              <FontAwesomeIcon icon={faEdit} className="text-xs" />
            </button>
          )}
          {canCreateScripts && !isRenaming && (
            <button onClick={handleStartRename}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors shrink-0"
              title="Rename">
              <FontAwesomeIcon icon={faICursor} className="text-xs" />
            </button>
          )}
          {isRenaming && (
            <input ref={renameInputRef} type="text" value={renameValue}
              onChange={(e) => setRenameValue(e.target.value.replace(/\s+/g, ''))}
              onKeyDown={handleRenameKeyDown} onBlur={handleRenameSubmit}
              onClick={(e) => e.stopPropagation()}
              className="w-32 px-2 py-1 text-[11px] font-bold bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-600 rounded-lg outline-none text-slate-800 dark:text-slate-200 shrink-0"
              autoFocus />
          )}
          {canCreateScripts && !isProtectedTool && (
            <button onClick={(e) => { e.stopPropagation(); setShowMetadataModal(true); }}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-purple-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors shrink-0"
              title="Edit Metadata">
              <FontAwesomeIcon icon={faTags} className="text-[10px]" />
            </button>
          )}
          <button onClick={handleFavorite}
            className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors shrink-0
              ${script.isFavorite ? 'text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20' : 'text-slate-400 hover:text-yellow-500 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
            title={script.isFavorite ? 'Unfavorite' : 'Favorite'}>
            <FontAwesomeIcon icon={script.isFavorite ? fasStar : farStar} className="text-xs" />
          </button>
          <Sep />

          {/* ── Group 3: Dev Tools ── */}
          {onFocus && (
            <button onClick={handleFocus}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-purple-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors shrink-0"
              title="Focus Mode">
              <FontAwesomeIcon icon={faBullseye} className="text-xs" />
            </button>
          )}
          {canCreateScripts && !isProtectedTool && (
            <button onClick={(e) => { e.stopPropagation(); editScript(script, true); }}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors shrink-0"
              title="Fix Scaffolding">
              <FontAwesomeIcon icon={faTools} className="text-[10px]" />
            </button>
          )}
          {canCreateScripts && !isProtectedTool && (
            <button onClick={(e) => { e.stopPropagation(); deleteScriptApi(script, true); }}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors shrink-0"
              title="Remove Scaffolding">
              <FontAwesomeIcon icon={faBroom} className="text-[10px]" />
            </button>
          )}
          {canCreateScripts && (
            <button onClick={handleOpenFolder}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-emerald-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors shrink-0"
              title="Open Project Folder">
              <FontAwesomeIcon icon={faFolderOpen} className="text-[10px]" />
            </button>
          )}
          {canCreateScripts && !isProtectedTool && onReplace && (
            <button onClick={(e) => { e.stopPropagation(); onReplace(script); }}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-green-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors shrink-0"
              title="Replace Code">
              <FontAwesomeIcon icon={faSyncAlt} className="text-[10px]" />
            </button>
          )}
          <Sep />

          {/* ── Group 4: Delete (isolated, last) ── */}
          {canCreateScripts && (
            <button onClick={(e) => { e.stopPropagation(); setShowDeleteModal(true); }}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
              title={isGuard ? 'Delete Sentinel' : 'Delete Script'}>
              <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
            </button>
          )}
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
            <button onClick={() => setShowDeleteModal(false)} disabled={isDeleting}
              className="px-4 py-2 text-[11px] font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
              Cancel
            </button>
            <button onClick={handleDelete} disabled={isDeleting}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[11px] font-bold transition-colors disabled:opacity-50 flex items-center gap-2">
              {isDeleting && <FontAwesomeIcon icon={faSpinner} spin className="text-[10px]" />}
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>

      {showMetadataModal && (
        <EditMetadataModal isOpen={showMetadataModal} onClose={() => setShowMetadataModal(false)} script={script}
          onSaved={() => { reloadScript(script); setShowMetadataModal(false); }} />
      )}
    </>
  );
};
