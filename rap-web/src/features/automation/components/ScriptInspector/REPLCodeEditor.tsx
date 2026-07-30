import React, { useCallback } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { csharp } from '@codemirror/legacy-modes/mode/clike';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, keymap, type KeyBinding } from '@codemirror/view';
import { useTheme } from '@/context/ThemeContext';

interface REPLCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onRun?: () => void;
  onSave?: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const csharpLanguage = StreamLanguage.define(csharp);

// Light theme matching Paracore's style
const lightTheme = EditorView.theme({
  '&': {
    backgroundColor: 'var(--bg-panel, #ffffff)',
    color: 'var(--text-main, #0f172a)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-ground, #f8fafc)',
    color: 'var(--text-muted, #64748b)',
    borderRight: '1px solid var(--border-main, #e2e8f0)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--bg-card, #f1f5f9)',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--bg-card, #f1f5f9)',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--accent, #3b82f6)',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  '.cm-matchingBracket': {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    outline: '1px solid rgba(59, 130, 246, 0.3)',
  },
});

export const REPLCodeEditor = React.forwardRef<HTMLTextAreaElement, REPLCodeEditorProps>(({
  value,
  onChange,
  onKeyDown: _onKeyDown,
  onRun,
  onSave,
  disabled = false,
  placeholder = "Write your code here...",
}, _ref) => {
  const { theme } = useTheme();
  const isDark = theme !== 'light';

  const handleChange = useCallback(
    (val: string) => {
      onChange(val);
    },
    [onChange],
  );

  // Ctrl+Enter to run, Ctrl+S to save
  const runKeymap: readonly KeyBinding[] = [
    ...(onRun ? [
      { key: 'Ctrl-Enter', run: () => { onRun(); return true; } },
      { key: 'Cmd-Enter', run: () => { onRun(); return true; } },
    ] : []),
    ...(onSave ? [
      { key: 'Ctrl-s', run: () => { onSave(); return true; }, preventDefault: true },
      { key: 'Cmd-s', run: () => { onSave(); return true; }, preventDefault: true },
    ] : []),
  ];

  const extensions = [
    csharpLanguage,
    EditorView.lineWrapping,
    keymap.of(runKeymap),
    ...(isDark ? [oneDark] : [lightTheme]),
  ];

  return (
    <div className="h-full w-full overflow-hidden">
      <CodeMirror
        value={value}
        onChange={handleChange}
        extensions={extensions}
        theme={isDark ? 'dark' : 'light'}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: true,
          foldGutter: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: false,
          indentOnInput: true,
          tabSize: 4,
          crosshairCursor: false,
          rectangularSelection: false,
        }}
        placeholder={placeholder}
        editable={!disabled}
        style={{
          height: '100%',
          overflow: 'auto',
        }}
        className="custom-scrollbar"
      />
    </div>
  );
});
REPLCodeEditor.displayName = 'REPLCodeEditor';
