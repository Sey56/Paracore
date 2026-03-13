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

        if (e.key === 'Tab') {
            e.preventDefault();
            const newValue = value.substring(0, selectionStart) + "    " + value.substring(selectionEnd);
            onChange(newValue);
            setTimeout(() => { textarea.selectionStart = textarea.selectionEnd = selectionStart + 4; }, 0);
            return;
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
                const insertion = "\n" + innerIndentation + "\n" + indentation;
                const newValue = value.substring(0, selectionStart) + insertion + value.substring(selectionEnd);
                onChange(newValue);
                setTimeout(() => { textarea.selectionStart = textarea.selectionEnd = selectionStart + innerIndentation.length + 1; }, 0);
                return;
            }

            if (lastChar === '{') extraIndentation = "    ";
            const insertion = "\n" + indentation + extraIndentation;
            const newValue = value.substring(0, selectionStart) + insertion + value.substring(selectionEnd);
            onChange(newValue);
            setTimeout(() => { textarea.selectionStart = textarea.selectionEnd = selectionStart + insertion.length; }, 0);
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
        <div className="relative w-full h-[300px] bg-slate-50/30 dark:bg-slate-900/30 border-t border-b border-slate-200 dark:border-slate-800 overflow-hidden" style={{ borderColor: 'var(--border-divider)' }}>
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
                        scrollbarGutter: 'stable',
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
                        scrollbarGutter: 'stable',
                    }}
                    className="custom-scrollbar focus:ring-0"
                />
            </div>
        </div>
    );
});
REPLCodeEditor.displayName = 'REPLCodeEditor';
