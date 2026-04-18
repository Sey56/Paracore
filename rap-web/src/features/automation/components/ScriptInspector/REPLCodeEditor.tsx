import React, { useRef, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs, atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
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
    const syntaxStyle = theme === 'eclipse' ? atomDark : (theme === 'midnight' || theme === 'dark' ? vscDarkPlus : vs);

    // Sync scrolling
    const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
        if (highlighterRef.current) {
            highlighterRef.current.scrollTop = e.currentTarget.scrollTop;
            highlighterRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }
    };

    const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        const textarea = e.currentTarget;
        const { selectionStart, selectionEnd } = textarea;

        // Explicitly allow Undo/Redo to pass through to native handler
        if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'y' || (e.key === 'Z' && e.shiftKey))) {
            return;
        }

        if (e.key === 'Tab') {
            e.preventDefault();
            // Use execCommand to preserve undo stack
            document.execCommand('insertText', false, "    ");
            return;
        }

        // Bracket & Quote Auto-Closing Logic
        const pairs: Record<string, string> = {
            '{': '}',
            '[': ']',
            '(': ')',
            '"': '"',
            "'": "'",
            "`": "`",
            "<": ">"
        };

        // 1. Delete empty pairs with Backspace (e.g., cursor inside {} -> press Backspace -> deletes both)
        if (e.key === 'Backspace' && selectionStart === selectionEnd && selectionStart > 0) {
            const prevChar = value.slice(selectionStart - 1, selectionStart);
            const nextChar = value.slice(selectionStart, selectionStart + 1);
            if (pairs[prevChar] === nextChar) {
                e.preventDefault();
                textarea.selectionStart = selectionStart - 1;
                textarea.selectionEnd = selectionStart + 1;
                document.execCommand('delete', false);
                return;
            }
        }

        // 2. Auto-skip closing character if it is already right in front of the cursor
        if (['}', ']', ')', '"', "'", "`", ">"].includes(e.key) && selectionStart === selectionEnd) {
            const nextChar = value.slice(selectionStart, selectionStart + 1);
            if (nextChar === e.key) {
                e.preventDefault();
                textarea.selectionStart = textarea.selectionEnd = selectionStart + 1;
                return;
            }
        }

        // 3. Auto-close brackets or surround selected text
        if (e.key in pairs) {
            const char = e.key;
            const wrapChar = pairs[char];

            // Special explicit logic for '<' to not ruin standard less-than math comparisons
            if (char === '<') {
                if (selectionStart === selectionEnd) {
                    const beforeCursor = value.slice(0, selectionStart);
                    // Only auto-close for explicit generic methods requested by the user
                    if (!beforeCursor.match(/(GetElements|OfType|Cast)$/)) {
                        return; // Let the browser just type '<' normally
                    }
                }
            }

            if (selectionStart !== selectionEnd) {
                e.preventDefault();
                const selectedText = value.slice(selectionStart, selectionEnd);
                document.execCommand('insertText', false, char + selectedText + wrapChar);
                textarea.selectionStart = selectionStart + 1;
                textarea.selectionEnd = selectionStart + selectedText.length + 1;
                return;
            }

            const nextChar = value.slice(selectionStart, selectionStart + 1);
            const shouldAutoClose = !nextChar || /[\s\}\]\)]/.test(nextChar);

            if (shouldAutoClose) {
                e.preventDefault();
                document.execCommand('insertText', false, char + wrapChar);
                textarea.selectionStart = textarea.selectionEnd = selectionStart + 1;
                return;
            }
        }

        if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            const beforeCursor = value.substring(0, selectionStart);
            const afterCursor = value.substring(selectionEnd);
            const lines = beforeCursor.split('\n');
            const currentLine = lines[lines.length - 1];
            const match = currentLine.match(/^\s*/);
            const indentation = match ? match[0] : "";

            let extraIndentation = "";
            const lastChar = beforeCursor.trim().slice(-1);
            const nextChar = afterCursor.trim().slice(0, 1);

            if (lastChar === '{' && nextChar === '}') {
                const innerIndentation = indentation + "    ";
                // For the special { | } case, we insert the first newline and indentation,
                // then manually handle the second one to keep the cursor in the middle
                document.execCommand('insertText', false, "\n" + innerIndentation + "\n" + indentation);
                
                // Adjust cursor to be on the middle line
                const newPos = selectionStart + innerIndentation.length + 1;
                textarea.selectionStart = textarea.selectionEnd = newPos;
                return;
            }

            if (lastChar === '{') extraIndentation = "    ";
            const insertion = "\n" + indentation + extraIndentation;
            document.execCommand('insertText', false, insertion);
            return;
        }
        
        onKeyDown(e);
    };

    const fontStyles: React.CSSProperties = {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        fontSize: '13px',
        lineHeight: '20px',
        letterSpacing: 'normal',
        tabSize: 4,
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'optimizeSpeed',
    };

    return (
        <div className="relative w-full h-full bg-transparent overflow-hidden">
            <div className="grid w-full h-full p-0">
                <div
                    ref={highlighterRef}
                    className="col-start-1 row-start-1 pointer-events-none select-none overflow-hidden"
                    style={{
                        ...fontStyles,
                        padding: '12px 16px',
                        boxSizing: 'border-box',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        width: '100%',
                    }}
                >
                    <SyntaxHighlighter
                        key={theme}
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
                            overflow: 'visible',
                            border: 'none',
                            boxShadow: 'none'
                        }}
                        codeTagProps={{ style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontFamily: 'inherit', lineHeight: 'inherit' } }}
                    >
                        {value + (value.endsWith('\n') ? ' ' : '')}
                    </SyntaxHighlighter>
                </div>

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
                        caretColor: theme === 'light' ? '#2563eb' : '#60a5fa',
                        background: 'transparent',
                        resize: 'none',
                        border: 'none',
                        outline: 'none',
                        padding: '12px 16px',
                        margin: 0,
                        boxSizing: 'border-box',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                        zIndex: 10,
                        overflowX: 'hidden',
                        overflowY: 'auto',
                        width: '100%',
                    }}
                    className="custom-scrollbar focus:ring-0"
                />
            </div>
        </div>
    );
});
REPLCodeEditor.displayName = 'REPLCodeEditor';
