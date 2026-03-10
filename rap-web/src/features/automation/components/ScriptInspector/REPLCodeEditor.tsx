import React, { useRef, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface REPLCodeEditorProps {
    value: string;
    onChange: (value: string) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    disabled?: boolean;
    placeholder?: string;
    className?: string;
}

export const REPLCodeEditor = React.forwardRef<HTMLTextAreaElement, REPLCodeEditorProps>(({
    value,
    onChange,
    onKeyDown,
    disabled = false,
    placeholder = "Write your code here...",
}, ref) => {
    const highlighterRef = useRef<HTMLDivElement>(null);

    // Sync scrolling between textarea and highlighter
    const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
        if (highlighterRef.current) {
            highlighterRef.current.scrollTop = e.currentTarget.scrollTop;
            highlighterRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }
    };

    const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const textarea = e.currentTarget;
        const { selectionStart, selectionEnd } = textarea;

        // 1. Tab Support (4 spaces)
        if (e.key === 'Tab') {
            e.preventDefault();
            const newValue = value.substring(0, selectionStart) + "    " + value.substring(selectionEnd);
            onChange(newValue);

            // Reset cursor position after React re-render
            setTimeout(() => {
                textarea.selectionStart = textarea.selectionEnd = selectionStart + 4;
            }, 0);
            return;
        }

        // 2. Smart Indentation on Enter
        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();

            // Get the current line's text and its indentation
            const beforeCursor = value.substring(0, selectionStart);
            const afterCursor = value.substring(selectionEnd);
            const lines = beforeCursor.split('\n');
            const currentLine = lines[lines.length - 1];
            const match = currentLine.match(/^\s*/);
            const indentation = match ? match[0] : "";

            let extraIndentation = "";
            const lastChar = beforeCursor.trim().slice(-1);
            const nextChar = afterCursor.trim().slice(0, 1);

            // Special case: Enter between { and }
            if (lastChar === '{' && nextChar === '}') {
                const innerIndentation = indentation + "    ";
                const insertion = "\n" + innerIndentation + "\n" + indentation;
                const newValue = value.substring(0, selectionStart) + insertion + value.substring(selectionEnd);
                onChange(newValue);

                setTimeout(() => {
                    textarea.selectionStart = textarea.selectionEnd = selectionStart + innerIndentation.length + 1;
                }, 0);
                return;
            }

            // Regular case: Enter after {
            if (lastChar === '{') {
                extraIndentation = "    ";
            }

            const insertion = "\n" + indentation + extraIndentation;
            const newValue = value.substring(0, selectionStart) + insertion + value.substring(selectionEnd);
            onChange(newValue);

            setTimeout(() => {
                textarea.selectionStart = textarea.selectionEnd = selectionStart + insertion.length;
            }, 0);
            return;
        }

        // Passthrough for Ctrl+Enter (Execution) and others
        onKeyDown(e);
    };

    // Ensure textarea dimensions match highlighter (simplified approach for this project)
    const sharedStyles: React.CSSProperties = {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: '13px',
        lineHeight: '1.5',
        padding: '12px 16px',
        margin: 0,
        border: '1px solid transparent',
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        tabSize: 4,
    };

    return (
        <div className="relative w-full h-[300px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-inner group">
            {/* Underlying Syntax Highlighter Layer */}
            <div
                ref={highlighterRef}
                className="absolute inset-0 pointer-events-none select-none scrollbar-hide overflow-hidden"
                style={sharedStyles}
            >
                <SyntaxHighlighter
                    language="csharp"
                    style={vscDarkPlus}
                    customStyle={{
                        margin: 0,
                        padding: 0,
                        background: 'transparent',
                        fontSize: 'inherit',
                        fontFamily: 'inherit',
                        lineHeight: 'inherit',
                        width: '100%',
                        height: '100%',
                        overflow: 'visible'
                    }}
                    codeTagProps={{ style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all' } }}
                >
                    {/* Add a zero-width space to handled empty last line for scroll alignment */}
                    {value + (value.endsWith('\n') ? ' ' : '')}
                </SyntaxHighlighter>
            </div>

            {/* Transparent Textarea Layer */}
            <textarea
                ref={ref}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
                onScroll={handleScroll}
                disabled={disabled}
                placeholder={placeholder}
                spellCheck="false"
                autoCorrect="off"
                autoCapitalize="off"
                style={{
                    ...sharedStyles,
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    color: 'transparent',
                    caretColor: '#60a5fa', // Bright blue caret for visibility
                    background: 'transparent',
                    resize: 'none',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    zIndex: 10,
                    outline: 'none',
                }}
                className="custom-scrollbar focus:ring-2 focus:ring-blue-500/30 transition-shadow"
            />
        </div>
    );
});
REPLCodeEditor.displayName = 'REPLCodeEditor';
