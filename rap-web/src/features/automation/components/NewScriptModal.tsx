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

                    {/* Optimized Identity Header */}
                    <div className={`px-8 py-6 border-b transition-colors duration-500 shrink-0 ${mode === 'sentinel'
                        ? 'bg-amber-50/30 dark:bg-amber-900/10 border-amber-100/50 dark:border-amber-800/30'
                        : 'bg-blue-50/30 dark:bg-blue-900/10 border-blue-100/50 dark:border-blue-800/30'
                        }`}>
                        <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-8 items-end">
                            {/* 1. Identity Group */}
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                                {!isReplacing ? (
                                    <>
                                        <div className="flex flex-col gap-1.5 focus-within:z-10">
                                            <div className="flex justify-between items-center px-1">
                                                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest leading-none">
                                                    {mode === 'sentinel' ? 'Sentinel Name' : 'Tool Name'}
                                                </label>
                                                {isDuplicate && (
                                                    <span className="text-[10px] font-bold text-rose-500 flex items-center gap-1.5 animate-in slide-in-from-right-2">
                                                        <FontAwesomeIcon icon={faExclamationTriangle} className="text-[8px]" />
                                                        Name Exists
                                                    </span>
                                                )}
                                            </div>
                                            <div className="relative group">
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    value={scriptName}
                                                    onChange={(e) => setScriptName(e.target.value)}
                                                    placeholder="e.g. Audit Fire Ratings..."
                                                    className={`w-full bg-white dark:bg-slate-900 border rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none transition-all shadow-sm ${isDuplicate
                                                        ? 'border-rose-500/50 ring-4 ring-rose-500/5'
                                                        : 'border-slate-200 dark:border-slate-700/50 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5'
                                                        }`}
                                                />
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1.5 ">
                                            <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-1 leading-none">
                                                Purpose & Goal
                                            </label>
                                            <input
                                                type="text"
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                placeholder="e.g. Ensure all office walls comply with safety ratings."
                                                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-300 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all shadow-sm"
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="md:col-span-2 flex items-center gap-4 px-5 py-3 bg-white/50 dark:bg-slate-900/50 rounded-xl border border-blue-100/50 dark:border-blue-800/20 shadow-sm animate-in zoom-in-95">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                            <FontAwesomeIcon icon={faCogs} className="text-sm" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">Surgical Modification</span>
                                            <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate max-w-md">{targetPath?.split(/[\\/]/).pop()}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 2. Mode Selector Segment */}
                            <div className="flex bg-slate-200/50 dark:bg-slate-800/50 p-1 rounded-xl border border-slate-200/50 dark:border-slate-700/30 shrink-0">
                                {[
                                    { id: 'query', label: 'Builder', icon: faFilter },
                                    { id: 'blank', label: 'Blank', icon: faCode }
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id as any)}
                                        className={`px-5 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2.5 ${activeTab === tab.id
                                            ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-md'
                                            : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                                            }`}
                                    >
                                        <FontAwesomeIcon icon={tab.icon} className={`text-[10px] ${activeTab === tab.id ? (mode === 'sentinel' ? 'text-amber-500' : 'text-blue-500') : ''}`} />
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Main Construction Area */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 bg-slate-50/50 dark:bg-slate-950/20">
                        <div className="max-w-5xl mx-auto py-6 px-6">
                            {activeTab === 'query' && (
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <VisualQueryBuilder
                                        key={initialQueryState ? 'persistent' : 'new'}
                                        initialState={initialQueryState}
                                        onConfigChange={handleConfigChange}
                                        onQueryGenerated={handleQueryGenerated}
                                    />
                                </div>
                            )}

                            {activeTab === 'blank' && (
                                <div className="flex items-center justify-center py-20 animate-in fade-in zoom-in-95 duration-500">
                                    <div className="max-w-md w-full text-center p-12 rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/30 active:scale-[0.99] transition-transform">
                                        <div className="w-20 h-20 mx-auto bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-6">
                                            <FontAwesomeIcon icon={faFileCode} className="text-slate-400 text-3xl" />
                                        </div>
                                        <h3 className="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Pure Code Archetype</h3>
                                        <p className="text-sm font-medium text-slate-400 dark:text-slate-500 mt-2">
                                            Initializes a clean {mode === 'sentinel' ? 'Watchdog' : 'C#'} project. Ideal for manual high-logic development.
                                        </p>
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
                            className={`px-6 py-2 rounded-lg text-sm font-bold text-white shadow-lg transition-all disabled:opacity-50 active:scale-95 flex items-center gap-2 ${mode === 'sentinel' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'
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
