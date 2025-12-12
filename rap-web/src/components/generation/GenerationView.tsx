import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlay, faEdit, faSave, faSpinner, faCode } from '@fortawesome/free-solid-svg-icons';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus, vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import api from '@/api/axios';
import { SaveToLibraryModal } from './SaveToLibraryModal';

export const GenerationView: React.FC = () => {
    const { theme } = useTheme();
    const { cloudToken } = useAuth();
    const { showNotification } = useNotifications();
    const { rserverConnected } = useRevitStatus();

    const [taskDescription, setTaskDescription] = useState('');
    const [generatedCode, setGeneratedCode] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const [executionOutput, setExecutionOutput] = useState('');
    const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
    const [isEditingInVSCode, setIsEditingInVSCode] = useState(false);
    const [retryHistory, setRetryHistory] = useState<Array<{ code: string, error: string }>>([]);
    const [useWebSearch, setUseWebSearch] = useState(false);

    const syntaxHighlighterStyle = theme === 'dark' ? vscDarkPlus : vs;

    // Load state from localStorage on mount
    React.useEffect(() => {
        const savedTaskDescription = localStorage.getItem('generation_taskDescription');
        const savedGeneratedCode = localStorage.getItem('generation_generatedCode');
        const savedExecutionOutput = localStorage.getItem('generation_executionOutput');

        if (savedTaskDescription) setTaskDescription(savedTaskDescription);
        if (savedGeneratedCode) setGeneratedCode(savedGeneratedCode);
        if (savedExecutionOutput) setExecutionOutput(savedExecutionOutput);
    }, []);

    // Save state to localStorage whenever it changes
    React.useEffect(() => {
        localStorage.setItem('generation_taskDescription', taskDescription);
    }, [taskDescription]);

    React.useEffect(() => {
        localStorage.setItem('generation_generatedCode', generatedCode);
    }, [generatedCode]);

    React.useEffect(() => {
        localStorage.setItem('generation_executionOutput', executionOutput);
    }, [executionOutput]);

    // Auto-reload generated code from temp file (ONLY when actively editing in VSCode)
    React.useEffect(() => {
        if (!isEditingInVSCode) return;

        const fetchUpdatedCode = async (silent = false) => {
            // Always get the latest path from storage (it changes from source -> workspace)
            const currentPath = localStorage.getItem('generation_tempFilePath');
            if (!currentPath) return;

            try {
                const timestamp = new Date().getTime();
                const response = await api.get(`/api/script-content?scriptPath=${encodeURIComponent(currentPath)}&type=single-file&_t=${timestamp}`);

                const updatedCode = response.data.sourceCode;

                // Safety check: ignore if code looks corrupted (contains null bytes)
                if (updatedCode && updatedCode.includes('\0')) {
                    console.warn('Auto-reload ignored: Detected possible file corruption/binary content');
                    return;
                }

                if (updatedCode && updatedCode !== generatedCode) {
                    setGeneratedCode(updatedCode);
                    if (!silent) {
                        showNotification('Code updated from VSCode', 'info');
                    }
                }
            } catch (error) {
                // Silently fail - file might not exist yet or be temporarily locked
                console.debug('Auto-reload check:', error);
            }
        };

        // Poll every 2 seconds
        const intervalId = setInterval(() => {
            fetchUpdatedCode(true);
        }, 2000);

        // Also reload on window focus
        const handleFocus = () => {
            fetchUpdatedCode(true);
        };
        window.addEventListener('focus', handleFocus);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('focus', handleFocus);
        };
    }, [isEditingInVSCode, generatedCode, showNotification]);

    const handleGenerate = async () => {
        if (!taskDescription.trim()) {
            showNotification('Please enter a task description', 'error');
            return;
        }

        setIsGenerating(true);
        setGeneratedCode('');
        setExecutionOutput('');
        setIsEditingInVSCode(false); // Disable auto-reload for new generation
        setRetryHistory([]); // Clear retry history for new task

        try {
            const llmProvider = localStorage.getItem('llmProvider');
            const llmModel = localStorage.getItem('llmModel');
            const llmApiKeyName = localStorage.getItem('llmApiKeyName');
            const llmApiKeyValue = localStorage.getItem('llmApiKeyValue');

            const response = await api.post('/generation/generate_script', {
                task_description: taskDescription,
                use_web_search: useWebSearch,
                llm_provider: llmProvider,
                llm_model: llmModel,
                llm_api_key_name: llmApiKeyName,
                llm_api_key_value: llmApiKeyValue,
            });

            setGeneratedCode(response.data.generated_code);
            showNotification('Code generated successfully!', 'success');
        } catch (error: any) {
            console.error('Generation error:', error);
            showNotification(error.response?.data?.detail || 'Failed to generate code', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleRegenerate = async () => {
        setIsGenerating(true);
        const previousCode = generatedCode;
        const errorMessage = executionOutput;

        // Add current failure to retry history
        const updatedHistory = [
            ...retryHistory,
            { code: previousCode, error: errorMessage }
        ];
        setRetryHistory(updatedHistory);

        try {
            const llmProvider = localStorage.getItem('llmProvider');
            const llmModel = localStorage.getItem('llmModel');
            const llmApiKeyName = localStorage.getItem('llmApiKeyName');
            const llmApiKeyValue = localStorage.getItem('llmApiKeyValue');

            const response = await api.post('/generation/generate_script', {
                task_description: taskDescription,
                previous_attempts: updatedHistory,  // Send full history
                use_web_search: useWebSearch,
                llm_provider: llmProvider,
                llm_model: llmModel,
                llm_api_key_name: llmApiKeyName,
                llm_api_key_value: llmApiKeyValue,
            });

            setGeneratedCode(response.data.generated_code);
            setExecutionOutput(''); // Clear error after regeneration
            showNotification('Code regenerated successfully!', 'success');
        } catch (error: any) {
            console.error('Regeneration error:', error);
            showNotification(error.response?.data?.detail || 'Failed to regenerate code', 'error');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleRun = async () => {
        if (!generatedCode) {
            showNotification('No code to execute', 'error');
            return;
        }

        if (!rserverConnected) {
            showNotification('RServer is not connected', 'error');
            return;
        }

        setIsExecuting(true);
        setExecutionOutput('');

        try {
            const response = await api.post('/run-script', {
                path: '__generated__/temp_script.cs',
                parameters: {},
                type: 'generated',
                source_folder: 'Generation',
                generated_code: generatedCode,
            });

            let output = response.data.output || '';

            // Handle Structured Output (e.g. Tables from Show("table", ...))
            // These are returned in a separate list, so we append them as JSON lines
            // for the renderer to detect and display.
            if (response.data.structured_output && Array.isArray(response.data.structured_output)) {
                response.data.structured_output.forEach((item: any) => {
                    try {
                        // item.data is a JSON string (serialized in C#)
                        // We parse it first to ensure we re-serialize a clean object
                        const parsedData = typeof item.data === 'string' ? JSON.parse(item.data) : item.data;
                        const jsonLine = JSON.stringify({ type: item.type, data: parsedData });
                        output += `\n${jsonLine}\n`;
                    } catch (e) {
                        console.warn('Failed to parse structured output:', item);
                    }
                });
            }

            const error = response.data.error_message || '';
            setExecutionOutput(output + (error ? `\n\nERROR:\n${error}` : ''));
        } finally {
            setIsExecuting(false);
        }
    };

    const handleEditInVSCode = async () => {
        if (!generatedCode) {
            showNotification('No code to edit', 'error');
            return;
        }

        try {
            // Generate a unique filename to bypass VSCode file locking on Windows
            // Use simple 2-digit random number (00-99) for cleaner display
            const randomId = Math.floor(Math.random() * 100).toString().padStart(2, '0');
            const uniqueFilename = `generated_script_${randomId}.cs`;

            // First, save the generated code to a temp file
            const saveResponse = await api.post('/generation/save_temp_script', {
                script_code: generatedCode,
                filename: uniqueFilename
            });

            const tempScriptPath = saveResponse.data.path;

            // Store the temp file path for auto-reload
            localStorage.setItem('generation_tempFilePath', tempScriptPath);

            // Enable auto-reload
            setIsEditingInVSCode(true);

            // Then, call the existing edit-script endpoint
            const editResponse = await api.post('/api/edit-script', {
                scriptPath: tempScriptPath,
                type: 'single-file',
            }, {
                headers: {
                    'Authorization': `Bearer ${cloudToken}`,
                },
            });

            // CRITICAL: Update the auto-reload path to point to the WORKSPACE file
            // VSCode edits the file inside the workspace, not the source file
            const workspacePath = editResponse.data.workspace_path;
            if (workspacePath) {
                // Construct path: workspace/Scripts/filename.cs
                // Handle both slash types just in case, but usually backslashes on Windows
                const separator = workspacePath.includes('/') ? '/' : '\\';
                const workspaceScriptPath = `${workspacePath}${separator}Scripts${separator}${uniqueFilename}`;
                localStorage.setItem('generation_tempFilePath', workspaceScriptPath);
                console.log('Auto-reload synced to workspace file:', workspaceScriptPath);
            }

            showNotification('Opening in VSCode...', 'success');
        } catch (error: any) {
            console.error('VSCode open error:', error);
            showNotification(error.response?.data?.detail || 'Failed to open in VSCode', 'error');
        }
    };

    const handleSaveToLibrary = () => {
        if (!generatedCode) {
            showNotification('No code to save', 'error');
            return;
        }
        setIsSaveModalOpen(true);
    };

    const handleSaveSuccess = () => {
        showNotification('Script saved to library successfully!', 'success');
    };

    return (
        <div className="w-full h-full flex bg-gray-50 dark:bg-gray-900 overflow-hidden">
            {/* Left Panel: Input & Output - 1/3 width */}
            <div className="w-1/3 min-w-[350px] flex flex-col p-6 border-r border-gray-300 dark:border-gray-700">
                <div className="mb-4 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center">
                            <FontAwesomeIcon icon={faCode} className="mr-3" />
                            AI Script Generation
                        </h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            Describe your task in natural language
                        </p>
                    </div>

                    {/* Web Search Toggle */}
                    <div className="flex items-center space-x-2">
                        <label className="text-xs text-gray-600 dark:text-gray-400">
                            Web Search
                        </label>
                        <button
                            onClick={() => setUseWebSearch(!useWebSearch)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${useWebSearch ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                                }`}
                            title={useWebSearch ? 'Web search enabled - LLM can search for Revit API docs' : 'Web search disabled - uses base knowledge only'}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useWebSearch ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                            />
                        </button>
                    </div>
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Task Description
                    </label>
                    <textarea
                        value={taskDescription}
                        onChange={(e) => setTaskDescription(e.target.value)}
                        placeholder="e.g., Create a 10 by 20 meters rectangular house at Level 1 centered at the origin"
                        className="w-full h-40 p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-blue-500 text-sm"
                        disabled={isGenerating}
                    />
                    <button
                        onClick={handleGenerate}
                        disabled={isGenerating || !taskDescription.trim()}
                        className="mt-3 w-full bg-blue-600 text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                        {isGenerating ? (
                            <>
                                <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
                                Generating...
                            </>
                        ) : (
                            <>
                                <FontAwesomeIcon icon={faCode} className="mr-2" />
                                Generate Script
                            </>
                        )}
                    </button>
                </div>

                {/* Execution Output - Scrollable */}
                <div className="flex-1 flex flex-col min-h-0">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Execution Output
                    </h3>
                    <div className="flex-1 p-0 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700 overflow-hidden flex flex-col">
                        {(() => {
                            if (!executionOutput) {
                                return (
                                    <div className="p-3">
                                        <p className="text-xs text-gray-500 italic">
                                            No output yet. Click "Run Code" to execute the generated script.
                                        </p>
                                    </div>
                                );
                            }

                            // Try to parse JSON table
                            // Only if a line starts with explicit JSON structure for 'table'
                            try {
                                const lines = executionOutput.split('\n');
                                for (const line of lines) {
                                    const trimmed = line.trim();
                                    // Look for specific signature: {"type": ... "data": ...}
                                    if (trimmed.startsWith('{') && trimmed.includes('"type"') && trimmed.includes('"data"')) {
                                        const json = JSON.parse(trimmed);
                                        // Prioritize Table View
                                        if (json.type === 'table' && Array.isArray(json.data) && json.data.length > 0) {
                                            const headers = Object.keys(json.data[0]);
                                            return (
                                                <div className="flex-1 overflow-auto bg-white dark:bg-gray-900">
                                                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border-collapse">
                                                        <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10 shadow-sm">
                                                            <tr>
                                                                {headers.map(h => (
                                                                    <th key={h} className="px-4 py-2 text-left text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700">
                                                                        {h}
                                                                    </th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800">
                                                            {json.data.map((row: any, i: number) => (
                                                                <tr key={i} className="hover:bg-blue-50 dark:hover:bg-gray-800 transition-colors">
                                                                    {headers.map(h => (
                                                                        <td key={h} className="px-4 py-2 whitespace-nowrap text-xs text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-gray-800">
                                                                            {row[h] !== null ? String(row[h]) : '-'}
                                                                        </td>
                                                                    ))}
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            );
                                        }
                                        // Handle 'message' type or others if needed in future
                                        if (json.type === 'message') {
                                            return (
                                                <div className="p-3">
                                                    <pre className="text-xs text-gray-800 dark:text-green-400 font-mono whitespace-pre-wrap">
                                                        {json.data}
                                                    </pre>
                                                </div>
                                            );
                                        }
                                    }
                                }
                            } catch (e) {
                                // Fallback to raw output if parse fails
                            }

                            // Default: Raw Output
                            return (
                                <div className="p-3 overflow-auto h-full">
                                    <pre className="text-xs text-gray-800 dark:text-green-400 font-mono whitespace-pre-wrap">
                                        {executionOutput}
                                    </pre>
                                </div>
                            );
                        })()}
                    </div>

                    {/* Regenerate button - only show if there's an error in execution output */}
                    {executionOutput && executionOutput.includes('ERROR') && (
                        <button
                            onClick={handleRegenerate}
                            disabled={isGenerating}
                            className="mt-3 w-full bg-orange-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                        >
                            {isGenerating ? (
                                <>
                                    <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
                                    Regenerating...
                                </>
                            ) : (
                                <>
                                    <FontAwesomeIcon icon={faCode} className="mr-2" />
                                    Regenerate
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>

            {/* Right Panel: Code & Actions - Takes remaining space */}
            <div className="flex-1 min-w-0 w-0 flex flex-col p-6">
                {generatedCode ? (
                    <>
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-3">
                            Generated Script
                        </h3>
                        {/* Code viewer takes all available space */}
                        <div className="flex-1 overflow-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-600 min-h-0">
                            <SyntaxHighlighter
                                language="csharp"
                                style={syntaxHighlighterStyle}
                                customStyle={{
                                    margin: 0,
                                    borderRadius: '0.5rem',
                                    height: '100%',
                                    fontSize: '0.875rem',
                                }}
                                showLineNumbers
                            >
                                {generatedCode}
                            </SyntaxHighlighter>
                        </div>

                        {/* Buttons at the bottom */}
                        <div className="flex space-x-3 justify-end mt-4">
                            <button
                                onClick={handleEditInVSCode}
                                className="bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 flex items-center"
                            >
                                <FontAwesomeIcon icon={faEdit} className="mr-2" />
                                Edit in VSCode
                            </button>
                            <button
                                onClick={handleRun}
                                disabled={isExecuting || !rserverConnected}
                                className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                            >
                                {isExecuting ? (
                                    <>
                                        <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
                                        Running...
                                    </>
                                ) : (
                                    <>
                                        <FontAwesomeIcon icon={faPlay} className="mr-2" />
                                        Run Script
                                    </>
                                )}
                            </button>
                            <button
                                onClick={handleSaveToLibrary}
                                className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 flex items-center"
                            >
                                <FontAwesomeIcon icon={faSave} className="mr-2" />
                                Save to Library
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center text-gray-400">
                            <FontAwesomeIcon icon={faCode} className="text-6xl mb-4 opacity-50" />
                            <p className="text-lg">Enter a task description and click Generate</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Save to Library Modal */}
            <SaveToLibraryModal
                isOpen={isSaveModalOpen}
                onClose={() => setIsSaveModalOpen(false)}
                generatedCode={generatedCode}
                taskDescription={taskDescription}
                onSaveSuccess={handleSaveSuccess}
            />
        </div>
    );
};
