import React, { useState, useEffect } from 'react';
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
  const [sourceCode, setSourceCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const syntaxHighlighterStyle = theme === 'dark' ? vscDarkPlus : vs;

  useEffect(() => {
    // If combinedScriptContent is available, use it directly
    if (combinedScriptContent !== null) {
      setSourceCode(combinedScriptContent);
      setIsLoading(false);
      setError(null);
      return; // Exit early, no need to fetch
    }

    // Fallback to fetching single script content if combined is not available
    if (!script.sourcePath) return;

    const fetchSourceCode = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`http://localhost:8000/api/script-content?scriptPath=${encodeURIComponent(script.sourcePath)}&type=${script.type}`);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setSourceCode(data.sourceCode);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSourceCode();
  }, [script.sourcePath, combinedScriptContent, script.type]); // Add combinedScriptContent to dependency array

  if (isLoading) {
    return <div className="text-center py-10">Loading code...</div>;
  }

  if (error) {
    return <div className="text-center py-10 text-red-500">Error: {error}</div>;
  }

  if (!sourceCode) {
    return <div className="text-center py-10">No source code available.</div>;
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
        {sourceCode}
      </SyntaxHighlighter>
    </div>
  );
};
