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
  const [sourceCode, setSourceCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const syntaxHighlighterStyle = theme === 'dark' ? vscDarkPlus : vs;

  const fetchSourceCode = useCallback(async (silent = false) => {
    if (!script.sourcePath) return;

    if (!silent) {
      setIsLoading(true);
      setError(null);
    }

    try {
      const timestamp = new Date().getTime();
      const response = await fetch(`http://localhost:8000/api/script-content?scriptPath=${encodeURIComponent(script.sourcePath)}&type=${script.type}&_t=${timestamp}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      // console.log("Fetched script content:", data.sourceCode.substring(0, 50) + "..."); 
      setSourceCode(data.sourceCode);
      if (!silent) setError(null);
    } catch (err) {
      console.error("Failed to fetch script content:", err);
      if (!silent) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, [script.sourcePath, script.type]);

  useEffect(() => {
    // If combinedScriptContent is available AND we are not in live update mode, use it directly
    // Ideally we should have a prop for this, but for now, let's assume if we are here, we want live updates if the script is open.
    // Actually, the user wants live updates specifically for the FloatingCodeViewer.
    // Let's check if we can infer it or just always fetch if we are polling.

    // If we are just viewing in the main inspector, we might want the cached content.
    // But for FloatingCodeViewer, we want the file content.

    // For now, let's prioritize the fetch if we have a focus listener or polling set up.
    // But wait, the polling is set up in the SAME useEffect.

    // Let's change the logic:
    // If combinedScriptContent is present, we set it initially.
    // BUT, we still set up the polling/focus listener to OVERWRITE it if the file changes.

    if (combinedScriptContent !== null && !sourceCode) {
      setSourceCode(combinedScriptContent);
      setIsLoading(false);
      setError(null);
    }

    // Always fetch initially if sourceCode is null (and combined didn't fill it), OR if we want to ensure freshness.
    // Actually, if combinedScriptContent is set, we might show it first, then fetch.

    if (!sourceCode && combinedScriptContent === null) {
      fetchSourceCode();
    }

    // Set up polling and focus listener
    const handleFocus = () => {
      fetchSourceCode(true);
    };

    window.addEventListener('focus', handleFocus);
    const intervalId = setInterval(() => {
      fetchSourceCode(true);
    }, 1000); // Poll every 1 second (Responsiveness restored)

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(intervalId);
    };
  }, [fetchSourceCode, combinedScriptContent, sourceCode]);

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
