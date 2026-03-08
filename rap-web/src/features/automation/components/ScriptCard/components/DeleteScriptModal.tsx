import React from 'react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExclamationTriangle,
  faSpinner,
  faTrash,
  faInfoCircle
} from "@fortawesome/free-solid-svg-icons";
import { Modal } from '@/components/common/Modal';

interface DeleteScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDeleting: boolean;
  deleteError: string | null;
  isActiveInIDE: boolean;
  isProtectedTool: boolean;
  isGuard: boolean;
  displayName: string;
  onDelete: () => void; // No flag needed anymore, this is for FULL delete
}

export const DeleteScriptModal: React.FC<DeleteScriptModalProps> = ({
  isOpen,
  onClose,
  isDeleting,
  deleteError,
  isProtectedTool,
  isGuard,
  displayName,
  onDelete
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !isDeleting && onClose()}
      title={isProtectedTool ? "Delete Sealed Automation Tool" : "Permanent Deletion Warning"}
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

        <div className="space-y-4">
          <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border-l-4 border-red-500 flex gap-4 items-center">
            <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-500 text-2xl" />
            <div>
              <h3 className="text-red-800 dark:text-red-400 font-black uppercase tracking-tighter">Extreme Caution Required</h3>
              <p className="text-xs text-red-700 dark:text-red-500/80 font-medium">This action cannot be undone.</p>
            </div>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            You are about to permanently delete the {isGuard ? 'sentinel' : 'script'} <span className="font-bold text-slate-900 dark:text-white">"{displayName}"</span>.
            This will destroy the entire automation folder, including your <span className="text-red-600 dark:text-red-400 font-bold underline">source code</span> inside <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded italic text-[11px]">Scripts/</code>.
          </p>

          <button
            onClick={() => !isDeleting && onDelete()}
            disabled={isDeleting}
            className="w-full py-4 rounded-xl bg-red-600 hover:bg-red-700 active:scale-[0.98] transition-all text-white font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-red-500/20 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isDeleting ? (
              <>
                <FontAwesomeIcon icon={faSpinner} spin />
                Deleting...
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faTrash} />
                I Understand, Delete All
              </>
            )}
          </button>

          <div className="p-3 bg-amber-50/50 dark:bg-amber-900/5 rounded-lg flex items-start gap-2 text-[10px] text-amber-700 dark:text-amber-500/60 font-medium italic">
            <FontAwesomeIcon icon={faInfoCircle} className="mt-0.5" />
            <span>Note: If this project is currently open in VS Code, we will delete the contents immediately, but Windows may prevent removing the empty folder until you close the workspace.</span>
          </div>
        </div>

        <div className="flex justify-center">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-bold text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    </Modal>
  );
};
