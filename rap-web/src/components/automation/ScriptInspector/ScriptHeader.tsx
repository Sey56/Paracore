import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faStar as fasStar } from '@fortawesome/free-solid-svg-icons';
import { faStar as farStar } from '@fortawesome/free-regular-svg-icons';
import { Script } from '@/types/scriptModel';
import { getScriptLog } from '@/api/workspaces';

interface ScriptHeaderProps {
  script: Script;
  onToggleFavorite: (scriptId: string) => void;
}

export const ScriptHeader: React.FC<ScriptHeaderProps> = ({ script, onToggleFavorite }) => {
  const [gitLog, setGitLog] = useState<string | null>(null);

  useEffect(() => {
    const fetchGitLog = async () => {
      if (script?.absolutePath) {
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
  }, [script?.absolutePath]);

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
    <div className="mb-6">
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-medium text-xl text-gray-800 dark:text-gray-100">
          {script.metadata.displayName || script.name.replace(/\.cs$/, "")}
        </h3>
        <button
          onClick={() => onToggleFavorite(script.id)}
          className={`${script.isFavorite ? 'text-yellow-400 hover:text-yellow-500' : 'text-gray-400 dark:text-gray-500 hover:text-yellow-400 dark:hover:text-yellow-300'}`}
        >
          {script.isFavorite ? (
            <FontAwesomeIcon icon={fasStar} />
          ) : (
            <FontAwesomeIcon icon={farStar} />
          )}
        </button>
      </div>

      {/* Categories */}
      {script.metadata.categories && script.metadata.categories.length > 0 && (
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
              {script.metadata.categories.join(', ')}
          </div>
      )}

      {/* Description */}
      {script.metadata.description && (
        <p className="text-gray-600 dark:text-gray-300 mb-4">{script.metadata.description}</p>
      )}
      
      {/* Author and Version */}
      <div className="flex justify-between items-center text-sm text-gray-500 dark:text-gray-400">
        <span>{script.metadata.author || 'Unknown Author'}</span>
        <span>{script.metadata.version || 'v1.0'}</span>
      </div>

      {/* Git Last Commit Info */}
      {gitLog && (lastCommitAuthor || lastCommitDate) && (
        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
          {lastCommitAuthor && <span>Last Commit by: {lastCommitAuthor}</span>}
          {lastCommitDate && <span className="ml-2">on {lastCommitDate}</span>}
          {lastCommitMessage && <p className="italic">"{lastCommitMessage}"</p>}
        </div>
      )}
    </div>
  );
};

