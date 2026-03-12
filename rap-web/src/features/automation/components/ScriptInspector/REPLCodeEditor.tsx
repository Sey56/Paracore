import React, { useRef, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '@/context/ThemeContext';

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
    const { theme } = useTheme();
    const syntaxStyle = theme === 'light' ? vs : vscDarkPlus;

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

    // Base font styles that MUST be identical across both layers
    const fontStyles: React.CSSProperties = {
        fontFamily: '"Consolas", "Monaco", monospace',
        fontSize: '13px',
        lineHeight: '20px',
        letterSpacing: 'normal',
        tabSize: 4,
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'optimizeSpeed', // Disable kerning for absolute stability
    };

    return (
        <div className="relative w-full h-[300px] bg-white/50 dark:bg-slate-900/50 border-t border-b border-slate-200 dark:border-slate-800 group overflow-hidden" style={{ borderColor: 'var(--border-divider)' }}>
            {/* 
                GRID CONTAINER: This is the secret. 
                By using a grid, both children occupy the EXACT same space.
            */}
            <div className="grid w-full h-full" style={{ padding: 0 }}>
                {/* Underlying Syntax Highlighter Layer */}
                <div
                    ref={highlighterRef}
                    className="col-start-1 row-start-1 pointer-events-none select-none overflow-hidden"
                    style={{
                        ...fontStyles,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        scrollbarGutter: 'stable',
                        padding: '12px',
                    }}
                >
                    <SyntaxHighlighter
                        language="csharp"
                        style={syntaxStyle}
                        PreTag="div"
                        customStyle={{
                            margin: 0,
                            padding: 0,
                            background: 'transparent',
                            fontSize: 'inherit',
                            fontFamily: 'inherit',
                            lineHeight: 'inherit',
                            width: '100%',
                            height: '100%',
                            overflow: 'visible',
                            letterSpacing: 'inherit',
                            border: 'none',
                            boxShadow: 'none'
                        }}
                        codeTagProps={{ 
                            style: { 
                                whiteSpace: 'pre-wrap', 
                                wordBreak: 'break-all',
                                fontFamily: 'inherit',
                                lineHeight: 'inherit'
                            } 
                        }}
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
                        ...fontStyles,
                        gridArea: '1/1',
                        color: 'transparent',
                        caretColor: '#60a5fa',
                        background: 'transparent',
                        resize: 'none',
                        border: 'none',
                        outline: 'none',
                        padding: '12px',
                        margin: 0,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        zIndex: 10,
                        overflowX: 'hidden',
                        overflowY: 'auto',
                        scrollbarGutter: 'stable',
                    }}
                    className="custom-scrollbar focus:ring-0"
                />
            </div>
        </div>
    );
});
REPLCodeEditor.displayName = 'REPLCodeEditor';
