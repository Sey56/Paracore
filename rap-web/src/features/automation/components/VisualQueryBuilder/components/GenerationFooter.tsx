import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faCode, faSpinner, faInfoCircle } from '@fortawesome/free-solid-svg-icons';

interface GenerationFooterProps {
  isLoadingParams: boolean;
  isGenerating: boolean;
  lastGeneratedTimestamp: number | null;
  handleGenerate: () => void;
  canGenerate: boolean;
  isReplacing: boolean;
}

export const GenerationFooter: React.FC<GenerationFooterProps> = ({
  isLoadingParams,
  isGenerating,
  lastGeneratedTimestamp,
  handleGenerate,
  canGenerate,
  isReplacing
}) => {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${isLoadingParams || isGenerating ? 'bg-amber-400 animate-pulse' : 'bg-green-500'}`} />
          <div className="flex flex-col">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{isLoadingParams ? 'Syncing Parameters...' : (isGenerating ? 'Forging Logic...' : 'System Ready')}</span>
            {lastGeneratedTimestamp && !isGenerating && (
              <span className="text-[9px] font-bold text-green-600 dark:text-green-400 animate-in fade-in duration-500"><FontAwesomeIcon icon={faCheck} className="mr-1" /> Logic Synchronized</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={handleGenerate} 
            disabled={!canGenerate || isGenerating} 
            className="group px-8 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all disabled:opacity-30 flex items-center gap-3 active:scale-95"
          >
            {isGenerating ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faCode} className="group-hover:rotate-12 transition-transform" />}
            {isGenerating ? 'Generating...' : 'Generate Code'}
          </button>
        </div>
      </div>

      {lastGeneratedTimestamp && !isGenerating && (
        <div className="px-6 py-4 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100/50 dark:border-blue-800/50 animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-start gap-3">
            <FontAwesomeIcon icon={faInfoCircle} className="text-blue-500 mt-0.5" />
            <div>
              <div className="text-[11px] font-black text-blue-700 dark:text-blue-300 uppercase tracking-tight">Code Generated Successfully</div>
              <p className="text-[10px] text-blue-600/70 dark:text-blue-400/70 font-bold mt-0.5 leading-relaxed">The visual rules have been converted to high-performance Revit API code. Click <strong>{isReplacing ? 'Confirm Changes' : 'Create Script'}</strong> below to save.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
