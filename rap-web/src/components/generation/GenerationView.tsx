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

    const handleGenerate = async () => {
        if (!taskDescription.trim()) {
            showNotification('Please enter a task description', 'error');
            return;
        }

        setIsGenerating(true);
        setGeneratedCode('');
        setExecutionOutput('');

        try {
            const llmProvider = localStorage.getItem('llmProvider');
            const llmModel = localStorage.getItem('llmModel');
            const llmApiKeyName = localStorage.getItem('llmApiKeyName');
            const llmApiKeyValue = localStorage.getItem('llmApiKeyValue');

            const response = await api.post('/generation/generate_script', {
                task_description: taskDescription,
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

        try {
            const llmProvider = localStorage.getItem('llmProvider');
            const llmModel = localStorage.getItem('llmModel');
            const llmApiKeyName = localStorage.getItem('llmApiKeyName');
            const llmApiKeyValue = localStorage.getItem('llmApiKeyValue');

            const response = await api.post('/generation/generate_script', {
                task_description: taskDescription,
                failed_code: previousCode,
                error_message: errorMessage,
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

            const output = response.data.output || '';
            const error = response.data.error_message || '';
            setExecutionOutput(output + (error ? `\n\nERROR:\n${error}` : ''));

            if (response.data.is_success) {
                showNotification('Script executed successfully!', 'success');
            } else {
                showNotification('Script execution failed', 'error');
            }
        } catch (error: any) {
            console.error('Execution error:', error);
            showNotification(error.response?.data?.detail || 'Failed to execute script', 'error');
            setExecutionOutput(`ERROR: ${error.message}`);
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
            // First, save the generated code to a temp file
            const saveResponse = await api.post('/generation/save_temp_script', {
                script_code: generatedCode,
            });

            const tempScriptPath = saveResponse.data.path;

            // Then, call the existing edit-script endpoint
            await api.post('/api/edit-script', {
                scriptPath: tempScriptPath,
                type: 'single-file',
            }, {
                headers: {
                    'Authorization': `Bearer ${cloudToken}`,
                },
            });

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
        <div className="h-full flex bg-gray-50 dark:bg-gray-900">
            {/* Left Panel: Input & Output - 440px width */}
            <div className="w-[440px] flex flex-col p-6 border-r border-gray-300 dark:border-gray-700">
                <div className="mb-4">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center">
                        <FontAwesomeIcon icon={faCode} className="mr-3" />
                        AI Script Generation
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        Describe your task in natural language
                    </p>
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
                    <div className="flex-1 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700 overflow-auto">
                        {executionOutput ? (
                            <pre className="text-xs text-gray-800 dark:text-green-400 font-mono whitespace-pre-wrap">
                                {executionOutput}
                            </pre>
                        ) : (
                            <p className="text-xs text-gray-500 italic">
                                No output yet. Click "Run Code" to execute the generated script.
                            </p>
                        )}
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

            {/* Right Panel: Code & Actions */}
            <div className="flex-1 flex flex-col p-6">
                {generatedCode ? (
                    <>
                        <h3 className="text-lg font-semibold text-gray-800 dark:text-white mb-3">
                            Generated Code
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
                                        Run Code
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
