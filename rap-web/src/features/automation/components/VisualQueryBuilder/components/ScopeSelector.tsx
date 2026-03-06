import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faMousePointer } from '@fortawesome/free-solid-svg-icons';

interface ScopeSelectorProps {
  scope: 'project' | 'selection';
  setScope: (val: 'project' | 'selection') => void;
  onReset: () => void;
}

export const ScopeSelector: React.FC<ScopeSelectorProps> = ({ scope, setScope, onReset }) => {
  return (
    <div className="flex bg-slate-50/50 dark:bg-slate-900/50 p-1 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <button
        onClick={() => { setScope('project'); onReset(); }}
        className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-2 ${scope === 'project' 
          ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-sm border border-blue-500/10 dark:border-blue-400/10' 
          : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
      >
        <FontAwesomeIcon icon={faSearch} className="text-[11px]" /> Project Scope
      </button>
      <button
        onClick={() => { setScope('selection'); onReset(); }}
        className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-all flex items-center gap-2 ${scope === 'selection' 
          ? 'bg-white dark:bg-slate-900 text-purple-600 shadow-sm border border-blue-500/10 dark:border-blue-400/10' 
          : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
      >
        <FontAwesomeIcon icon={faMousePointer} className="text-[11px]" /> Active Selection
      </button>
    </div>
  );
};
