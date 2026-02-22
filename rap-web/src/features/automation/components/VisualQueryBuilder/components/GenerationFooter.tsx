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
  hasName?: boolean;
}

export const GenerationFooter: React.FC<GenerationFooterProps> = ({
  isLoadingParams,
  isGenerating,
  lastGeneratedTimestamp,
  handleGenerate,
  canGenerate,
  isReplacing,
  hasName = true
}) => {
  return (
    <div className="flex items-center bg-gray-50 dark:bg-gray-800/50 px-5 py-2.5 rounded-2xl border border-gray-100 dark:border-gray-800 gap-6">
      {/* 1. Left: Status */}
      <div className="flex items-center gap-3 shrink-0">
        <div className={`w-2 h-2 rounded-full ${isLoadingParams || isGenerating ? 'bg-amber-400 animate-pulse' : 'bg-green-500'}`} />
        <div className="flex flex-col">
          <span className="text-xs font-black text-gray-400 uppercase tracking-widest leading-tight">
            {isLoadingParams ? 'Syncing...' : (isGenerating ? 'Forging...' : 'System Ready')}
          </span>
          {lastGeneratedTimestamp && !isGenerating && (
            <span className="text-[11px] font-bold text-green-600 dark:text-green-400 animate-in fade-in duration-500 italic block">
              Logic Sync
            </span>
          )}
        </div>
      </div>

      {/* 2. Center: Feedback Message (Expanded) */}
      <div className="flex-1 min-w-0">
        {lastGeneratedTimestamp && !isGenerating && (
          <div className="flex items-center gap-2 animate-in slide-in-from-left-2 duration-300">
            <FontAwesomeIcon icon={faInfoCircle} className="text-blue-500 text-xs" />
            <p className="text-xs text-blue-600/70 dark:text-blue-400/70 font-bold truncate">
              {(!isReplacing && !hasName) ? (
                <span className="text-rose-500 font-black animate-pulse">SET A NAME AT THE TOP TO ENABLE THE CREATE BUTTON.</span>
              ) : (
                <>Rules converted to Revit API code. Click <strong>{isReplacing ? 'Update' : 'Create'}</strong> below.</>
              )}
            </p>
          </div>
        )}
      </div>

      {/* 3. Right: Action */}
      <div className="shrink-0">
        <button
          onClick={handleGenerate}
          disabled={!canGenerate || isGenerating}
          className="group px-6 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/10 hover:bg-blue-700 transition-all disabled:opacity-30 flex items-center gap-3 active:scale-95"
        >
          {isGenerating ? <FontAwesomeIcon icon={faSpinner} spin /> : <FontAwesomeIcon icon={faCode} className="group-hover:rotate-12 transition-transform" />}
          {isGenerating ? 'Generating...' : 'Generate Code'}
        </button>
      </div>
    </div>
  );
};
