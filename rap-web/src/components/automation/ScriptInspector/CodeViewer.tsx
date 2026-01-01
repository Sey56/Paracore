import React, { useState, useEffect, useCallback } from 'react';
import { PrismLight as SyntaxHighlighter } from 'react-syntax-highlighter';
import csharp from 'react-syntax-highlighter/dist/esm/languages/prism/csharp';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { Script } from '../../../types/scriptModel';
import { useScripts } from '@/hooks/useScripts';
import { useTheme } from '@/context/ThemeContext';

SyntaxHighlighter.registerLanguage('csharp', csharp);

interface CodeViewerProps {
  script: Script;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({ script }) => {
  const { theme } = useTheme();
  const { combinedScriptContent } = useScripts(); // Get combinedScriptContent from context
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const syntaxHighlighterStyle = theme === 'dark' ? vscDarkPlus : vs;

  // We no longer need local sourceCode state or local polling/focus logic here.
  // ScriptExecutionProvider now handles the background polling and updates combinedScriptContent.

  useEffect(() => {
    if (combinedScriptContent === null) {
      setIsLoading(true);
    } else {
      setIsLoading(false);
    }
  }, [combinedScriptContent]);

  if (isLoading && !combinedScriptContent) {
    return <div className="text-center py-10">Loading code...</div>;
  }

  if (isLoading) {
    return <div className="text-center py-10">Loading code...</div>;
  }

  if (error) {
    return <div className="text-center py-10 text-red-500">Error: {error}</div>;
  }

  if (!combinedScriptContent) {
    return <div className="text-center py-10 text-gray-400">Loading code content...</div>;
  }

  return (
    <div className="overflow-auto w-full min-w-0 h-full bg-gray-100 dark:bg-gray-900">
      <SyntaxHighlighter
        key={theme}
        language="csharp"
        style={syntaxHighlighterStyle}
        customStyle={{
          backgroundColor: 'transparent',
          wordBreak: 'break-word',
        }}
        showLineNumbers
        wrapLines={true}
      >
        {combinedScriptContent}
      </SyntaxHighlighter>
    </div>
  );
};
