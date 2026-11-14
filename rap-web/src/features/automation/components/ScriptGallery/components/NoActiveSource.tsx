import React from 'react';
import { FontAwesomeIcon } from '@/components/ui/Icon';
import { faGlobe } from '@/components/ui/iconAliases';

export const NoActiveSource: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center space-y-6 animate-in fade-in duration-700">
      <div className="w-20 h-20 rounded-2xl bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center ">
        <FontAwesomeIcon icon={faGlobe} className="text-3xl text-slate-300 dark:text-slate-600" />
      </div>
      <div className="space-y-2">
        <h2 className="text-body-lg font-medium text-slate-600 dark:text-slate-300">No Active Script Source</h2>
        <p className="text-body-sm text-slate-400 dark:text-slate-500 leading-relaxed max-w-sm">
          Select a Local Source from the sidebar to get started.
        </p>
      </div>
    </div>
  );
};
