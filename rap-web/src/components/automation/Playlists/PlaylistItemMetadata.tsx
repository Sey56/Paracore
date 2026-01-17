import React from 'react';
import { Script } from '@/types/scriptModel';
import { useScripts } from '@/hooks/useScripts';
import { ScriptHeader } from '../ScriptInspector/ScriptHeader';
import { MetadataTabContent } from '../ScriptInspector/MetadataTabContent';

interface PlaylistItemMetadataProps {
    script: Script;
}

export const PlaylistItemMetadata: React.FC<PlaylistItemMetadataProps> = ({ script }) => {
    const { toggleFavoriteScript } = useScripts();

    const handleToggleFavorite = (scriptId: string) => {
        toggleFavoriteScript(scriptId);
    };

    return (
        <div className="h-full flex flex-col overflow-hidden">
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Script Details
                </h3>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                <ScriptHeader
                    script={script}
                    onToggleFavorite={handleToggleFavorite}
                    isFavoriteProp={script.isFavorite ?? false}
                    hideFavoriteButton={true}
                />

                <div className="mt-8 pt-8 border-t border-gray-100 dark:border-gray-800">
                    <MetadataTabContent metadata={script.metadata} />
                </div>
            </div>
        </div>
    );
};
