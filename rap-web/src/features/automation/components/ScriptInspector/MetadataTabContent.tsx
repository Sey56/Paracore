import React from 'react';
import type { ScriptMetadata } from "@/types/scriptModel";

interface MetadataTabContentProps {
  metadata: ScriptMetadata;
  scriptName?: string;
}

const formatLastRun = (isoString: string | undefined | null): string => {
  if (!isoString) {
    return 'Never';
  }
  try {
    const timestamp = new Date(isoString);
    // Check if the date is valid
    if (isNaN(timestamp.getTime())) {
      return 'Never'; // or return the original string, or some other fallback
    }
    const formattedDate = timestamp.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const formattedTime = timestamp.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
    return `${formattedDate}\n${formattedTime}`;
  } catch (error) {
    return 'Invalid Date';
  }
};

export const MetadataTabContent: React.FC<MetadataTabContentProps> = ({
  metadata,
  scriptName
}) => {
  const getDisplayName = () => {
    const rawName = metadata.displayName || scriptName || 'Unnamed Script';
    return rawName.replace(/\.(cs|ptool|wtool)$/i, "");
  };

  return (
    <div className="tab-content py-4 h-full overflow-y-auto pr-2 custom-scrollbar">
      {/* Full-width Script Name section */}
      <div className="mb-6">
        <h4 className="font-medium text-slate-600 dark:text-slate-300">Script Name</h4>
        <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-1">{getDisplayName()}</p>
      </div>

      {/* Full-width Description section */}
      <div className="mb-6">
        <h4 className="font-medium text-slate-600 dark:text-slate-300">Description</h4>
        <p className="text-sm text-slate-500 dark:text-slate-400 whitespace-pre-wrap mt-1">{metadata.description || 'No description provided.'}</p>
      </div>

      {/* Full-width Usage Examples section */}
      <div className="mb-6">
        <h4 className="font-medium text-slate-600 dark:text-slate-300">Usage Examples</h4>
        {metadata.usage_examples && metadata.usage_examples.length > 0 ? (
          <ul className="text-sm space-y-1 text-slate-500 dark:text-slate-400 list-disc list-inside">
            {metadata.usage_examples
              .filter(example => example.trim() !== '')
              .map((example, index) => (
                <li key={index}>{example}</li>
              ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">No examples provided.</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Column 1 */}
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-slate-600 dark:text-slate-300">Author</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400">{metadata.author || 'N/A'}</p>
          </div>
          <div>
            <h4 className="font-medium text-slate-600 dark:text-slate-300">Document Type</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400">{metadata.documentType || 'Any'}</p>
          </div>
          <div>
            <h4 className="font-medium text-slate-600 dark:text-slate-300">Website</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400">{metadata.website || 'N/A'}</p>
          </div>
          <div>
            <h4 className="font-medium text-slate-600 dark:text-slate-300">Categories</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400">{metadata.categories?.join(', ') || 'N/A'}</p>
          </div>
        </div>

        {/* Column 2 */}
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-slate-600 dark:text-slate-300">Last Run</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 whitespace-pre-wrap">{formatLastRun(metadata.lastRun)}</p>
          </div>
          <div>
            <h4 className="font-medium text-slate-600 dark:text-slate-300">Date Created</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 whitespace-pre-wrap">{formatLastRun(metadata.dateCreated)}</p>
          </div>
          <div>
            <h4 className="font-medium text-slate-600 dark:text-slate-300">Date Modified</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 whitespace-pre-wrap">{formatLastRun(metadata.dateModified)}</p>
          </div>
          {metadata.gitInfo && (
            <div>
              <h4 className="font-medium text-slate-600 dark:text-slate-300">Last Commit</h4>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {metadata.gitInfo.lastCommitAuthor || 'N/A'} on {metadata.gitInfo.lastCommitDate ? new Date(metadata.gitInfo.lastCommitDate).toLocaleDateString() : 'N/A'}
                {metadata.gitInfo.lastCommitMessage && <span className="block italic">"{metadata.gitInfo.lastCommitMessage}"</span>}
              </p>
            </div>
          )}
          <div>
            <h4 className="font-medium text-slate-600 dark:text-slate-300">Dependencies</h4>
            <ul className="text-sm space-y-1 text-slate-500 dark:text-slate-400">
              {metadata.dependencies?.map((dep, index) => (
                <li key={index}>{dep}</li>
              )) || <li>N/A</li>}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
