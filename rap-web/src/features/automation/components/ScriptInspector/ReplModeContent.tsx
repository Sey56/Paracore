import React, { useState, useRef, useEffect } from 'react';
import { useConsole } from '../../store/ConsoleContext';
import { useScriptExecution } from '../../hooks/useScriptExecution';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faSpinner, faTerminal, faCode, faFile, faFolderOpen, faSave, faFileExport, faHistory, faThumbtack, faPlus, faMinus, faIndent } from '@fortawesome/free-solid-svg-icons';
import { MonacoReplEditor, type MonacoReplEditorHandle } from './MonacoReplEditor';
import { Modal } from '@/components/common/Modal';
import { Tooltip } from '@/components/common/Tooltip';

/**
 * An action that REPLACES the editor buffer, held while we ask about unsaved work.
 *
 * ⚠ ONE guard for every path that would discard the buffer. New/Clear had its own
 *   confirmation, but Open and the Recent-files menu both called straight into
 *   `setMultiLineValue` — so clicking a script silently threw away what you had typed.
 *   Routing all three through `guardUnsaved` means a fourth entry point added later
 *   cannot quietly skip the question again.
 */
type PendingAction = { title: string; verb: string; run: () => void };

export const ReplModeContent: React.FC = () => {
  const {
    multiLineValue, setMultiLineValue,
    isReplLoading, handleReplSubmit,
    activeSnippetName, handleSaveSnippet,
    isDirty,
    handleNewSnippet, handleLoadSnippet,
    recentFiles, pinnedFiles, togglePinFile, removeRecentFile, loadRecentFile,
    replFontSize, increaseReplFontSize, decreaseReplFontSize, resetReplFontSize
  } = useConsole();

  const { runningScriptPath } = useScriptExecution();
  const isRunning = !!runningScriptPath;

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [showRecentMenu, setShowRecentMenu] = useState(false);
  const recentMenuRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoReplEditorHandle>(null);

  // Close recent menu on outside click
  useEffect(() => {
    if (!showRecentMenu) return;
    const handler = (e: MouseEvent) => {
      if (recentMenuRef.current && !recentMenuRef.current.contains(e.target as Node)) {
        setShowRecentMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showRecentMenu]);

  // Combine pinned + recent for display, deduplicating
  const displayFiles = React.useMemo(() => {
    const pinnedPaths = new Set(pinnedFiles.map(f => f.path));
    const pinned = pinnedFiles.map(f => ({ ...f, isPinned: true, lastOpened: 0 }));
    const recent = recentFiles
      .filter(f => !pinnedPaths.has(f.path))
      .map(f => ({ ...f, isPinned: false }));
    return [...pinned, ...recent];
  }, [pinnedFiles, recentFiles]);

  /**
   * Run `action` now, or ask first when the buffer holds unsaved work.
   * An empty editor has nothing to lose, so it never prompts.
   */
  const guardUnsaved = (action: PendingAction) => {
    if (multiLineValue.trim() && isDirty) {
      setPendingAction(action);
    } else {
      action.run();
    }
  };

  const onNewSnippet = () =>
    guardUnsaved({ title: 'Clear REPL', verb: 'clearing', run: handleNewSnippet });

  const onOpenSnippet = () =>
    guardUnsaved({ title: 'Open Script', verb: 'opening another script', run: handleLoadSnippet });

  const onOpenRecent = (path: string) =>
    guardUnsaved({
      title: 'Open Script',
      verb: 'opening another script',
      run: () => { void loadRecentFile(path); },
    });

  // Keyboard shortcuts: Ctrl/Cmd + Plus / Minus / 0 for font size scaling
  useEffect(() => {
    const handleGlobalZoomKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault();
          increaseReplFontSize();
        } else if (e.key === '-' || e.key === '_') {
          e.preventDefault();
          decreaseReplFontSize();
        } else if (e.key === '0') {
          e.preventDefault();
          resetReplFontSize();
        }
      }
    };

    window.addEventListener('keydown', handleGlobalZoomKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalZoomKeyDown);
  }, [increaseReplFontSize, decreaseReplFontSize, resetReplFontSize]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 overflow-x-hidden">
      {/* Header — REPL file management, flush against top */}
      <div className="flex items-center justify-between px-4 h-12 bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
            <FontAwesomeIcon icon={faTerminal} className="text-[10px]" />
            <span className="text-[11px] font-bold whitespace-nowrap">REPL Playground</span>
          </div>
          {activeSnippetName && (
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 border-l border-slate-200 dark:border-slate-700 ml-2 pl-3">
              <FontAwesomeIcon icon={faCode} className="text-[10px]" />
              <span className="text-[10px] font-bold tracking-wider italic truncate max-w-[320px]" title={activeSnippetName}>
                {activeSnippetName}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Font Size Stepper */}
          <div className="flex items-center bg-slate-100/90 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700/80 shadow-xs">
            <Tooltip text="Decrease Font Size (Ctrl + -)" position="bottom-center">
              <button
                onClick={decreaseReplFontSize}
                disabled={replFontSize <= 11}
                className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-blue-500 dark:text-slate-400 dark:hover:text-blue-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-bold rounded"
              >
                <FontAwesomeIcon icon={faMinus} className="text-[9px]" />
              </button>
            </Tooltip>
            
            <Tooltip text="Reset Font Size to 14px (Ctrl + 0)" position="bottom-center">
              <button
                onClick={resetReplFontSize}
                className="px-1.5 h-6 flex items-center justify-center text-[10px] font-mono font-bold text-slate-600 dark:text-slate-300 hover:text-blue-500 transition-colors select-none rounded hover:bg-slate-200/50 dark:hover:bg-slate-700/50"
              >
                {replFontSize}px
              </button>
            </Tooltip>

            <Tooltip text="Increase Font Size (Ctrl + +)" position="bottom-center">
              <button
                onClick={increaseReplFontSize}
                disabled={replFontSize >= 32}
                className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-blue-500 dark:text-slate-400 dark:hover:text-blue-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs font-bold rounded"
              >
                <FontAwesomeIcon icon={faPlus} className="text-[9px]" />
              </button>
            </Tooltip>
          </div>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

          <Tooltip text="New / Clear" position="bottom-center">
            <button onClick={onNewSnippet} className="p-1.5 text-slate-400 hover:text-green-500 transition-colors">
              <FontAwesomeIcon icon={faFile} className="text-xs" />
            </button>
          </Tooltip>
          <Tooltip text="Open" position="bottom-center">
            <button onClick={onOpenSnippet} className="p-1.5 text-slate-400 hover:text-blue-500 transition-colors">
              <FontAwesomeIcon icon={faFolderOpen} className="text-xs" />
            </button>
          </Tooltip>
          <Tooltip text="Save" position="bottom-center">
            <button
              onClick={() => handleSaveSnippet(false)}
              disabled={!multiLineValue.trim()}
              className={`p-1.5 transition-colors ${multiLineValue.trim() ? 'text-slate-400 hover:text-blue-500' : 'text-slate-200 dark:text-slate-800'}`}
            >
              <FontAwesomeIcon icon={faSave} className="text-xs" />
            </button>
          </Tooltip>
          <Tooltip text="Save As" position="bottom-center">
            <button
              onClick={() => handleSaveSnippet(true)}
              disabled={!multiLineValue.trim()}
              className={`p-1.5 transition-colors ${multiLineValue.trim() ? 'text-slate-400 hover:text-blue-500' : 'text-slate-200 dark:text-slate-800'}`}
            >
              <FontAwesomeIcon icon={faFileExport} className="text-xs" />
            </button>
          </Tooltip>
          <div className="relative" ref={recentMenuRef}>
            <Tooltip text="Recent Files" position="bottom-center">
              <button
                onClick={() => setShowRecentMenu(!showRecentMenu)}
                className={`p-1.5 transition-colors ${displayFiles.length > 0 ? 'text-slate-400 hover:text-amber-500' : 'text-slate-200 dark:text-slate-700'}`}
              >
                <FontAwesomeIcon icon={faHistory} className="text-xs" />
              </button>
            </Tooltip>
            {showRecentMenu && displayFiles.length > 0 && (
              <div className="absolute right-0 top-full mt-1 w-72 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="py-1 max-h-64 overflow-y-auto custom-scrollbar">
                  {displayFiles.map((file, idx) => (
                    <div
                      key={file.path}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer group"
                    >
                      <button
                        onClick={() => { onOpenRecent(file.path); setShowRecentMenu(false); }}
                        className="flex-1 flex items-center gap-2 min-w-0 text-left"
                      >
                        <FontAwesomeIcon icon={faCode} className="text-[10px] text-slate-400 shrink-0" />
                        <span className="text-xs text-slate-700 dark:text-slate-300 truncate">{file.name}</span>
                      </button>
                      <Tooltip text={file.isPinned ? 'Unpin' : 'Pin'} position={idx === 0 ? 'bottom' : 'top'}>
                        <button
                          onClick={() => togglePinFile(file.path, file.name)}
                          className={`shrink-0 p-0.5 transition-colors ${file.isPinned ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100'}`}
                        >
                          <FontAwesomeIcon icon={faThumbtack} className="text-[10px]" />
                        </button>
                      </Tooltip>
                      <Tooltip text="Remove" position={idx === 0 ? 'bottom' : 'top'}>
                        <button
                          onClick={() => removeRecentFile(file.path)}
                          className="shrink-0 p-0.5 text-slate-300 dark:text-slate-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-colors"
                        >
                          <span className="text-[10px]">×</span>
                        </button>
                      </Tooltip>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {showRecentMenu && displayFiles.length === 0 && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl z-50 p-4 text-center">
                <p className="text-xs text-slate-400">No recent files yet.</p>
                <p className="text-[10px] text-slate-400 mt-1">Save or open a snippet to see it here.</p>
              </div>
            )}
          </div>

          <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

          <Tooltip text="Format Document (Shift+Alt+F)" position="bottom-center">
            <button
              onClick={() => editorRef.current?.format()}
              disabled={!multiLineValue.trim() || isReplLoading || isRunning}
              className={`p-1.5 transition-colors ${multiLineValue.trim() && !isReplLoading && !isRunning ? 'text-slate-400 hover:text-blue-500' : 'text-slate-200 dark:text-slate-800'}`}
            >
              <FontAwesomeIcon icon={faIndent} className="text-xs" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* REPL Editor */}
      <div className="flex-1 min-h-0 flex flex-col pt-2">
        <MonacoReplEditor
          ref={editorRef}
          value={multiLineValue}
          onChange={setMultiLineValue}
          onRun={() => handleReplSubmit(activeSnippetName)}
          onSave={() => handleSaveSnippet(false)}
          fontSize={replFontSize}
          disabled={isReplLoading || isRunning}
          placeholder="C# Playground... (Ctrl+Enter to run)"
        />
      </div>

      {/* Controls */}
      <div className="p-4 flex justify-end border-t border-slate-200 dark:border-slate-800">
        <button
          disabled={isReplLoading || isRunning || !multiLineValue.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 rounded-lg font-bold flex items-center shadow-lg transition-all active:scale-95 disabled:opacity-50 text-sm"
          onClick={() => handleReplSubmit(activeSnippetName)}
        >
          {isReplLoading ? (
            <FontAwesomeIcon icon={faSpinner} spin className="mr-2 h-3" />
          ) : (
            <FontAwesomeIcon icon={faPlay} className="mr-2 h-3" />
          )}
          {isReplLoading ? "RUNNING..." : "RUN"}
        </button>
      </div>

      {/* Unsaved-changes guard — shared by New/Clear, Open and Recent */}
      <Modal
        isOpen={!!pendingAction}
        onClose={() => setPendingAction(null)}
        title={pendingAction?.title ?? ''}
        size="sm"
      >
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
          {activeSnippetName
            ? `You have unsaved changes to "${activeSnippetName}". Save before ${pendingAction?.verb}?`
            : `You have unsaved code in the editor. Save before ${pendingAction?.verb}?`}
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setPendingAction(null)}
            className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              const run = pendingAction?.run;
              setPendingAction(null);
              run?.();
            }}
            className="px-4 py-2 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium transition-colors"
          >
            Discard Changes
          </button>
          <button
            onClick={async () => {
              const saved = await handleSaveSnippet(false);
              if (saved) {
                const run = pendingAction?.run;
                setPendingAction(null);
                run?.();
              }
            }}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Save First
          </button>
        </div>
      </Modal>
    </div>
  );
};
