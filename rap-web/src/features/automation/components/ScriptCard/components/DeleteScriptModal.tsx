import React from 'react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faExclamationTriangle,
  faSpinner,
  faTrash,
  faBroom
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
  onDelete: (scaffoldingOnly: boolean) => void;
}

export const DeleteScriptModal: React.FC<DeleteScriptModalProps> = ({
  isOpen,
  onClose,
  isDeleting,
  deleteError,
  isActiveInIDE,
  isProtectedTool,
  isGuard,
  displayName,
  onDelete
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !isDeleting && onClose()}
      title={isProtectedTool ? "Delete Sealed Automation Tool" : `Manage Automation ${isGuard ? 'Sentinel' : 'Script'}`}
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
                This {isGuard ? 'sentinel' : 'script'} is currently open in VS Code. To prevent data corruption and Windows file lock errors, please close the script environment in VS Code before deleting.
              </p>
            </div>
          </div>
        )}

        {isProtectedTool ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              Are you sure you want to permanently delete the sealed tool <span className="font-bold text-gray-900 dark:text-white">"{displayName}"</span>?
            </p>
            <div
              className="p-4 rounded-xl border-2 border-red-50 dark:border-red-900/30 bg-red-50/30 dark:bg-red-900/10 hover:border-red-200 dark:hover:border-red-800 transition-all cursor-pointer group"
              onClick={() => !isDeleting && onDelete(false)}
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
                Choose how you want to manage {isGuard ? 'this sentinel' : 'this script'} <span className="font-bold text-gray-900 dark:text-white">"{displayName}"</span>:
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div
                className="p-4 rounded-xl border-2 border-blue-50 dark:border-blue-900/30 bg-blue-50/30 dark:bg-red-900/10 hover:border-blue-200 dark:hover:border-blue-800 transition-all cursor-pointer group"
                onClick={() => !isDeleting && onDelete(true)}
              >
                <div className="flex justify-between items-center mb-1">
                  <h4 className="font-bold text-blue-700 dark:text-blue-400">Clear Construction Files</h4>
                  {isDeleting ? <FontAwesomeIcon icon={faSpinner} spin className="text-blue-500" /> : <FontAwesomeIcon icon={faBroom} className="text-blue-400 group-hover:scale-110 transition-transform" />}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Removes .sln, .csproj and other IDE files. Your C# logic in <code className="bg-blue-100 dark:bg-blue-900/40 px-1 rounded">Scripts/</code> will be preserved.</p>
              </div>

              <div
                className="p-4 rounded-xl border-2 border-red-50 dark:border-red-900/30 bg-red-50/30 dark:bg-red-900/10 hover:border-red-200 dark:hover:border-red-800 transition-all cursor-pointer group"
                onClick={() => !isDeleting && onDelete(false)}
              >
                <div className="flex justify-between items-center mb-1">
                  <h4 className="font-bold text-red-700 dark:text-red-400">Full Delete</h4>
                  {isDeleting ? <FontAwesomeIcon icon={faSpinner} spin className="text-red-500" /> : <FontAwesomeIcon icon={faTrash} className="text-red-400 group-hover:scale-110 transition-transform" />}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Permanently removes the entire automation folder and all its contents. This action cannot be undone.</p>
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
};
