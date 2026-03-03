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

    const handleTabChange = (tab: 'query' | 'blank') => {
        setActiveTab(tab);
        if (tab === 'blank') {
            setIsCompiled(true);
        } else {
            setIsCompiled(!!generatedLogic);
        }
    };

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
        if (!isOpen) return;

        if (targetPath) {
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
                            setIsCompiled(true);
                        } catch (e) {
                            console.error("[NewScriptModal] Failed to parse query metadata", e);
                        }
                    }
                } catch (err) {
                    console.error("Failed to fetch script content for persistence:", err);
                }
            };
            fetchExisting();
        } else {
            // New script - reset fields
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
        if (!isOpen) return;

        const nameToCheck = (scriptName || '').trim();
        if (!isReplacing && nameToCheck && scripts && scripts.length > 0 && !isSubmitting) {
            const searchName = nameToCheck.toLowerCase();
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

        const finalLogic = activeTab === 'query' ? generatedLogic : '';
        const finalParams = activeTab === 'query' ? generatedParams : '';
        const finalTemplate = isSentinel
            ? (activeTab === 'query' ? 'raw_injection' : 'BlankSentinel')
            : (activeTab === 'query' ? 'ProjectAuditor' : 'blank');

        if (isReplacing && targetPath) {
            try {
                const response = await api.post("/api/scripts/replace-code", {
                    script_path: targetPath,
                    new_logic: finalLogic,
                    new_params: finalParams,
                    template_id: finalTemplate
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
                        selected_columns: sentinelConfig.selectedColumns,
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
                        template_id: finalTemplate,
                        generated_logic: finalLogic,
                        generated_params: finalParams,
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
            <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size="full" noPadding>
                <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900">

                    {/* 1. Identity Header: Premium, high-contrast identity block */}
                    <div className={`px-8 py-4 border-b transition-all duration-700 shrink-0 ${mode === 'sentinel'
                        ? 'bg-gradient-to-br from-amber-50 to-white dark:from-amber-950/20 dark:to-slate-900 border-amber-100 dark:border-amber-900/40'
                        : 'bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/20 dark:to-slate-900 border-blue-100 dark:border-blue-900/40'
                        }`}>
                        <div className="max-w-6xl mx-auto flex flex-col md:flex-row gap-6 items-center">

                            {/* Column 1: Core Identity */}
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                                {!isReplacing ? (
                                    <>
                                        <div className="flex flex-col gap-2">
                                            <div className="flex justify-between items-center px-1">
                                                <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] leading-none">
                                                    {mode === 'sentinel' ? 'Sentinel Name' : 'Script Name'}
                                                </label>
                                                {isDuplicate && (
                                                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500 text-[10px] font-black text-white rounded-full animate-in slide-in-from-right-2">
                                                        <FontAwesomeIcon icon={faExclamationTriangle} className="text-[9px]" />
                                                        TAKEN
                                                    </div>
                                                )}
                                            </div>
                                            <input
                                                autoFocus
                                                type="text"
                                                value={scriptName}
                                                onChange={(e) => setScriptName(e.target.value)}
                                                placeholder="e.g. Audit Building Heights"
                                                className={`w-full bg-white dark:bg-slate-950 border-2 rounded-2xl px-5 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none transition-all shadow-sm group ${isDuplicate
                                                    ? 'border-rose-500/50 ring-4 ring-rose-500/5'
                                                    : 'border-slate-100 dark:border-slate-800/50 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5'
                                                    }`}
                                            />
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <label className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] px-1 leading-none">
                                                Operational Intent
                                            </label>
                                            <input
                                                type="text"
                                                value={description}
                                                onChange={(e) => setDescription(e.target.value)}
                                                placeholder="e.g. Detect level deviations and report safety breaches."
                                                className="w-full bg-white dark:bg-slate-950 border-2 border-slate-100 dark:border-slate-800/50 rounded-2xl px-5 py-2.5 text-sm font-semibold text-slate-600 dark:text-slate-400 focus:border-blue-500/50 focus:ring-4 focus:ring-blue-500/5 outline-none transition-all shadow-sm"
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <div className="md:col-span-2 flex items-center gap-5 px-6 py-3 bg-white/50 dark:bg-slate-950/40 rounded-3xl border border-blue-100 dark:border-blue-800/20 shadow-sm animate-in zoom-in-95">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg ${mode === 'sentinel' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'
                                            }`}>
                                            <FontAwesomeIcon icon={isReplacing ? faCogs : faPlus} className="text-xl" />
                                        </div>
                                        <div className="flex flex-col gap-1 min-w-0">
                                            <span className={`text-[11px] font-black uppercase tracking-[0.25em] ${mode === 'sentinel' ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'
                                                }`}>Surgical Logic Update</span>
                                            <span className="text-base font-bold text-slate-800 dark:text-slate-100 truncate">{targetPath?.split(/[\\/]/).pop()}</span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Column 2: Mode Selector Segment */}
                            <div className="flex bg-slate-200/50 dark:bg-slate-800/60 p-1 rounded-[1.25rem] border border-slate-200/50 dark:border-slate-700/30 shrink-0">
                                {[
                                    { id: 'query', label: 'Builder', icon: faFilter },
                                    { id: 'blank', label: 'Archetype', icon: faCode }
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => handleTabChange(tab.id as any)}
                                        className={`px-6 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-3 ${activeTab === tab.id
                                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-[0_8px_16px_-4px_rgba(0,0,0,0.1)]'
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

                    {/* 2. Main Canvas: Where the magic happens */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/20 dark:bg-slate-950/10">
                        <div className="max-w-6xl mx-auto py-6 px-8">
                            {activeTab === 'query' ? (
                                <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 ease-out">
                                    <VisualQueryBuilder
                                        key="shared-builder-instance"
                                        initialState={initialQueryState}
                                        onConfigChange={handleConfigChange}
                                        onQueryGenerated={handleQueryGenerated}
                                        isWatchdog={mode === 'sentinel'}
                                        name={isReplacing ? targetPath?.split(/[\\/]/).pop()?.replace(".cs", "") : scriptName}
                                        description={isReplacing ? (scriptToReplace?.metadata?.description || description) : description}
                                    />
                                </div>
                            ) : (
                                <div className="flex items-center justify-center py-16 animate-in fade-in zoom-in-95 duration-700">
                                    <div className="max-w-md w-full text-center p-10 rounded-[3rem] border-2 border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 shadow-xl shadow-slate-200/20 dark:shadow-none">
                                        <div className="w-20 h-20 mx-auto bg-slate-50 dark:bg-slate-800/50 rounded-[2.5rem] flex items-center justify-center mb-8 rotate-6 border border-slate-100 dark:border-slate-700 shadow-sm transition-transform hover:rotate-0 duration-500">
                                            <FontAwesomeIcon icon={faFileCode} className="text-slate-400 dark:text-slate-500 text-3xl -rotate-6 transition-transform group-hover:rotate-0" />
                                        </div>
                                        <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Pure Code Archetype</h3>
                                        <p className="text-sm font-semibold text-slate-400 dark:text-slate-500 mt-4 leading-relaxed px-4">
                                            Initializes a clean {mode === 'sentinel' ? 'Sentinel' : 'C#'} script. <br /> Optimal for high-precision manual development.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 3. Action Footer: High-impact termination */}
                    <div className="px-10 py-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0 shadow-[0_-12px_24px_rgba(0,0,0,0.02)]">
                        <div className="flex items-center gap-4">
                            {!isReplacing && isCompiled && !scriptName.trim() && (
                                <div className="flex items-center gap-3 px-5 py-2.5 bg-rose-50 dark:bg-rose-900/20 rounded-2xl border border-rose-100 dark:border-rose-900/30 text-rose-600 dark:text-rose-400 font-bold animate-pulse">
                                    <FontAwesomeIcon icon={faExclamationTriangle} className="text-[12px]" />
                                    <span className="text-[11px] font-black uppercase tracking-widest">Name Required</span>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center gap-6">
                            <button
                                onClick={() => onClose()}
                                className="px-8 py-3 rounded-2xl text-[11px] font-black text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 uppercase tracking-widest transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleMainActionClick}
                                disabled={isSubmitting || isDuplicate || (activeTab === 'query' && !isCompiled) || (!isReplacing && !scriptName.trim())}
                                className={`px-12 py-4 rounded-[1.25rem] text-[11px] font-black text-white shadow-2xl transition-all disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed hover:scale-[1.02] active:scale-95 flex items-center gap-4 overflow-hidden relative group ${mode === 'sentinel'
                                    ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/30'
                                    : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30'
                                    }`}
                            >
                                {isSubmitting ? (
                                    <FontAwesomeIcon icon={faSpinner} spin className="text-lg" />
                                ) : (
                                    <FontAwesomeIcon icon={mode === 'sentinel' ? faShieldHeart : (isReplacing ? faCogs : faPlus)} className="text-lg group-hover:scale-110 transition-transform" />
                                )}
                                <span className="uppercase tracking-[0.15em]">
                                    {isSubmitting ? 'Processing...' : (mode === 'sentinel' ? (isReplacing ? 'Update Sentinel' : 'Create Sentinel') : (isReplacing ? 'Update Script' : 'Create Script'))}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Confirmation Overlay */}
            {showConfirmReplace && (
                <Modal isOpen={showConfirmReplace} onClose={() => setShowConfirmReplace(false)} title="Security Confirmation" size="md">
                    <div className="space-y-6">
                        <div className="flex items-center gap-5 p-5 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-2xl">
                            <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-800/40 flex items-center justify-center flex-shrink-0">
                                <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-600 dark:text-amber-400 text-2xl" />
                            </div>
                            <div>
                                <div className="text-xs font-black text-amber-800 dark:text-amber-200 uppercase tracking-widest">Overwriting Component</div>
                                <p className="text-xs text-amber-700/60 dark:text-amber-400/60 font-bold mt-1 leading-relaxed">
                                    This will overwrite the current {mode === 'sentinel' ? 'sentinel detection' : 'filtering'} logic. Professional IDE scaffolding will be preserved.
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowConfirmReplace(false)} className="px-6 py-2 rounded-xl text-[10px] font-black text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 uppercase tracking-widest transition-all">Cancel</button>
                            <button onClick={() => handleExecuteAction()} className="px-8 py-3 rounded-xl text-[10px] font-black bg-blue-600 text-white shadow-xl hover:bg-blue-700 uppercase tracking-widest transition-all">Confirm Overwrite</button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
};
