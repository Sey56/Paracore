import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGlobe } from '@fortawesome/free-solid-svg-icons';

export const NoActiveSource: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center py-40 text-center space-y-6 animate-in fade-in duration-700">
      <div className="w-20 h-20 rounded-[2.5rem] bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center border border-slate-100 dark:border-slate-700 shadow-inner">
        <FontAwesomeIcon icon={faGlobe} className="text-3xl text-slate-300 dark:text-slate-600" />
      </div>
      <div className="space-y-2">
        <h2 className="text-sm font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">No Active Script Source</h2>
        <p className="text-[11px] font-bold text-slate-400/60 dark:text-slate-500/40 uppercase tracking-widest leading-relaxed max-w-[280px]">
          Select a Local Source or Team Source from the sidebar to station your units.
        </p>
      </div>
    </div>
  );
};
