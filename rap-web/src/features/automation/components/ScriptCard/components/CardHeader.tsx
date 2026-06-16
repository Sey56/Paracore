import React from 'react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faStar as fasStar,
  faShieldHeart,
  faTools,
  faLock
} from "@fortawesome/free-solid-svg-icons";
import { faStar as farStar } from "@fortawesome/free-regular-svg-icons";
import styles from '../ScriptCard.module.css';
import { Script } from "@/types/scriptModel";
import { Tooltip } from '@/components/common/Tooltip';

interface CardHeaderProps {
  script: Script;
  isRenaming: boolean;
  renameValue: string;
  setRenameValue: (val: string) => void;
  handleRenameKeyDown: (e: React.KeyboardEvent) => void;
  handleRenameSubmit: () => void;
  isGuard: boolean;
  isArmed: boolean;
  isProtectedTool: boolean;
  isSelected: boolean;
  showExitFocus: boolean;
  isCompact: boolean;
  getDisplayName: () => string;
  handleFavoriteClick: (e: React.MouseEvent) => void;
}

export const CardHeader: React.FC<CardHeaderProps> = ({
  script,
  isRenaming,
  renameValue,
  setRenameValue,
  handleRenameKeyDown,
  handleRenameSubmit,
  isGuard,
  isArmed,
  isProtectedTool,
  isSelected,
  showExitFocus,
  isCompact,
  getDisplayName,
  handleFavoriteClick
}) => {
  return (
    <div className="flex items-start gap-2 mb-2 w-full overflow-visible">
      {isRenaming ? (
        <input
          type="text"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value.replace(/\s+/g, ''))}
          onKeyDown={handleRenameKeyDown}
          onBlur={handleRenameSubmit}
          onClick={(e) => e.stopPropagation()}
          className={`${styles.renameInput} text-gray-800 dark:text-gray-100 flex-1`}
          autoFocus
        />
      ) : (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0 overflow-hidden">
            {isGuard ? (
              <FontAwesomeIcon
                icon={faShieldHeart}
                className={`shrink-0 ${isArmed ? styles.sentinelPulse : styles.guardIcon}`}
                style={{ fontSize: '0.9rem' }}
              />
            ) : (
              isProtectedTool && (
                <FontAwesomeIcon
                  icon={faTools}
                  className="shrink-0 text-slate-400 dark:text-slate-500"
                  style={{ fontSize: '0.9rem' }}
                />
              )
            )}

            <div className="flex-1 min-w-0 overflow-hidden">
              <Tooltip text={getDisplayName()}>
                <h3
                  className={`font-medium truncate ${(isSelected || showExitFocus) ? 'text-gray-900 dark:text-gray-100' : 'text-gray-600 dark:text-gray-400'} group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors duration-200 ${isCompact ? "text-base" : "text-lg"}`}
                >
                  {getDisplayName()}
                </h3>
              </Tooltip>
            </div>

            {isProtectedTool && (
              <span className={`${styles.multiFileBadge} !bg-slate-100 !text-slate-600 dark:!bg-slate-900/40 dark:!text-slate-400 border border-slate-200 dark:border-slate-800 shrink-0`}>
                <FontAwesomeIcon icon={faLock} style={{ fontSize: '0.6rem' }} />
              </span>
            )}
          </div>
        </div>
      )}
      <button
        onClick={handleFavoriteClick}
        className={`shrink-0 ${script.isFavorite
          ? "text-yellow-400 hover:text-yellow-500"
          : `text-gray-400 dark:text-gray-500 hover:text-yellow-400 dark:hover:text-yellow-300 ${(isSelected || showExitFocus) ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-200`
          }`}
      >
        {script.isFavorite ? <FontAwesomeIcon icon={fasStar} /> : <FontAwesomeIcon icon={farStar} />}
      </button>
    </div>
  );
};
