import React, { useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldHeart, faCheckCircle, faExclamationCircle, faTimesCircle, faMousePointer, faEye, faTable, faExclamationTriangle, faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons';
import { useWatchdog, WatchdogStatus } from '@/context/providers/WatchdogProvider';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { useContext } from 'react';
import type { Script, ScriptParameter } from '@/types/scriptModel';
import { ScriptContext } from '@/features/automation/store/ScriptContext';
import { ScriptExecutionContext } from '@/features/automation/store/ScriptExecutionContext';
import { appWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import api from '@/api/axios';

interface SentinelControlListProps {
    onDetach?: () => void;
    isDetached?: boolean;
}

export const SentinelControlList: React.FC<SentinelControlListProps> = ({ onDetach, isDetached }) => {
    const { watchdogs, hasIssues, deployedDocumentMap } = useWatchdog();
    const scriptContext = useContext(ScriptContext);
    const scriptExecutionContext = useContext(ScriptExecutionContext);
    const { revitStatus } = useRevitStatus();
    const currentDocTitle = revitStatus.document ? revitStatus.document.split(/[\\/]/).pop() || null : null;

    const normalize = (p: string) => (p || "").replace(/\\/g, '/').toLowerCase().trim();

    const handleAction = useCallback(async (scriptPath: string, action: string) => {
        try {
            let s: Script | undefined = scriptContext?.scripts.find((scriptItem: Script) => normalize(scriptItem.absolutePath) === normalize(scriptPath));

            if (!s) {
                const response = await api.get(`/api/script-details?scriptPath=${encodeURIComponent(scriptPath)}`);
                s = response.data as Script;
            }

            if (s && scriptExecutionContext) {
                await scriptExecutionContext.setSelectedScript(s, 'user');

                let execParams = scriptExecutionContext.userEditedScriptParameters[s.id] || s.parameters;

                const watchdog = watchdogs.find(w => normalize(w.script_path) === normalize(scriptPath));
                if (watchdog?.parameters_json) {
                    try {
                        const parsed = JSON.parse(watchdog.parameters_json);
                        if (Array.isArray(parsed)) {
                            execParams = parsed;
                        } else if (typeof parsed === 'object' && parsed !== null) {
                            if (execParams && Array.isArray(execParams) && execParams.length > 0) {
                                execParams = execParams.map((p: ScriptParameter) => {
                                    if (parsed[p.name] !== undefined) {
                                        return { ...p, value: parsed[p.name] };
                                    }
                                    return p;
                                });
                            } else {
                                execParams = Object.keys(parsed).map(k => ({
                                    name: k,
                                    value: parsed[k],
                                    type: typeof parsed[k] === 'number' ? 'number' : typeof parsed[k] === 'boolean' ? 'boolean' : 'string',
                                    defaultValue: parsed[k],
                                    required: true,
                                    options: []
                                }));
                            }
                        }
                    } catch (e) {
                        console.warn("[SentinelControl] Failed to parse parameters_json", e);
                    }
                }

                const paramAction: ScriptParameter = {
                    name: '__sentinel_action__',
                    value: action,
                    type: 'string',
                    defaultValue: action,
                    required: true,
                    options: []
                };
                execParams = [paramAction, ...execParams];

                // If we're in the detached window AND the action is 'table',
                // emit an event to the main window so it can run it there (Analytics tab lives there)
                if (appWindow.label === 'sentinel-control' && action === 'table') {
                    await emit('sentinel-table-action', { scriptPath, action });
                    // Focus the main window so user can see the Analytics tab
                    const { WebviewWindow } = await import('@tauri-apps/api/window');
                    const mainWin = WebviewWindow.getByLabel('main');
                    if (mainWin) await mainWin.setFocus();
                    return;
                }

                scriptExecutionContext.runScript(s, execParams);
            }
        } catch (error) {
            console.error("[SentinelControl] Failed to fetch or execute ad-hoc script:", error);
        }
    }, [scriptContext, scriptExecutionContext, watchdogs]);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'success': return 'text-green-500';
            case 'warning': return 'text-amber-500';
            case 'error': return 'text-red-500';
            default: return 'text-gray-400';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'success': return faCheckCircle;
            case 'warning': return faExclamationCircle;
            case 'error': return faTimesCircle;
            default: return faShieldHeart;
        }
    };

    return (
        <div className={`p-4 space-y-3 ${isDetached ? 'h-full bg-slate-900 overflow-y-auto custom-scrollbar' : 'max-h-[32rem] overflow-y-auto custom-scrollbar'}`}>
            {watchdogs.length === 0 ? (
                <div className="py-16 px-6 text-center">
                    <div className="w-16 h-16 rounded-[2rem] bg-white/5 dark:bg-slate-100 flex items-center justify-center mx-auto mb-6 shadow-inner">
                        <FontAwesomeIcon icon={faShieldHeart} className="text-2xl text-slate-500 dark:text-slate-300" />
                    </div>
                    <span className="block text-sm font-bold tracking-wide text-slate-300 dark:text-slate-400">No Active Sentinels</span>
                    <span className="block text-[11px] text-slate-500 dark:text-slate-500 mt-2 uppercase tracking-widest">Deploy a source to begin monitoring</span>
                </div>
            ) : (
                watchdogs.map((w, idx) => (
                    <div key={idx} className="p-5 rounded-[1.75rem] bg-white/5 dark:bg-slate-50/50 hover:bg-white/10 dark:hover:bg-white transition-all duration-300 group mb-2 border border-transparent hover:border-white/10 dark:hover:border-slate-200 hover:shadow-xl">
                        <div className="flex items-start gap-4">
                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${w.status === 'success' ? 'bg-emerald-500/20' :
                                w.status === 'warning' ? 'bg-amber-500/20' : 'bg-rose-500/20'
                                }`}>
                                <FontAwesomeIcon icon={getStatusIcon(w.status)} className={`${getStatusColor(w.status)} text-lg`} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-bold text-slate-100 dark:text-slate-800 leading-tight tracking-tight mb-0.5 flex flex-wrap items-center gap-2 min-w-0">
                                    <span className="truncate">{w.script_name.replace(/\.(wtool|ptool|cs)$/i, '')}</span>
                                    {w.script_name.endsWith('.wtool') && (
                                        <span className="shrink-0 inline-flex px-1.5 py-0.5 rounded-md bg-violet-500/20 text-violet-400 dark:text-violet-500 text-[8px] font-black uppercase tracking-widest leading-none items-center self-center">BIN</span>
                                    )}
                                    {(() => {
                                        const deployedDoc = deployedDocumentMap[normalize(w.script_path)];
                                        const isDocMismatch = deployedDoc && currentDocTitle && deployedDoc !== currentDocTitle;
                                        return isDocMismatch ? (
                                            <div className="relative group/mismatch shrink-0">
                                                <span className="text-amber-500 cursor-help">
                                                    <FontAwesomeIcon icon={faExclamationTriangle} className="text-[10px]" />
                                                </span>
                                                <div className="absolute z-50 left-1/2 -translate-x-1/2 bottom-full mb-2 p-3 rounded-xl shadow-2xl bg-slate-900 border border-white/10 text-white text-[10px] font-bold leading-relaxed w-48 opacity-0 invisible group-hover/mismatch:opacity-100 group-hover/mismatch:visible transition-all duration-300 transform translate-y-1 group-hover/mismatch:translate-y-0 pointer-events-none">
                                                    <div className="text-amber-400 mb-1 flex items-center gap-1.5 uppercase tracking-widest border-b border-white/5 pb-1">
                                                        <FontAwesomeIcon icon={faExclamationTriangle} /> Document Mismatch
                                                    </div>
                                                    Deployed for <span className="text-blue-400">'{deployedDoc}'</span>.
                                                    <br />
                                                    Redeploy for <span className="text-emerald-400">'{currentDocTitle}'</span> to monitor active document.
                                                </div>
                                            </div>
                                        ) : null;
                                    })()}
                                </div>
                                <div className="text-[11px] text-slate-400 dark:text-slate-500 font-medium leading-relaxed line-clamp-2">
                                    {w.summary}
                                </div>
                            </div>
                        </div>

                        <div className="mt-5 pt-4 border-t border-white/5 dark:border-slate-200/60 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <span className="w-1 h-1 rounded-full bg-slate-500" />
                                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.15em]">
                                    {new Date(w.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                {w.status !== 'success' && (
                                    <>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleAction(w.script_path, 'select'); }}
                                            className="w-10 h-10 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/5 text-indigo-500 hover:bg-indigo-500 hover:text-white transition-all flex items-center justify-center border border-indigo-500/20 hover:scale-105 active:scale-95 shadow-sm"
                                            title="Select Elements"
                                        >
                                            <FontAwesomeIcon icon={faMousePointer} className="text-sm" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleAction(w.script_path, 'isolate'); }}
                                            className="w-10 h-10 rounded-xl bg-amber-500/10 dark:bg-amber-500/5 text-amber-500 hover:bg-amber-500 hover:text-white transition-all flex items-center justify-center border border-amber-500/20 hover:scale-105 active:scale-95 shadow-sm"
                                            title="Isolate in View"
                                        >
                                            <FontAwesomeIcon icon={faEye} className="text-sm" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleAction(w.script_path, 'table'); }}
                                            className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/5 text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all flex items-center justify-center border border-emerald-500/20 hover:scale-105 active:scale-95 shadow-sm"
                                            title="Show in Table"
                                        >
                                            <FontAwesomeIcon icon={faTable} className="text-sm" />
                                        </button>
                                    </>
                                )}
                                {w.status === 'success' && (
                                    <div className="px-4 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[11px] font-bold uppercase tracking-widest border border-emerald-500/20 flex items-center gap-2">
                                        <FontAwesomeIcon icon={faCheckCircle} className="text-[11px]" />
                                        Clear
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
};
