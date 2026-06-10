import React, { useState, useRef, useEffect } from 'react';
import { useConsole } from '../../store/ConsoleContext';
import { useScriptExecution } from '../../hooks/useScriptExecution';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { REPLCodeEditor } from './REPLCodeEditor';

export const ReplModeContent: React.FC = () => {
  const { 
    singleLineValue, setSingleLineValue,
    multiLineValue, setMultiLineValue,
    isReplLoading, handleReplSubmit,
    activeSnippetName, handleSaveSnippet,
    singleCommandHistory
  } = useConsole();
  
  const { runningScriptPath } = useScriptExecution();
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isRunning = !!runningScriptPath;

  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [currentValueBeforeHistory, setCurrentValueBeforeHistory] = useState<string>("");

  // Re-focus the single-line input after loading finishes
  const wasLoadingRef = useRef(false);
  useEffect(() => {
    if (wasLoadingRef.current && !isReplLoading) {
      inputRef.current?.focus();
    }
    wasLoadingRef.current = isReplLoading;
  }, [isReplLoading]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleReplSubmit(true, activeSnippetName);
    }
  };

  const handleSingleLineKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const { selectionStart, selectionEnd, value } = input;

    if (e.key === 'Enter') {
      handleReplSubmit(false);
      setHistoryIndex(-1);
      setCurrentValueBeforeHistory("");
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (singleCommandHistory.length === 0) return;
      
      const nextIndex = historyIndex + 1;
      if (nextIndex < singleCommandHistory.length) {
        if (historyIndex === -1) {
          setCurrentValueBeforeHistory(singleLineValue);
        }
        setHistoryIndex(nextIndex);
        setSingleLineValue(singleCommandHistory[nextIndex]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex === -1) return;

      const nextIndex = historyIndex - 1;
      if (nextIndex >= 0) {
        setHistoryIndex(nextIndex);
        setSingleLineValue(singleCommandHistory[nextIndex]);
      } else {
        setHistoryIndex(-1);
        setSingleLineValue(currentValueBeforeHistory);
      }
    }

    // --- Auto-Pairing Helper ---
    const pairs: Record<string, string> = {
      '(': ')',
      '[': ']',
      '{': '}',
      '"': '"',
      "'": "'",
      '<': '>'
    };

    // 1. Handle Opening Characters
    if (pairs[e.key]) {
      e.preventDefault();
      const opening = e.key;
      const closing = pairs[e.key];
      const selectedText = value.substring(selectionStart!, selectionEnd!);
      
      const newValue = 
        value.substring(0, selectionStart!) + 
        opening + 
        selectedText + 
        closing + 
        value.substring(selectionEnd!);
      
      setSingleLineValue(newValue);
      
      // Place cursor between the pair (or keep selection wrapped)
      setTimeout(() => {
        input.setSelectionRange(selectionStart! + 1, selectionStart! + 1 + selectedText.length);
      }, 0);
      return;
    }

    // 2. Handle Closing Character Overwrite (if typing ')' when ')' is already there)
    const closers = [')', ']', '}', '"', "'", '>'];
    if (closers.includes(e.key) && selectionStart === selectionEnd && value[selectionStart!] === e.key) {
      e.preventDefault();
      input.setSelectionRange(selectionStart! + 1, selectionStart! + 1);
      return;
    }

    // 3. Smart Backspace (delete both if between a pair)
    if (e.key === 'Backspace' && selectionStart === selectionEnd && selectionStart! > 0) {
      const charBefore = value[selectionStart! - 1];
      const charAfter = value[selectionStart!];
      
      if (pairs[charBefore] === charAfter) {
        e.preventDefault();
        const newValue = value.substring(0, selectionStart! - 1) + value.substring(selectionStart! + 1);
        setSingleLineValue(newValue);
        setTimeout(() => {
          input.setSelectionRange(selectionStart! - 1, selectionStart! - 1);
        }, 0);
      }
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
          placeholder="C# Playground... (Ctrl+Enter to run)" 
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
            {isReplLoading ? (
              <FontAwesomeIcon icon={faSpinner} spin className="mr-2 h-3" />
            ) : (
              <FontAwesomeIcon icon={faPlay} className="mr-2 h-3" />
            )}
            {isReplLoading ? "RUNNING..." : "RUN"}
          </button>
        </div>

        {/* Single-line Input */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500 font-bold opacity-50 pointer-events-none select-none text-sm">{'>'}</span>
          <input 
            ref={inputRef} 
            type="text" 
            value={singleLineValue} 
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            onChange={(e) => {
              setSingleLineValue(e.target.value);
              setHistoryIndex(-1);
              setCurrentValueBeforeHistory("");
            }} 
            onKeyDown={handleSingleLineKeyDown} 
            placeholder="Single command..." 
            disabled={isReplLoading || isRunning} 
            className="w-full pl-7 pr-4 py-2.5 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-900 dark:text-white transition-all font-mono" 
          />
        </div>
      </div>
    </div>
  );
};
