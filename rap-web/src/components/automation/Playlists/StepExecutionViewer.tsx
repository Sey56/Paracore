import React from 'react';
import { ExecutionResult } from '@/types/common';
import { StructuredOutput, StructuredOutputViewer } from '../ScriptInspector/StructuredOutputViewer';

interface StepExecutionViewerProps {
    result: ExecutionResult;
    stepNumber?: number;
    scriptName?: string;
}

export const StepExecutionViewer: React.FC<StepExecutionViewerProps> = ({ result, stepNumber, scriptName }) => {
    const rawOutput = result.output || "";
    const lines = rawOutput.split('\n');
    // Initialize with the explicit structured output from the backend
    const structuredItems: StructuredOutput[] = result.structuredOutput ? [...result.structuredOutput] : [];
    const logLines: string[] = [];

    lines.forEach(line => {
        let foundStructured = false;
        const startIdx = line.indexOf('{');
        const endIdx = line.lastIndexOf('}');

        if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
            try {
                // Try to extract JSON from the line (handles prefixes/suffixes)
                const potentialJson = line.substring(startIdx, endIdx + 1);
                const parsed = JSON.parse(potentialJson);
                if (parsed && typeof parsed === 'object' && parsed.type && parsed.data) {
                    structuredItems.push(parsed);
                    foundStructured = true;
                }
            } catch {
                // Not valid JSON, or not our schema
            }
        }

        // Always add to logLines? Or only if NOT structured?
        // User probably expects the raw log line to disappear if it's converted to a chart.
        if (!foundStructured) {
            logLines.push(line);
        }
    });

    return (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-200 dark:border-gray-800 p-4 mb-4 last:mb-0">
            {/* Header (Optional) */}
            {(stepNumber !== undefined || scriptName) && (
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center space-x-2">
                        {stepNumber !== undefined && (
                            <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">
                                Step {stepNumber}
                            </span>
                        )}
                        {scriptName && (
                            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">{scriptName}</h3>
                        )}
                    </div>
                    <span className={`text-xs font-mono px-2 py-0.5 rounded ${result.isSuccess
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
                        {result.isSuccess ? 'SUCCESS' : 'FAILED'}
                    </span>
                </div>
            )}

            <div className="space-y-6">
                {/* 1. Render Charts/Tables/Messages */}
                {structuredItems.length > 0 && (
                    <div className="space-y-4">
                        {structuredItems.map((item, idx) => (
                            <div key={idx} className="border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden">
                                <StructuredOutputViewer item={item} />
                            </div>
                        ))}
                    </div>
                )}

                {/* 2. Render Console Logs */}
                {(logLines.length > 0 || structuredItems.length === 0) && (
                    <div>
                        {(structuredItems.length > 0) && (
                            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Console Output</h4>
                        )}
                        <div className="bg-gray-50 dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                            <pre className="font-mono text-xs whitespace-pre-wrap text-gray-600 dark:text-gray-300">
                                {logLines.join('\n') || "No console output."}
                            </pre>
                        </div>
                    </div>
                )}

                {result.error && (
                    <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30 rounded text-xs text-red-600 dark:text-red-400 font-mono whitespace-pre-wrap">
                        {typeof result.error === 'string' ? result.error : JSON.stringify(result.error, null, 2)}
                    </div>
                )}
            </div>
        </div>
    );
};
