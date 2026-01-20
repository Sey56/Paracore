import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar as fasStar, faChevronUp, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { faStar as farStar } from '@fortawesome/free-regular-svg-icons';
import { Script } from '@/types/scriptModel';
import { getScriptLog } from '@/api/workspaces';
import { useUI } from '@/hooks/useUI';

interface ScriptHeaderProps {
  script: Script;
  onToggleFavorite: (scriptId: string) => void;
  disabled?: boolean;
  isFavoriteProp: boolean;
  hideFavoriteButton?: boolean;
}

export const ScriptHeader: React.FC<ScriptHeaderProps> = ({ script, onToggleFavorite, disabled, isFavoriteProp, hideFavoriteButton }) => {
  const [gitLog, setGitLog] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { activeScriptSource } = useUI();

  useEffect(() => {
    const fetchGitLog = async () => {
      if (script?.absolutePath && activeScriptSource?.type === 'workspace') {
        try {
          const response = await getScriptLog(script.absolutePath);
          setGitLog(response.log);
        } catch (error) {
          console.error("Failed to fetch script Git log:", error);
          setGitLog(null);
        }
      }
    };
    fetchGitLog();
  }, [script?.absolutePath, activeScriptSource]);

  const parseGitLog = (log: string) => {
    const authorMatch = log.match(/Author: (.+?) <.+>/);
    const dateMatch = log.match(/Date: {3}(.+)/);
    const commitMessageMatch = log.match(/\n\n\s{3}(.+)/);

    const author = authorMatch ? authorMatch[1] : 'Unknown';
    const date = dateMatch ? new Date(dateMatch[1]).toLocaleDateString() : 'Unknown';
    const message = commitMessageMatch ? commitMessageMatch[1] : 'No message';

    return { author, date, message };
  };

  const { author: lastCommitAuthor, date: lastCommitDate, message: lastCommitMessage } = gitLog ? parseGitLog(gitLog) : { author: null, date: null, message: null };

  return (
    <div className={`mb-6 border-b border-gray-100 dark:border-gray-700 pb-4 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-medium text-xl text-gray-800 dark:text-gray-100 flex items-center gap-2">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm focus:outline-none"
            title={isCollapsed ? "Expand Details" : "Collapse Details"}
          >
            <FontAwesomeIcon icon={isCollapsed ? faChevronDown : faChevronUp} />
          </button>
          {script.metadata.displayName || script.name.replace(/\.cs$/, "")}
        </h3>
        {!hideFavoriteButton && (
          <button
            onClick={() => onToggleFavorite(script.id)}
            className={`${isFavoriteProp ? 'text-yellow-400 hover:text-yellow-500' : 'text-gray-400 dark:text-gray-500 hover:text-yellow-400 dark:hover:text-yellow-300'}`}
          >
            {isFavoriteProp ? (
              <FontAwesomeIcon icon={fasStar} />
            ) : (
              <FontAwesomeIcon icon={farStar} />
            )}
          </button>
        )}
      </div>

      {!isCollapsed && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-200">
          {/* Categories */}
          {script.metadata.categories && script.metadata.categories.length > 0 && (
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-2 pl-6">
              {script.metadata.categories.join(', ')}
            </div>
          )}

          {/* Description */}
          {script.metadata.description && (
            <p className="text-gray-600 dark:text-gray-300 mb-4 pl-6 text-sm leading-relaxed">{script.metadata.description}</p>
          )}

          {/* Author */}
          <div className="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400 pl-6">
            <span>{script.metadata.author || 'Unknown Author'}</span>
          </div>

          {/* Git Last Commit Info */}
          {gitLog && (lastCommitAuthor || lastCommitDate) && (
            <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 pl-6 border-l-2 border-gray-200 dark:border-gray-700 ml-6 py-1">
              {lastCommitAuthor && <span>Last Commit by: {lastCommitAuthor}</span>}
              {lastCommitDate && <span className="ml-2">on {lastCommitDate}</span>}
              {lastCommitMessage && <p className="italic mt-1">"{lastCommitMessage}"</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

