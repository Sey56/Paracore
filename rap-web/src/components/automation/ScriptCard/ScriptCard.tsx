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
} from "@fortawesome/free-solid-svg-icons";
import { faStar as farStar } from "@fortawesome/free-regular-svg-icons";
import { useRevitStatus } from "@/hooks/useRevitStatus";
import { Script } from "@/types/scriptModel";
import { useScriptExecution } from "@/hooks/useScriptExecution";
import { useScripts } from "@/hooks/useScripts";
import { useUI } from "@/hooks/useUI";
import styles from './ScriptCard.module.css';
import { useAuth } from '@/hooks/useAuth';

interface ScriptCardProps {
  script: Script;
  onSelect: () => void;
  isFromActiveWorkspace: boolean;
  isCompact?: boolean;
}

export const ScriptCard: React.FC<ScriptCardProps> = ({ script, onSelect, isFromActiveWorkspace, isCompact = false }) => {
  const {
    selectedScript,
    runningScriptPath,
    runScript,
    setSelectedScript,
    userEditedScriptParameters,
    editScript
  } = useScriptExecution();
  const { toggleFavoriteScript } = useScripts();
  const { setActiveInspectorTab } = useUI();
  const { revitStatus, ParacoreConnected } = useRevitStatus();
  const { isAuthenticated } = useAuth();
  const [showMenu, setShowMenu] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const isSelected = selectedScript?.id === script.id;
  const isRunning = runningScriptPath === script.id;

  const isCompatibleWithDocument = React.useMemo(() => {
    if (!ParacoreConnected || revitStatus.document === null) {
      return false;
    }

    const scriptDocType = script.metadata.documentType?.trim().toLowerCase();
    const revitDocType = revitStatus.documentType?.trim().toLowerCase();

    if (!scriptDocType || scriptDocType === 'any') {
      return true;
    }

    if (!revitDocType) {
      return false;
    }

    return scriptDocType === revitDocType;
  }, [ParacoreConnected, revitStatus.document, revitStatus.documentType, script.metadata.documentType]);

  const isRunButtonDisabled = !isAuthenticated || isRunning || !ParacoreConnected || !isCompatibleWithDocument;

  const getTooltipMessage = () => {
    if (!ParacoreConnected) {
      return "Toggle on Paracore in Revit to enable scripts";
    }

    if (!isAuthenticated) {
      return "You must sign in to use RAP";
    }

    if (isCompatibleWithDocument) {
      return "";
    }

    const scriptDocType = script.metadata.documentType?.trim().toLowerCase();

    if (revitStatus.document === null) {
      return "No document opened in Revit";
    }

    if (scriptDocType && scriptDocType !== 'any') {
      return `This script requires '${script.metadata.documentType}' document type, but the current is '${revitStatus.documentType || "None"}'`;
    }

    return "";
  };

  const tooltipMessage = getTooltipMessage();

  const handleRunClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isRunButtonDisabled) return;
    await setSelectedScript(script);
    setActiveInspectorTab('console');
    runScript(script, userEditedScriptParameters[script.id] || script.parameters);
  };

  const handleFavoriteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavoriteScript(script.id);
  };

  const handleSelect = () => {
    onSelect();
  }

  if (script.metadataError) {
    return (
      <div
        className={`script-card bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col items-center justify-center min-h-[200px] ${isSelected ? "ring-2 ring-blue-500" : ""}`}
        onClick={handleSelect}
      >
        <p className="mt-2 text-sm text-red-500 dark:text-red-400 text-center px-4">{script.metadata?.description || "Error loading metadata."}</p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Click to retry</p>
      </div>
    );
  }

  if (!script.metadata) {
    return (
      <div
        className={`script-card bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col items-center justify-center min-h-[200px] ${isSelected ? "ring-2 ring-blue-500" : ""}`}
        onClick={handleSelect}
      >
        <FontAwesomeIcon icon={faSpinner} className="animate-spin text-2xl text-gray-500 dark:text-gray-400" />
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div
      className={`script-card bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col ${isSelected ? "ring-2 ring-blue-500" : ""
        } ${isRunning ? "opacity-70" : ""} ${!ParacoreConnected || !isCompatibleWithDocument || !isAuthenticated ? "opacity-50 cursor-not-allowed" : ""} ${isCompact ? "min-h-0" : ""}`}
      onClick={handleSelect}
    >
      <div className={`p-4 flex-grow flex flex-col ${isCompact ? "py-2" : ""}`}>
        <div className="flex justify-between items-start mb-2">
          <h3 className={`font-medium text-gray-800 dark:text-gray-100 ${isCompact ? "text-base" : "text-lg"}`}>
            {script.metadata.displayName || script.name.replace(/\.cs$/, "")}
            {isFromActiveWorkspace && (
              <FontAwesomeIcon icon={faCodeBranch} className="ml-2 text-blue-500" title="From active workspace" />
            )}
          </h3>
          <button
            onClick={handleFavoriteClick}
            className={`${script.isFavorite
                ? "text-yellow-400 hover:text-yellow-500"
                : "text-gray-400 dark:text-gray-500 hover:text-yellow-400 dark:hover:text-yellow-300"
              }`}
          >
            {script.isFavorite ? (
              <FontAwesomeIcon icon={fasStar} />
            ) : (
              <FontAwesomeIcon icon={farStar} />
            )}
          </button>
        </div>

        {!isCompact && (
          <>
            {/* Categories */}
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              {script.metadata.categories?.join(', ')}
            </div>

            {/* Description */}
            <p className={`${styles.description} text-gray-600 dark:text-gray-300 text-sm mb-4 flex-grow`}>
              {script.metadata.description}
            </p>

            {/* Author and DocumentType */}
            <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400">
              <span>{script.metadata.author || 'Unknown Author'}</span>
              <span>{script.metadata.documentType || 'Any'}</span>
            </div>
            {/* Dates */}
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {script.metadata.dateCreated && <span>Created: {new Date(script.metadata.dateCreated).toLocaleDateString()}</span>}
              {script.metadata.dateModified && <span> | Modified: {new Date(script.metadata.dateModified).toLocaleDateString()}</span>}
            </div>
          </>
        )}
      </div>
      <div className="card-actions border-t border-gray-200 dark:border-gray-700 p-2 flex justify-between items-center">
        <div className="relative">
          <button
            className="text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm px-2 py-1 flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
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
          {!isCompatibleWithDocument && (
            <FontAwesomeIcon
              icon={faExclamationTriangle}
              className="text-yellow-500"
            />
          )}
          <button
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white text-sm px-2 py-1 ml-2"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
          >
            <FontAwesomeIcon icon={faEllipsisH} />
          </button>

          {showMenu && (
            <div className="absolute bottom-full right-0 mb-2 w-48 bg-white dark:bg-gray-700 rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 z-50 overflow-hidden">
              <button
                className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  editScript(script);
                }}
                disabled={!ParacoreConnected || !isAuthenticated}
              >
                <FontAwesomeIcon icon={faEdit} className="mr-2 w-4" />
                Edit in VSCode
              </button>
              {/* Additional menu items can be added here */}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
