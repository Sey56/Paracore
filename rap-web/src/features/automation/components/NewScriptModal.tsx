import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faCode, faCogs, faFileCode, faFilter, faLayerGroup, faBolt, faTable, faInfoCircle, faExclamationTriangle, faShieldHeart, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { useScripts } from '../hooks/useScripts';
import { useScriptExecution } from '../hooks/useScriptExecution';
import { VisualQueryBuilder } from './VisualQueryBuilder/VisualQueryBuilder';
import { Script } from '@/types/scriptModel';
import { Modal } from '@/components/common/Modal';
import api from '@/api/axios';

interface NewScriptModalProps {
    isOpen: boolean;
    onClose: (createdScript?: Script) => void;
    replaceTarget?: string;
    selectedFolder?: string;
    scriptToReplace?: Script | null;
    mode?: 'script' | 'sentinel';
}

export const NewScriptModal = ({ isOpen, onClose, replaceTarget, selectedFolder, scriptToReplace, mode = 'script' }: NewScriptModalProps) => {
    const { createNewScript, scripts, loadScriptsForFolder } = useScripts();
    const targetPath = replaceTarget || scriptToReplace?.absolutePath;
    const isReplacing = !!targetPath;
    const { resetScriptParameters } = useScriptExecution();

    const [scriptName, setScriptName] = useState('');
    const [description, setDescription] = useState('');
    const [activeTab, setActiveTab] = useState<'query' | 'blank'>('query');
    const [isDuplicate, setIsDuplicate] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [generatedLogic, setGeneratedLogic] = useState('');
    const [generatedParams, setGeneratedParams] = useState('');
    const [isCompiled, setIsCompiled] = useState(false);
    const [initialQueryState, setInitialQueryState] = useState<any>(undefined);
    const [showConfirmReplace, setShowConfirmReplace] = useState(false);

    // Sentinel Logic
    const [sentinelConfig, setSentinelConfig] = useState<any>(null);

    const handleConfigChange = React.useCallback((config: any) => {
        setSentinelConfig(config);
    }, []);

    const handleQueryGenerated = React.useCallback((logic: string, params: string, compiled: boolean) => {
        setGeneratedLogic(logic);
        setGeneratedParams(params);
        setIsCompiled(compiled);
    }, []);

    // Persistence Logic: Load existing query if replacing
    useEffect(() => {
        if (isOpen && targetPath) {
            const fetchExisting = async () => {
                try {
                    const response = await api.get(`/api/script-content?scriptPath=${encodeURIComponent(targetPath)}`);
                    const content = response.data.sourceCode as string;

                    const match = content.match(/\/\/ __PARACORE_QUERY_DATA__(.*)/);
                    if (match && match[1]) {
                        try {
                            const rawJson = match[1].trim();
                            const state = JSON.parse(rawJson);
                            setInitialQueryState(state);
                            setActiveTab('query');
                        } catch (e) {
                            console.error("[NewScriptModal] Failed to parse query metadata", e);
                        }
                    }
                } catch (err) {
                    console.error("Failed to fetch script content for persistence:", err);
                }
            };
            fetchExisting();
        } else if (isOpen) {
            setScriptName('');
            setDescription('');
            setGeneratedLogic('');
            setGeneratedParams('');
            setIsCompiled(false);
            setInitialQueryState(undefined);
            setActiveTab('query');
        }
    }, [isOpen, targetPath]);

    useEffect(() => {
        if (!isOpen) return; // Don't check duplicates if closed
        if (!isReplacing && scriptName && scripts && scripts.length > 0 && !isSubmitting) {
            const searchName = (scriptName || '').toLowerCase();
            const exists = scripts.some((s: Script) => {
                const sName = (s.name || '').toLowerCase();
                const dName = (s.metadata?.displayName || '').toLowerCase();
                return sName === searchName || dName === searchName;
            });
            setIsDuplicate(exists);
        } else {
            setIsDuplicate(false);
        }
    }, [scriptName, scripts, isReplacing, isSubmitting, isOpen]);

    if (!isOpen) return null;

    const handleExecuteAction = async () => {
        const isSentinel = mode === 'sentinel';
        setIsSubmitting(true);
        if (isReplacing && targetPath) {
            try {
                const response = await api.post("/api/scripts/replace-code", {
                    script_path: targetPath,
                    new_logic: generatedLogic,
                    new_params: generatedParams
                });

                if (response.status === 200 || response.status === 201) {
                    if (scriptToReplace?.id) {
                        await resetScriptParameters(scriptToReplace.id);
                    }
                    setShowConfirmReplace(false);
                    // Return the fresh script object from the response
                    onClose(response.data as Script);
                }
            } catch (err) {
                console.error("Failed to replace script code:", err);
            } finally {
                setIsSubmitting(false);
            }
        } else {
            if (!scriptName) {
                setIsSubmitting(false);
                return;
            }
            try {
                let result;
                if (isSentinel && activeTab === 'query' && sentinelConfig) {
                    // Use query-to-watchdog endpoint for visual builder sentinels
                    const response = await api.post('/api/query/save-as-watchdog', {
                        name: scriptName,
                        description: description || `Sentinel for ${sentinelConfig.category}`,
                        target_folder: selectedFolder,
                        category_name: sentinelConfig.category,
                        root_group: sentinelConfig.rootGroup,
                        scope: sentinelConfig.scope
                    });
                    if (response.data.success) {
                        if (selectedFolder) {
                            await loadScriptsForFolder(selectedFolder, true);
                        }
                        // Use returned script metadata or fallback to a partial object with ID for selection
                        const finalId = (response.data.script?.id || response.data.path || '').replace(/\\/g, '/');
                        result = response.data.script || { 
                            id: finalId, 
                            name: scriptName, 
                            absolutePath: finalId,
                            metadata: { displayName: scriptName } 
                        };
                    }
                } else {
                    // Use standard create script for everything else
                    result = await createNewScript({
                        script_name: scriptName,
                        template_id: isSentinel ? 'BlankSentinel' : (activeTab === 'query' ? 'ProjectAuditor' : 'blank'),
                        generated_logic: generatedLogic,
                        generated_params: generatedParams,
                        parent_folder: selectedFolder
                    });
                }

                if (result) {
                    setShowConfirmReplace(false);
                    onClose(result);
                }
            } catch (err) {
                console.error("Failed to create new script:", err);
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    const handleMainActionClick = () => {
        if (isReplacing) {
            setShowConfirmReplace(true);
        } else {
            handleExecuteAction();
        }
    };

    const modalTitle = isReplacing ? `Edit Script` : 'New Script';

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size="full">
                <div className="flex flex-col h-full bg-white dark:bg-gray-900">

                    {/* Toolbar & Name Input */}
                    <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-white dark:bg-gray-900 shrink-0">
                        <div className="flex items-center gap-4 flex-1">
                            {!isReplacing ? (
                                <>
                                    <div className="flex flex-col w-1/4 min-w-[250px]">
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.1em] px-1">
                                                {mode === 'sentinel' ? 'Sentinel Name' : 'Tool Name'}
                                            </label>
                                            {isDuplicate && (
                                                <span className="text-[10px] font-bold text-red-500 flex items-center gap-1.5 animate-pulse">
                                                    <FontAwesomeIcon icon={faExclamationTriangle} />
                                                    Exists
                                                </span>
                                            )}
                                        </div>
                                        <input
                                            autoFocus
                                            type="text"
                                            value={scriptName}
                                            onChange={(e) => setScriptName(e.target.value)}
                                            placeholder="e.g. Audit Fire Ratings..."
                                            className={`bg-gray-50 dark:bg-gray-800 border rounded-lg px-4 py-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100 focus:ring-2 outline-none transition-all ${isDuplicate
                                                ? 'border-red-500/50 focus:ring-red-500/20 focus:border-red-500'
                                                : 'border-gray-200 dark:border-gray-700 focus:ring-blue-500/20 focus:border-blue-500'
                                                }`}
                                        />
                                    </div>
                                    <div className="flex flex-col w-1/3 min-w-[300px]">
                                        <label className="text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-[0.1em] px-1 mb-1">Description / Success Msg</label>
                                        <input
                                            type="text"
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            placeholder="e.g. Checks if fire ratings match specs."
                                            className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                        />
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/50">
                                    <FontAwesomeIcon icon={faCogs} className="text-blue-500 text-sm" />
                                    <div className="flex flex-col">
                                        <span className="text-[11px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Updating Target</span>
                                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate max-w-[300px]">{targetPath?.split(/[\\/]/).pop()}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Clean Segmented Tabs */}
                        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                            {[
                                { id: 'query', label: 'Visual Builder', icon: faFilter },
                                { id: 'blank', label: 'Blank Script', icon: faCode }
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${activeTab === tab.id
                                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                        : 'text-gray-400 hover:text-gray-600'
                                        }`}
                                >
                                    <FontAwesomeIcon icon={tab.icon} className={activeTab === tab.id ? 'text-blue-500' : ''} />
                                    {tab.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6 min-h-0 bg-white dark:bg-gray-900">
                        <div className="max-w-7xl mx-auto">
                            {activeTab === 'query' && (
                                <VisualQueryBuilder
                                    key={initialQueryState ? 'persistent' : 'new'}
                                    initialState={initialQueryState}
                                    onConfigChange={handleConfigChange}
                                    onQueryGenerated={handleQueryGenerated}
                                />
                            )}

                            {activeTab === 'blank' && (
                                <div className="flex items-center justify-center p-12">
                                    <div className="max-w-lg w-full text-center p-10 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                                        <FontAwesomeIcon icon={faFileCode} className="text-gray-400 text-4xl mb-4" />
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Empty C# Logic</h3>
                                        <p className="text-sm text-gray-500 mt-2">Start with a blank canvas for custom Revit API development.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Action Footer */}
                    <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-3 bg-white dark:bg-gray-900 shrink-0">
                        <button onClick={() => onClose()} className="px-6 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Cancel</button>

                        <button
                            onClick={handleMainActionClick}
                            disabled={(!scriptName && !isReplacing) || (activeTab === 'query' && !isCompiled) || isSubmitting}
                            className={`px-6 py-2 rounded-lg text-sm font-bold text-white shadow-lg transition-all disabled:opacity-50 active:scale-95 flex items-center gap-2 ${
                                mode === 'sentinel' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                        >
                            {isSubmitting ? (
                                <FontAwesomeIcon icon={faSpinner} spin />
                            ) : (
                                <FontAwesomeIcon icon={mode === 'sentinel' ? faShieldHeart : (isReplacing ? faCogs : faCode)} />
                            )}
                            
                            {isSubmitting 
                                ? 'Creating...' 
                                : (mode === 'sentinel' 
                                    ? 'Create Sentinel' 
                                    : (isReplacing ? 'Confirm Changes' : 'Create Script')
                                  )
                            }
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Surgical Replace Confirmation Modal */}
            {showConfirmReplace && (
                <Modal isOpen={showConfirmReplace} onClose={() => setShowConfirmReplace(false)} title="Confirm Script Update" size="md">
                    <div className="space-y-6">
                        <div className="flex items-center gap-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-xl">
                            <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-800 flex items-center justify-center flex-shrink-0">
                                <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-600 dark:text-amber-400 text-lg" />
                            </div>
                            <div>
                                <div className="text-sm font-black text-amber-800 dark:text-amber-200 uppercase">Warning: Surgical Injection</div>
                                <p className="text-xs text-amber-700/70 dark:text-amber-400/70 font-bold mt-0.5">This will overwrite the current filtering logic and parameters. IDE scaffolding will be preserved.</p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button onClick={() => setShowConfirmReplace(false)} className="px-6 py-2 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-100 transition-all">Go Back</button>
                            <button onClick={() => handleExecuteAction()} className="px-6 py-2 rounded-lg text-xs font-black bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-all">Overwrite Logic</button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
};
