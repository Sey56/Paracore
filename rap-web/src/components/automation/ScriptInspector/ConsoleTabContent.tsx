import React, { useRef, useEffect } from 'react';
import type { ScriptExecutionResult } from "@/types/scriptModel";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCopy, faTrash } from '@fortawesome/free-solid-svg-icons';

interface ConsoleTabContentProps {
  isRunning: boolean;
  executionResult: ScriptExecutionResult | null;
  scriptName: string;
  clearExecutionResult: () => void;
}

export const ConsoleTabContent: React.FC<ConsoleTabContentProps> = ({
  isRunning,
  executionResult,
  scriptName,
  clearExecutionResult,
}) => {
  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [executionResult]);

  const handleCopy = () => {
    let contentToCopy = "";
    if (executionResult?.output) {
      contentToCopy += String(executionResult.output).split('\n').map(line => line.trim()).join('\n');
    }
    if (executionResult?.error) {
      if (contentToCopy) {
        contentToCopy += "\n";
      }
      contentToCopy += String(executionResult.error).trim();
    }

    if (!contentToCopy && isRunning) {
      contentToCopy = "Executing script...";
    }

    if (!contentToCopy && !isRunning && !executionResult) {
      contentToCopy = `Ready to execute script: ${scriptName}`;
    }

    if (contentToCopy) {
      navigator.clipboard.writeText(contentToCopy)
        .then(() => console.log("Console content copied to clipboard"))
        .catch(err => console.error("Failed to copy console content: ", err));
    }
  };

  return (
    <div className="tab-content py-4 flex flex-col h-full">
      <pre className="font-mono text-sm flex-grow overflow-y-auto whitespace-pre-wrap text-left indent-0 text-gray-800 dark:text-gray-200">
        {isRunning && <code className="p-0 m-0">Executing script...</code>}
        {executionResult?.output && (
          <code className="p-0 m-0">{String(executionResult.output).split('\n').map(line => line.trim()).join('\n')}</code>
        )}
        {executionResult?.error && (
          <code className="text-red-600 dark:text-red-400 p-0 m-0 indent-0 pl-0">{String(executionResult.error).trim()}</code>
        )}
        {!isRunning && !executionResult && (
          <code className="p-0 m-0">
            Ready to execute script: {scriptName}
          </code>
        )}
        <div ref={consoleEndRef} />
      </pre>
      {/* Footer Buttons for Console Tab */}
      <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <button
          title="Clear Console"
          className="bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 py-2 px-4 rounded-lg font-medium flex items-center"
          onClick={clearExecutionResult}
        >
          <FontAwesomeIcon icon={faTrash} className="mr-2" />
          Clear
        </button>
        <button
          title="Copy to Clipboard"
          className="bg-gray-200 hover:bg-gray-300 text-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 py-2 px-4 rounded-lg font-medium flex items-center"
          onClick={handleCopy}
        >
          <FontAwesomeIcon icon={faCopy} className="mr-2" />
          Copy
        </button>
      </div>
    </div>
  );
};
