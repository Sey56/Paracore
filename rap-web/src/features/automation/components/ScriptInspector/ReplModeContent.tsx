import React, { useRef } from 'react';
import { useConsole } from '../../store/ConsoleContext';
import { useScriptExecution } from '../../hooks/useScriptExecution';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay } from '@fortawesome/free-solid-svg-icons';
import { REPLCodeEditor } from './REPLCodeEditor';

export const ReplModeContent: React.FC = () => {
  const { 
    singleLineValue, setSingleLineValue,
    multiLineValue, setMultiLineValue,
    isReplLoading, handleReplSubmit,
    activeSnippetName, handleSaveSnippet
  } = useConsole();
  
  const { runningScriptPath } = useScriptExecution();
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isRunning = !!runningScriptPath;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleReplSubmit(true, activeSnippetName);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900">
      {/* Multi-line REPL Editor */}
      <div className="flex-1 min-h-0 flex flex-col pt-2">
        <REPLCodeEditor 
          ref={textareaRef} 
          value={multiLineValue} 
          onChange={setMultiLineValue} 
          onKeyDown={(e) => { 
            if (e.key === 's' && (e.ctrlKey || e.metaKey)) { 
              e.preventDefault(); 
              handleSaveSnippet(false); 
            } else {
              handleKeyDown(e);
            }
          }} 
          disabled={isReplLoading || isRunning} 
          placeholder="Multi-line C# playground... (Ctrl+Enter to run)" 
        />
      </div>
      
      {/* Controls & Single-line REPL Area */}
      <div className="p-4 flex flex-col gap-4 border-t border-slate-200 dark:border-slate-800">
        {/* RUN Button */}
        <div className="flex justify-end">
          <button 
            disabled={isReplLoading || isRunning || !multiLineValue.trim()} 
            className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-lg font-bold flex items-center shadow-lg transition-all active:scale-95 disabled:opacity-50 text-sm" 
            onClick={() => handleReplSubmit(true, activeSnippetName)}
          >
            <FontAwesomeIcon icon={faPlay} className="mr-2 h-3" />
            RUN
          </button>
        </div>

        {/* Single-line Input */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500 font-bold opacity-50 pointer-events-none select-none text-sm">{'>'}</span>
          <input 
            ref={inputRef} 
            type="text" 
            value={singleLineValue} 
            onChange={(e) => setSingleLineValue(e.target.value)} 
            onKeyDown={(e) => { if (e.key === 'Enter') handleReplSubmit(false); }} 
            placeholder="Single command..." 
            disabled={isReplLoading || isRunning} 
            className="w-full pl-7 pr-4 py-2.5 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-900 dark:text-white transition-all font-mono" 
          />
        </div>
      </div>
    </div>
  );
};
