import React from 'react';
import { Script } from '@/types/scriptModel';
import { MetadataTabContent } from '../ScriptInspector/MetadataTabContent';

interface PlaylistItemMetadataProps {
    script: Script;
}

export const PlaylistItemMetadata: React.FC<PlaylistItemMetadataProps> = ({ script }) => {
    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Script Details
                </h3>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                <MetadataTabContent metadata={script.metadata} scriptName={script.metadata?.displayName || script.name} />
            </div>
        </div>
    );
};
