/**
 * The REPL playground editor — a real code editor (Monaco) in place of the old
 * textarea-over-a-highlight-div.
 *
 * The intelligence is the add-in's Roslyn backend (see `replIntellisense.ts`), not Monaco's;
 * Monaco contributes the editing surface and the suggestion widget the answers render into.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type * as Monaco from 'monaco-editor';
import { useTheme } from '@/context/ThemeContext';
import { monaco, monacoThemeFor, suppressFoldingTooltips } from './monacoSetup';
import { refreshReplDiagnostics, registerReplCompletionProvider, registerReplHoverProvider } from './replIntellisense';
import { registerReplFormatProvider } from './replFormatter';

interface MonacoReplEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Ctrl/Cmd+Enter — run the buffer. */
  onRun: () => void;
  /** Ctrl/Cmd+S — save the snippet. */
  onSave?: () => void;
  disabled?: boolean;
  placeholder?: string;
  fontSize?: number;
}

/**
 * Imperative surface for callers that live OUTSIDE the editor (the REPL toolbar). Monaco owns
 * the instance, so a button in a sibling component can only reach it through a handle.
 */
export interface MonacoReplEditorHandle {
  /** Run Monaco's "Format Document" against the registered C# formatter. */
  format: () => void;
}

export const MonacoReplEditor = forwardRef<MonacoReplEditorHandle, MonacoReplEditorProps>(
  function MonacoReplEditor(
    {
      value,
      onChange,
      onRun,
      onSave,
      disabled = false,
      placeholder = 'Write your code here...',
      fontSize = 14,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
    const { theme } = useTheme();

    // Latest callbacks behind refs, so the editor is created ONCE and never rebuilt when a
    // parent re-render hands us a new function identity.
    const onChangeRef = useRef(onChange);
    const onRunRef = useRef(onRun);
    const onSaveRef = useRef(onSave);
    onChangeRef.current = onChange;
    onRunRef.current = onRun;
    onSaveRef.current = onSave;

    // The toolbar's Format button goes through Monaco's own action, so it shares one code path
    // (and one undo step) with Shift+Alt+F and the context menu.
    useImperativeHandle(ref, () => ({
      format: () => {
        void editorRef.current?.getAction('editor.action.formatDocument')?.run();
      },
    }), []);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      // Global to Monaco, so they are registered once no matter how often this mounts.
      registerReplCompletionProvider();
      registerReplHoverProvider();
      registerReplFormatProvider();

      const editor = monaco.editor.create(container, {
        value,
        language: 'csharp',
        theme: monacoThemeFor(theme),
        fontSize,
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        lineNumbers: 'on',
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 4,
        renderWhitespace: 'selection',
        bracketPairColorization: { enabled: true },
        suggestOnTriggerCharacters: true,
        quickSuggestions: { other: true, comments: false, strings: false },
        // Off: word-based guesses would crowd out the real Roslyn answers.
        wordBasedSuggestions: 'off',
        placeholder,
        readOnly: disabled,
        padding: { top: 12, bottom: 12 },
        scrollbar: { alwaysConsumeMouseWheel: false },
      });

      editorRef.current = editor;

      const model = editor.getModel();

      // Diagnostics run on IDLE, not per keystroke: a full compilation is far heavier than a
      // completion query, and a squiggle that arrives a moment late is perfectly acceptable.
      let diagnosticsTimer: number | undefined;
      const scheduleDiagnostics = () => {
        if (diagnosticsTimer !== undefined) window.clearTimeout(diagnosticsTimer);
        diagnosticsTimer = window.setTimeout(() => {
          diagnosticsTimer = undefined;
          if (model) void refreshReplDiagnostics(model, editor.getValue());
        }, 600);
      };

      const changeSub = editor.onDidChangeModelContent(() => {
        onChangeRef.current(editor.getValue());
        scheduleDiagnostics();
      });

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onRunRef.current());
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => onSaveRef.current?.());

      // Squiggles for whatever is already in the buffer (e.g. a snippet opened from disk).
      scheduleDiagnostics();

      // Fold tooltips — `suppressFoldingTooltips()` (monacoSetup) is the source-level fix that
      // stops the `title` from being written at all. This is the DOM fallback: Monaco writes
      // "Click to expand the range." / "Click to collapse the range." as a NATIVE `title` on every
      // folding chevron (`.cldr` inside `.margin-view-overlays`) and re-writes it on each render.
      // This editor creates no other line decorations, so every `.cldr[title]` here is a folding
      // control — strip the attribute whenever one appears.
      void suppressFoldingTooltips();
      const stripFoldTooltips = () => {
        container.querySelectorAll('.cldr[title]').forEach(el => el.removeAttribute('title'));
      };
      const foldObserver = new MutationObserver(stripFoldTooltips);
      foldObserver.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] });
      stripFoldTooltips();

      return () => {
        if (diagnosticsTimer !== undefined) window.clearTimeout(diagnosticsTimer);
        foldObserver.disconnect();
        changeSub.dispose();
        // editor.dispose() disposes the model it created — do NOT dispose it separately.
        editor.dispose();
        editorRef.current = null;
      };
      // Mount-only: theme / fontSize / disabled are pushed in by the effects below.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Pull external changes in (loading a snippet, New/Clear) without clobbering typing.
    useEffect(() => {
      const editor = editorRef.current;
      if (editor && editor.getValue() !== value) {
        editor.setValue(value);
      }
    }, [value]);

    useEffect(() => {
      editorRef.current?.updateOptions({ fontSize });
    }, [fontSize]);

    useEffect(() => {
      editorRef.current?.updateOptions({ readOnly: disabled });
    }, [disabled]);

    useEffect(() => {
      monaco.editor.setTheme(monacoThemeFor(theme));
    }, [theme]);

    return <div ref={containerRef} className="w-full h-full" />;
  }
);

MonacoReplEditor.displayName = 'MonacoReplEditor';
