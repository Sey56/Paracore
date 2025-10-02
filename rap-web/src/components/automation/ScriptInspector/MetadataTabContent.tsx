import React from 'react';
import type { ScriptMetadata } from "@/types/scriptModel";

interface MetadataTabContentProps {
  metadata: ScriptMetadata;
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
}) => {
  return (
    <div className="tab-content py-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Column 1 */}
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-gray-700 dark:text-gray-300">Author</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300">{metadata.author || 'N/A'}</p>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 dark:text-gray-300">Document Type</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300">{metadata.documentType || 'Any'}</p>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 dark:text-gray-300">Version</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300">{metadata.version || 'N/A'}</p>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 dark:text-gray-300">Website</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300">{metadata.website || 'N/A'}</p>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 dark:text-gray-300">Categories</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300">{metadata.categories?.join(', ') || 'N/A'}</p>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 dark:text-gray-300">Tags</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300">{metadata.tags?.join(', ') || 'N/A'}</p>
          </div>
        </div>

        {/* Column 2 */}
        <div className="space-y-4">
          <div>
            <h4 className="font-medium text-gray-700 dark:text-gray-300">Last Run</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">{formatLastRun(metadata.lastRun)}</p>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 dark:text-gray-300">Default Script</h4>
            <p className="text-sm text-gray-600 dark:text-gray-300">{metadata.isDefault ? 'Yes' : 'No'}</p>
          </div>
          <div>
            <h4 className="font-medium text-gray-700 dark:text-gray-300">Dependencies</h4>
            <ul className="text-sm space-y-1 text-gray-600 dark:text-gray-300">
              {metadata.dependencies?.map((dep, index) => (
                <li key={index}>{dep}</li>
              )) || <li>N/A</li>}
            </ul>
          </div>
        </div>

        {/* Full-width sections */}
        <div className="md:col-span-2">
          <h4 className="font-medium text-gray-700 dark:text-gray-300">Description</h4>
          <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap mt-1">{metadata.description || 'No description provided.'}</p>
        </div>
        <div className="md:col-span-2">
          <h4 className="font-medium text-gray-700 dark:text-gray-300">History</h4>
          <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap mt-1">{metadata.history || 'No history provided.'}</p>
        </div>
      </div>
    </div>
  );
};

