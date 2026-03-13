import React, { memo } from 'react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faSpinner,
  faPlay,
  faCompressAlt,
  faBullseye,
  faShieldHeart,
  faTools,
  faEllipsisH,
  faEdit,
  faICursor,
  faSyncAlt,
  faTrash,
  faCode,
  faTags,
  faBroom
} from "@fortawesome/free-solid-svg-icons";
import { Script } from "@/types/scriptModel";
import { Tooltip } from '@/components/common/Tooltip';

interface CardActionsProps {
  script: Script;
  isRunning: boolean;
  isRunButtonDisabled: boolean;
  tooltipMessage: string;
  handleRunClick: (e: React.MouseEvent) => void;
  onFocus?: (rect: DOMRect) => void;
  onExitFocus?: () => void;
  showExitFocus: boolean;
  cardRef: React.RefObject<HTMLDivElement | null>;
  onSelect: () => void;
  isProtectedTool: boolean;
  isGuard: boolean;
  showMenu: boolean;
  setShowMenu: (show: boolean) => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  canCreateScripts: boolean;
  editScript: (script: Script, force?: boolean) => void;
  onDelete: (scaffoldingOnly: boolean) => void;
  handleStartRename: (e: React.MouseEvent) => void;
  onReplace?: (script: Script) => void;
  setShowDeleteModal: (show: boolean) => void;
  setDeleteError: (err: string | null) => void;
  editTooltipMessage: string;
  toggleFloatingCodeViewer: () => void;
  setShowMetadataModal: (show: boolean) => void;
  isSelected: boolean;
}

const CardActionsComponent = ({
  script,
  isRunning,
  isRunButtonDisabled,
  tooltipMessage,
  handleRunClick,
  onFocus,
  onExitFocus,
  showExitFocus,
  cardRef,
  onSelect,
  isProtectedTool,
  isGuard,
  showMenu,
  setShowMenu,
  menuRef,
  canCreateScripts,
  editScript,
  onDelete,
  handleStartRename,
  onReplace,
  setShowDeleteModal,
  setDeleteError,
  editTooltipMessage,
  toggleFloatingCodeViewer,
  setShowMetadataModal,
  isSelected
}: CardActionsProps) => {
  const handleRunClickInternal = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRunButtonDisabled) return;

    handleRunClick(e);
  };

  return (
    <div className="card-actions border-t border-gray-200 dark:border-gray-700 p-2 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50 rounded-b-lg">
      <div className={`relative ${isSelected ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-200`}>
        <Tooltip text={tooltipMessage}>
          <button
            className={`text-sm px-3 py-1 flex items-center rounded transition-colors ${isRunButtonDisabled
              ? 'text-gray-400 cursor-not-allowed opacity-50'
              : 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-bold'
              }`}
            onClick={handleRunClickInternal}
            disabled={isRunButtonDisabled}
          >
            <FontAwesomeIcon
              icon={isRunning ? faSpinner : faPlay}
              className={`mr-1 ${isRunning ? "animate-spin" : ""}`}
            />
            {isRunning ? "Running..." : "Run"}
          </button>
        </Tooltip>
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
          className={`text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1 ${isSelected ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-200`}
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
        >
          <FontAwesomeIcon icon={faEllipsisH} />
        </button>

        {showMenu && (
          <div className="absolute right-0 bottom-full mb-2 w-48 bg-white dark:bg-slate-900 rounded-xl shadow-2xl z-50 overflow-hidden">
            {canCreateScripts && (
              <>
                {!isProtectedTool && (
                  <>
                    <button
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect();
                        toggleFloatingCodeViewer();
                        setShowMenu(false);
                      }}
                    >
                      <FontAwesomeIcon icon={faCode} className="mr-2 w-4" />
                      {isGuard ? "View Sentinel" : "View Script"}
                    </button>
                    <button
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect();
                        editScript(script);
                        setShowMenu(false);
                      }}
                    >
                      <FontAwesomeIcon icon={faEdit} className="mr-2 w-4" />
                      {isGuard ? "Edit Sentinel" : "Edit Script"}
                    </button>
                    {!isProtectedTool && (
                      <div className="flex flex-col gap-0.5 border-b border-gray-100 dark:border-gray-800 pb-1">
                        <button
                          className="w-full text-left px-4 py-2 text-xs text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center italic"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect();
                            editScript(script, true); // Force Scaffolding
                            setShowMenu(false);
                          }}
                        >
                          <FontAwesomeIcon icon={faTools} className="mr-2 w-3" />
                          Fix Scaffolding
                        </button>
                        <button
                          className="w-full text-left px-4 py-2 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 flex items-center italic"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelect();
                            onDelete(true); // Scaffolding Only
                            setShowMenu(false);
                          }}
                        >
                          <FontAwesomeIcon icon={faBroom} className="mr-2 w-3" />
                          Remove Scaffolding
                        </button>
                      </div>
                    )}
                  </>
                )}

                {!showExitFocus && (
                  <button
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect();
                      handleStartRename(e);
                    }}
                  >
                    <FontAwesomeIcon icon={faICursor} className="mr-2 w-4" />
                    {isGuard ? "Rename Sentinel" : "Rename Script"}
                  </button>
                )}
                {!isProtectedTool && !showExitFocus && (
                  <button
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect();
                      if (onReplace) onReplace(script);
                      setShowMenu(false);
                    }}
                  >
                    <FontAwesomeIcon icon={faSyncAlt} className="mr-2 w-4" />
                    Replace Code
                  </button>
                )}
                {!isProtectedTool && (
                  <button
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect();
                      setShowMetadataModal(true);
                      setShowMenu(false);
                    }}
                  >
                    <FontAwesomeIcon icon={faTags} className="mr-2 w-4" />
                    Edit Metadata
                  </button>
                )}
                {!showExitFocus && (
                  <>
                    <div className="border-t border-gray-100 dark:border-gray-700 my-1"></div>
                    <button
                      className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center font-bold"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect();
                        setDeleteError(null);
                        setShowDeleteModal(true);
                        setShowMenu(false);
                      }}
                    >
                      <FontAwesomeIcon icon={faTrash} className="mr-2 w-4" />
                      {isGuard ? "Delete Sentinel" : "Delete Script"}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const CardActions = memo(CardActionsComponent);
CardActions.displayName = 'CardActions';
