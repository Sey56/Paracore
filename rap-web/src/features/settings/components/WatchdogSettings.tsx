import React, { useState } from 'react';
import { open } from '@tauri-apps/api/dialog';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolder, faTrash, faShieldHeart, faChevronRight, faChevronDown, faSpinner, faCheckCircle, faMousePointer, faEye, faGlobe } from '@fortawesome/free-solid-svg-icons';
import { Script } from '@/types/scriptModel';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';
import { useWatchdog } from '@/context/providers/WatchdogProvider';
import { ConfirmActionModal } from '@/features/automation/components/ScriptInspector/ConfirmActionModal';

interface WatchdogSettingsProps {
  isAuthenticated: boolean;
}

export const WatchdogSettings: React.FC<WatchdogSettingsProps> = ({ isAuthenticated }) => {
  const {
    configuredWatchdogRoots,
    watchdogSources,
    watchdogs,
    failedWatchdogs,
    addConfiguredWatchdogRoot,
    removeConfiguredWatchdogRoot,
    toggleScriptArm,
    armAllInList,
    decommissionAll,
    executeSentinelAction
  } = useWatchdog();

  const { showNotification } = useNotifications();

  const [isDecommissionModalOpen, setIsDecommissionModalOpen] = useState(false);
  const [expandedRoots, setExpandedRoots] = useState<Record<string, boolean>>({});
  const [rootScripts, setRootScripts] = useState<Record<string, { data: Script[], loading: boolean }>>({});

  const normalize = (path: string) => (path || "").replace(/\\/g, '/').toLowerCase().trim();

  const getScriptStatus = (path: string) => {
    const normPath = normalize(path);
    const active = watchdogs.find(w => normalize(w.script_path) === normPath);
    if (active) return { type: 'active', status: active.status, summary: active.summary };

    const failed = failedWatchdogs.find(f => normalize(f.script_path) === normPath);
    if (failed) return { type: 'failed', error: failed.error_message };

    return null;
  };

  const toggleRootExpansion = async (folder: string) => {
    const isExpanded = expandedRoots[folder];
    setExpandedRoots(prev => ({ ...prev, [folder]: !isExpanded }));

    if (!isExpanded && !rootScripts[folder]?.data) {
      setRootScripts(prev => ({ ...prev, [folder]: { data: [], loading: true } }));
      try {
        const response = await api.get(`/api/scripts?folderPath=${encodeURIComponent(folder)}`);
        setRootScripts(prev => ({ ...prev, [folder]: { data: response.data, loading: false } }));
      } catch (err) {
        setRootScripts(prev => ({ ...prev, [folder]: { data: [], loading: false } }));
        showNotification("Failed to load scripts for this source.", "error");
      }
    }
  };

  const handleAddFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === 'string') {
      addConfiguredWatchdogRoot(selected);
      toggleRootExpansion(normalize(selected));
    }
  };

  const handleArmAll = async () => {
    const allScripts = Object.values(rootScripts).flatMap(r => r.data).map(s => s.absolutePath);
    if (allScripts.length === 0) {
      showNotification("No scripts found to arm.", "warning");
      return;
    }
    await armAllInList(allScripts);
  };

  return (
    <fieldset disabled={!isAuthenticated} className="disabled:opacity-50">
      <div className="mb-8">
        <h3 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">Sentinel Settings</h3>
      </div>

      <div className="space-y-6 mb-12">
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed max-w-xl">
          Add folders containing sentinel scripts. Scripts in these folders can be armed to run as background monitors.
        </p>

        <div className="flex items-center gap-4">
          <button
            onClick={handleAddFolder}
            className="px-6 py-3 bg-indigo-600 text-white text-[11px] font-bold uppercase tracking-widest rounded-xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 transition-all hover:scale-[1.02] active:scale-95 flex items-center gap-2"
          >
            Add Source
          </button>
          <button
            onClick={handleArmAll}
            className="px-6 py-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold uppercase tracking-widest rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95"
          >
            Deploy All
          </button>
          {(watchdogSources.length > 0) && (
            <button
              onClick={() => setIsDecommissionModalOpen(true)}
              className="px-6 py-3 bg-white dark:bg-slate-800 text-rose-500 dark:text-rose-400 text-[11px] font-bold uppercase tracking-widest rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all active:scale-95"
            >
              Undeploy All
            </button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-4">Sentinel Sources</h4>
        {configuredWatchdogRoots.length > 0 ? (
          configuredWatchdogRoots.map((folder) => {
            const isExpanded = expandedRoots[folder];
            const scriptsState = rootScripts[folder];
            const scripts = scriptsState?.data || [];
            const armedCount = scripts.filter(s => watchdogSources.includes(normalize(s.absolutePath))).length;

            return (
              <div key={folder} className="bg-white dark:bg-slate-900/40 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 overflow-hidden shadow-sm hover:border-indigo-500/30 transition-all group animate-in zoom-in-95 duration-500">
                <div
                  className={`p-6 flex items-center justify-between cursor-pointer transition-colors ${isExpanded ? 'bg-slate-50/50 dark:bg-slate-800/20' : 'hover:bg-slate-50/30 dark:hover:bg-slate-800/10'}`}
                  onClick={() => toggleRootExpansion(folder)}
                >
                  <div className="flex items-center gap-5 min-w-0">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all ${isExpanded ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-slate-50 dark:bg-slate-800 text-slate-400'}`}>
                      <FontAwesomeIcon icon={isExpanded ? faChevronDown : faChevronRight} className="text-[10px]" />
                    </div>
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <div className="flex items-center space-x-2 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800/50 border border-slate-200/50 dark:border-slate-700/30 w-fit max-w-full">
                        <FontAwesomeIcon icon={faGlobe} className="text-[10px] text-slate-400 flex-shrink-0" />
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 truncate italic">
                          {folder}
                        </span>
                      </div>
                      <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">
                        {scriptsState?.loading ? 'Scanning...' : `${scripts.length} scripts found · ${armedCount} deployed`}
                      </span>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); removeConfiguredWatchdogRoot(folder); }} className="w-10 h-10 rounded-lg flex items-center justify-center text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all opacity-0 group-hover:opacity-100">
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>

                {isExpanded && (
                  <div className="px-6 py-6 bg-slate-50/20 dark:bg-slate-900/10 border-t border-slate-100 dark:border-slate-800 space-y-3 animate-in slide-in-from-top-4 duration-500">
                    {scripts.map(s => {
                      const path = normalize(s.absolutePath);
                      const isArmed = watchdogSources.includes(path);
                      const status = getScriptStatus(path);
                      return (
                        <div key={path} className="px-6 py-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800/60 rounded-xl flex items-center justify-between hover:border-indigo-500/20 transition-all shadow-sm">
                          <div className="flex items-center gap-4">
                            <div className={`w-2.5 h-2.5 rounded-full relative ${isArmed ? (status?.type === 'active' ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]' : 'bg-rose-500 animate-pulse') : 'bg-slate-200 dark:bg-slate-800'}`}>
                              {isArmed && status?.type === 'active' && <div className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-20"></div>}
                            </div>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                {s.name.replace(/\.(wtool|ptool|cs)$/i, '')}
                              </span>
                              {status?.summary && (
                                <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500 tracking-tight leading-tight">
                                  {status.summary}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isArmed && (
                              <>
                                <button
                                  onClick={() => executeSentinelAction(path, 'Select')}
                                  className="w-8 h-8 rounded-lg bg-indigo-600/10 text-indigo-500 hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center border border-indigo-500/10"
                                  title="Select Elements"
                                >
                                  <FontAwesomeIcon icon={faMousePointer} className="text-[10px]" />
                                </button>
                                <button
                                  onClick={() => executeSentinelAction(path, 'Isolate')}
                                  className="w-8 h-8 rounded-lg bg-amber-600/10 text-amber-500 hover:bg-amber-600 hover:text-white transition-all flex items-center justify-center border border-amber-500/10"
                                  title="Isolate Elements"
                                >
                                  <FontAwesomeIcon icon={faEye} className="text-[10px]" />
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => toggleScriptArm(path)}
                              className={`px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all active:scale-95
                                ${isArmed ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 border border-amber-200 dark:border-amber-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 hover:text-indigo-600 border border-transparent hover:border-indigo-100'}`}
                            >
                              {isArmed ? 'Deployed' : 'Deploy'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="py-20 text-center bg-white dark:bg-slate-900/20 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-800/60 animate-in zoom-in-95 duration-700">
            <FontAwesomeIcon icon={faShieldHeart} className="text-slate-200 dark:text-slate-700 text-4xl mb-6" />
            <br />
            <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">No sentinel sources added yet.</span>
          </div>
        )}
      </div>

      <ConfirmActionModal
        isOpen={isDecommissionModalOpen}
        onClose={() => setIsDecommissionModalOpen(false)}
        onConfirm={decommissionAll}
        title="Undeploy All Sentinels"
        message="This will undeploy all sentinels and clear your active registry. Proceed?"
        confirmButtonText="Undeploy All"
        confirmButtonColor="red"
      />
    </fieldset>
  );
};
