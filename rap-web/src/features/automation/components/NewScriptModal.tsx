import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
    faPlus, 
    faCode, 
    faCogs, 
    faFileCode, 
    faFilter, 
    faExclamationTriangle, 
    faShieldHeart, 
    faSpinner, 
    faHistory, 
    faInfoCircle,
    faCheckCircle,
    faChevronDown,
    faTimesCircle
} from '@fortawesome/free-solid-svg-icons';
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

const QueryTemplateSelector: React.FC<{
    templates: any[],
    onSelect: (data: any, name: string | null) => void,
    selectedTemplateName: string | null,
    mode: 'script' | 'sentinel'
}> = ({ templates, onSelect, selectedTemplateName, mode }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
        };
        if (isOpen) document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [isOpen]);

    if (templates.length === 0 && !selectedTemplateName) return null;

    return (
        <div className="relative" ref={containerRef}>
            {/* Custom Minimalist Trigger: Displays selected template name */}
            <div 
                onClick={() => setIsOpen(!isOpen)}
                className={`bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800/50 border rounded-lg px-4 py-1.5 text-[13px] font-bold outline-none cursor-pointer min-w-[240px] flex items-center justify-between transition-all ${selectedTemplateName ? 'border-blue-500/20 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
                <span className="truncate">{selectedTemplateName || "Start from template..."}</span>
                <FontAwesomeIcon icon={faChevronDown} className={`text-[10px] transition-transform ml-2 ${isOpen ? 'rotate-180' : ''} ${selectedTemplateName ? 'text-blue-400' : 'text-slate-400'}`} />
            </div>

            {/* Custom High-Contrast Dropdown Menu */}
            {isOpen && (
                <div className="absolute top-full right-0 mt-2 min-w-[240px] w-max bg-white dark:bg-slate-900 rounded-xl shadow-2xl z-[110] border border-slate-100 dark:border-slate-800 animate-in fade-in slide-in-from-top-1 overflow-hidden">
                    <div className="max-h-64 overflow-y-auto custom-scrollbar">
                        {/* None / Clear Option */}
                        <div
                            onClick={() => {
                                onSelect(null, null);
                                setIsOpen(false);
                            }}
                            className="px-4 py-2.5 text-[13px] font-bold cursor-pointer hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors border-b border-slate-50 dark:border-slate-800 text-rose-500 flex items-center gap-3"
                        >
                            <FontAwesomeIcon icon={faTimesCircle} className="text-[11px] opacity-60" />
                            Clear Canvas
                        </div>

                        {templates.map(t => (
                            <div
                                key={t.id}
                                onClick={() => {
                                    onSelect(t.data, t.name);
                                    setIsOpen(false);
                                }}
                                className={`px-4 py-2.5 text-[13px] font-bold cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors border-b border-slate-50 dark:border-slate-800 last:border-0 flex items-center gap-3 ${selectedTemplateName === t.name ? 'bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-300'}`}
                            >
                                <div className={`w-1.5 h-1.5 rounded-full ${selectedTemplateName === t.name ? 'bg-blue-500' : 'bg-blue-500/40'}`} />
                                {t.name}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

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
    const [selectedTemplateName, setSelectedTemplateName] = useState<string | null>(null);
    const [showConfirmReplace, setShowConfirmReplace] = useState(false);

    const [sentinelConfig, setSentinelConfig] = useState<any>(null);

    // V5 FIX: Prevent re-initialization if already active
    const isInitializedRef = React.useRef(false);

    // Template Gallery
    const queryTemplates = React.useMemo(() => {
        if (!scripts) return [];
        return scripts
            .filter(s => s.queryData && (mode === 'sentinel' ? s.metadata?.isWatchdog : !s.metadata?.isWatchdog))
            .map(s => ({
                id: s.id,
                name: s.metadata?.displayName || s.name,
                data: s.queryData
            }));
    }, [scripts, mode]);

    const handleTabChange = (tab: 'query' | 'blank') => {
        setActiveTab(tab);
        if (tab === 'blank') setIsCompiled(true);
        else setIsCompiled(!!generatedLogic);
    };

    const handleConfigChange = React.useCallback((config: any) => {
        setSentinelConfig(config);
    }, []);

    const handleQueryGenerated = React.useCallback((logic: string, params: string, compiled: boolean) => {
        setGeneratedLogic(logic);
        setGeneratedParams(params);
        setIsCompiled(compiled);
    }, []);

    const handleTemplateSelect = (templateData: any, name: string | null) => {
        setInitialQueryState(null); // Force unmount
        setSelectedTemplateName(name);
        
        setTimeout(() => {
            // If templateData is null, it stays null (cleared state)
            // If it's data, it reloads the builder with that graph
            setInitialQueryState(templateData || undefined);
            setIsCompiled(!!templateData);
        }, 10);
    };

    // Persistence Logic
    useEffect(() => {
        if (!isOpen) {
            isInitializedRef.current = false;
            return;
        }

        // Only run initialization ONCE per open/path-change
        if (isInitializedRef.current) return;
        isInitializedRef.current = true;

        if (targetPath) {
            const existing = scripts.find(s => s.absolutePath === targetPath);
            if (existing && existing.queryData) {
                setInitialQueryState(existing.queryData);
                setSelectedTemplateName(existing.metadata?.displayName || existing.name);
                setActiveTab('query');
                setIsCompiled(true);
                return;
            }
            const fetchExisting = async () => {
                try {
                    const response = await api.get(`/api/script-content?scriptPath=${encodeURIComponent(targetPath)}`);
                    const content = response.data.sourceCode as string;
                    const match = content.match(/\/\/ __PARACORE_QUERY_DATA__(.*)/);
                    if (match && match[1]) {
                        const state = JSON.parse(match[1].trim());
                        setInitialQueryState(state);
                        setSelectedTemplateName(targetPath.split(/[\\/]/).pop()?.replace('.cs', '') || null);
                        setActiveTab('query');
                        setIsCompiled(true);
                    }
                } catch (err) {}
            };
            fetchExisting();
        } else {
            setScriptName('');
            setDescription('');
            setGeneratedLogic('');
            setGeneratedParams('');
            setIsCompiled(false);
            setInitialQueryState(undefined);
            setSelectedTemplateName(null);
            setActiveTab('query');
        }
    }, [isOpen, targetPath, scripts]);

    useEffect(() => {
        if (!isOpen) return;
        const nameToCheck = (scriptName || '').trim();
        if (!isReplacing && nameToCheck && scripts && scripts.length > 0 && !isSubmitting) {
            const searchName = nameToCheck.toLowerCase();
            const exists = scripts.some((s: Script) => (s.name || '').toLowerCase() === searchName || (s.metadata?.displayName || '').toLowerCase() === searchName);
            setIsDuplicate(exists);
        } else setIsDuplicate(false);
    }, [scriptName, scripts, isReplacing, isSubmitting, isOpen]);

    if (!isOpen) return null;

    const handleExecuteAction = async () => {
        const isSentinel = mode === 'sentinel';
        setIsSubmitting(true);
        const finalLogic = activeTab === 'query' ? generatedLogic : '';
        const finalParams = activeTab === 'query' ? generatedParams : '';
        const finalTemplate = isSentinel ? (activeTab === 'query' ? 'raw_injection' : 'BlankSentinel') : (activeTab === 'query' ? 'ProjectAuditor' : 'blank');

        if (isReplacing && targetPath) {
            try {
                const response = await api.post("/api/scripts/replace-code", { script_path: targetPath, new_logic: finalLogic, new_params: finalParams, template_id: finalTemplate });
                if (response.status === 200 || response.status === 201) {
                    if (scriptToReplace?.id) await resetScriptParameters(scriptToReplace.id);
                    setShowConfirmReplace(false);
                    onClose(response.data as Script);
                }
            } catch (err) {} finally { setIsSubmitting(false); }
        } else {
            if (!scriptName) { setIsSubmitting(false); return; }
            try {
                let result;
                if (isSentinel && activeTab === 'query' && sentinelConfig) {
                    const response = await api.post('/api/query/save-as-watchdog', { name: scriptName, description: description || `Sentinel for ${sentinelConfig.category}`, target_folder: selectedFolder, category_name: sentinelConfig.category, root_group: sentinelConfig.rootGroup, selected_columns: sentinelConfig.selectedColumns, scope: sentinelConfig.scope });
                    if (response.data.success) {
                        if (selectedFolder) await loadScriptsForFolder(selectedFolder, true);
                        const finalId = (response.data.script?.id || response.data.path || '').replace(/\\/g, '/');
                        result = response.data.script || { id: finalId, name: scriptName, absolutePath: finalId, metadata: { displayName: scriptName } };
                    }
                } else {
                    result = await createNewScript({ script_name: scriptName, template_id: finalTemplate, generated_logic: finalLogic, generated_params: finalParams, parent_folder: selectedFolder });
                }
                if (result) { setShowConfirmReplace(false); onClose(result); }
            } catch (err) {} finally { setIsSubmitting(false); }
        }
    };

    const handleMainActionClick = () => {
        if (isReplacing) {
            setShowConfirmReplace(true);
        } else {
            handleExecuteAction();
        }
    };

    const modalTitle = isReplacing ? `Edit Script Logic` : (mode === 'sentinel' ? 'New Sentinel' : 'New Script');

    return (
        <>
            <Modal isOpen={isOpen} onClose={onClose} title={modalTitle} size="full" noPadding>
                <div className="flex flex-col h-full bg-white dark:bg-slate-900">

                    {/* 1. SLIM LINEAR HEADER: Optimized for High-Res Readability */}
                    <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-6 shrink-0 bg-slate-50/50 dark:bg-slate-900/50">
                        
                        {/* Name & Intent - Scaled to 14px/15px */}
                        <div className="flex-grow flex items-center gap-4">
                            {!isReplacing ? (
                                <>
                                    <div className="relative min-w-[320px]">
                                        <input
                                            autoFocus
                                            type="text"
                                            value={scriptName}
                                            onChange={(e) => setScriptName(e.target.value.replace(/\s+/g, ''))}
                                            placeholder={mode === 'sentinel' ? "Sentinel Name..." : "Script Name..."}
                                            className={`w-full bg-transparent border-b-2 rounded-none px-1 py-2 text-[14px] font-bold text-slate-700 dark:text-slate-200 outline-none transition-all ${isDuplicate ? 'border-rose-500' : 'border-slate-200 dark:border-slate-700 focus:border-blue-500'}`}
                                        />
                                        {isDuplicate && <span className="absolute -bottom-4 left-1 text-[10px] font-black text-rose-500 uppercase tracking-widest">Name Taken</span>}
                                    </div>
                                    <div className="h-8 w-px bg-slate-200 dark:bg-slate-800"></div>
                                    <input
                                        type="text"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        placeholder="Describe operational intent..."
                                        className="flex-grow bg-transparent border-none px-2 py-2 text-[14px] font-medium text-slate-500 dark:text-slate-400 outline-none focus:text-slate-800 dark:focus:text-slate-200 transition-colors"
                                    />
                                </>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shadow-sm ${mode === 'sentinel' ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white'}`}>
                                        <FontAwesomeIcon icon={faCogs} className="text-sm" />
                                    </div>
                                    <span className="text-[15px] font-bold text-slate-800 dark:text-slate-100">{targetPath?.split(/[\\/]/).pop()}</span>
                                    <span className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-2">Surgical Update</span>
                                </div>
                            )}
                        </div>

                        {/* Mode & Templates - Unified 12px Rail */}
                        <div className="flex items-center gap-2 shrink-0">
                            {activeTab === 'query' && (
                                <QueryTemplateSelector 
                                    templates={queryTemplates} 
                                    onSelect={handleTemplateSelect} 
                                    selectedTemplateName={selectedTemplateName}
                                    mode={mode} 
                                />
                            )}

                            <div className="flex items-center gap-1">
                                {[
                                    { id: 'query', label: 'Builder', icon: faFilter },
                                    { id: 'blank', label: 'Archetype', icon: faCode }
                                ].map((tab) => (
                                    <button
                                        key={tab.id}
                                        onClick={() => handleTabChange(tab.id as any)}
                                        className={`px-4 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800/50 ${activeTab === tab.id
                                            ? 'text-slate-900 dark:text-white'
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

                    {/* 2. MAXIMIZED CANVAS: Minimalist Workspace */}
                    <div className="flex-1 overflow-hidden relative flex flex-col bg-slate-50/20 dark:bg-slate-950/10">
                        <div className="flex-grow overflow-y-auto custom-scrollbar p-6">
                            <div className="max-w-7xl mx-auto h-full">
                                {activeTab === 'query' ? (
                                    <div className="animate-in fade-in duration-500 h-full">
                                        {initialQueryState !== null && (
                                            <VisualQueryBuilder
                                                key={JSON.stringify(initialQueryState || 'new')}
                                                initialState={initialQueryState}
                                                onConfigChange={handleConfigChange}
                                                onQueryGenerated={handleQueryGenerated}
                                                isWatchdog={mode === 'sentinel'}
                                                name={isReplacing ? targetPath?.split(/[\\/]/).pop()?.replace(".cs", "") : scriptName}
                                                description={isReplacing ? (scriptToReplace?.metadata?.description || description) : description}
                                            />
                                        )}
                                    </div>
                                ) : (
                                    <div className="h-full flex items-center justify-center py-12">
                                        <div className="max-w-md w-full text-center p-8 rounded-[2.5rem] border-2 border-dashed border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/40 shadow-sm">
                                            <div className="w-16 h-16 mx-auto bg-slate-50 dark:bg-slate-800/50 rounded-2xl flex items-center justify-center mb-6 border border-slate-100 dark:border-slate-700 shadow-sm">
                                                <FontAwesomeIcon icon={faFileCode} className="text-slate-400 dark:text-slate-500 text-2xl" />
                                            </div>
                                            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">Pure Code Archetype</h3>
                                            <p className="text-[14px] font-medium text-slate-400 dark:text-slate-500 mt-3 leading-relaxed px-4">
                                                Initializes a clean {mode === 'sentinel' ? 'Sentinel' : 'C#'} script for professional IDE development.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 3. COMPACT FOOTER: Focused on confirmation (12px Buttons) */}
                    <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between shrink-0 shadow-sm">
                        <div className="flex items-center gap-3">
                            <FontAwesomeIcon icon={faInfoCircle} className="text-slate-300 text-[11px]" />
                            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                                {activeTab === 'query' ? (isCompiled ? 'Ready for Deployment' : 'Definition Incomplete') : 'Archetype Ready'}
                            </span>
                        </div>

                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => onClose()}
                                className="px-5 py-2 rounded-xl text-[12px] font-black text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all uppercase tracking-widest"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleMainActionClick}
                                disabled={isSubmitting || isDuplicate || (activeTab === 'query' && !isCompiled) || (!isReplacing && !scriptName.trim())}
                                className={`px-10 py-2.5 rounded-xl text-[12px] font-black text-white shadow-lg transition-all disabled:opacity-40 disabled:grayscale hover:scale-[1.02] active:scale-95 flex items-center gap-3 relative group ${mode === 'sentinel'
                                    ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20'
                                    : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/30'
                                    }`}
                            >
                                {isSubmitting ? (
                                    <FontAwesomeIcon icon={faSpinner} spin className="text-sm" />
                                ) : (
                                    <FontAwesomeIcon icon={mode === 'sentinel' ? faShieldHeart : (isReplacing ? faCheckCircle : faPlus)} className="text-sm group-hover:scale-110 transition-transform" />
                                )}
                                <span className="uppercase tracking-[0.1em]">
                                    {isSubmitting ? 'Processing...' : (mode === 'sentinel' ? (isReplacing ? 'Update Sentinel' : 'Create Sentinel') : (isReplacing ? 'Deploy Update' : 'Generate Script'))}
                                </span>
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>

            {/* Security Confirmation */}
            {showConfirmReplace && (
                <Modal isOpen={showConfirmReplace} onClose={() => setShowConfirmReplace(false)} title="Security Confirmation" size="md">
                    <div className="space-y-6">
                        <div className="flex items-center gap-5 p-5 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 rounded-2xl">
                            <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-800/40 flex items-center justify-center flex-shrink-0">
                                <FontAwesomeIcon icon={faExclamationTriangle} className="text-amber-600 dark:text-amber-400 text-2xl" />
                            </div>
                            <div>
                                <div className="text-xs font-black text-amber-800 dark:text-amber-200 uppercase tracking-widest">Overwriting Component</div>
                                <p className="text-[13px] text-amber-700/60 dark:text-amber-400/60 font-bold mt-1 leading-relaxed">
                                    This will overwrite the current {mode === 'sentinel' ? 'sentinel detection' : 'filtering'} logic. Professional IDE scaffolding will be preserved.
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button onClick={() => setShowConfirmReplace(false)} className="px-6 py-2 rounded-xl text-[12px] font-black text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 uppercase tracking-widest transition-all">Cancel</button>
                            <button onClick={() => handleExecuteAction()} className="px-8 py-3 rounded-xl text-[12px] font-black bg-blue-600 text-white shadow-xl hover:bg-blue-700 uppercase tracking-widest transition-all">Confirm Overwrite</button>
                        </div>
                    </div>
                </Modal>
            )}
        </>
    );
};
