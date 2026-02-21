import React, { useState } from 'react';
import { open } from '@tauri-apps/api/dialog';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolder, faTrash, faShieldHeart, faChevronRight, faChevronDown, faSpinner, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
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
    decommissionAll
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
        // V5: Only load sentinels and .wtools
        const sentinelsOnly = response.data.filter((s: Script) => s.metadata?.isWatchdog || s.metadata?.is_watchdog);
        setRootScripts(prev => ({ ...prev, [folder]: { data: sentinelsOnly, loading: false } }));
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
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Sentinel Settings</h3>
        {(watchdogSources.length > 0) && (
          <button
            onClick={() => setIsDecommissionModalOpen(true)}
            className="text-[9px] font-black text-rose-500 hover:text-rose-600 uppercase tracking-widest px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all"
          >
            Undeploy All
          </button>
        )}
      </div>

      <div className="space-y-4 mb-8 text-sm">
        <p className="text-gray-600 dark:text-gray-400">
          Add folders containing sentinel scripts. Scripts in these folders can be deployed to run as background monitors.
        </p>

        <div className="flex items-center space-x-3">
          <button onClick={handleAddFolder} className="px-4 py-2 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all">
            Add Sentinel Source
          </button>
          <button onClick={handleArmAll} className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition-all">
            Deploy All
          </button>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-slate-800 pb-2">Sentinel Sources</h4>
        {configuredWatchdogRoots.length > 0 ? (
          configuredWatchdogRoots.map((folder) => {
            const isExpanded = expandedRoots[folder];
            const scriptsState = rootScripts[folder];
            const scripts = scriptsState?.data || [];
            const armedCount = scripts.filter(s => watchdogSources.includes(normalize(s.absolutePath))).length;

            return (
              <div key={folder} className="bg-white dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                <div
                  className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                  onClick={() => toggleRootExpansion(folder)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FontAwesomeIcon icon={isExpanded ? faChevronDown : faChevronRight} className="text-[10px] text-slate-400 shrink-0" />
                    <FontAwesomeIcon icon={faFolder} className="text-amber-500 shrink-0" />
                    <div className="flex flex-col gap-1 min-w-0">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{folder}</span>
                      <span className="text-[10px] text-slate-400 tabular-nums">
                        {scriptsState?.loading ? 'Scanning...' : `${scripts.length} sentinels found · ${armedCount} deployed`}
                      </span>
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); removeConfiguredWatchdogRoot(folder); }} className="text-slate-400 hover:text-rose-500 p-2">
                    <FontAwesomeIcon icon={faTrash} />
                  </button>
                </div>

                {isExpanded && (
                  <div className="bg-slate-50/50 dark:bg-slate-900/20 border-t border-slate-100 dark:border-slate-800">
                    {scripts.map(s => {
                      const path = normalize(s.absolutePath);
                      const isArmed = watchdogSources.includes(path);
                      const status = getScriptStatus(path);
                      return (
                        <div key={path} className="px-6 py-3 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 last:border-0">
                          <div className="flex items-center gap-3">
                            <div className={`w-2 h-2 rounded-full ${isArmed ? (status?.type === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-rose-500 animate-pulse') : 'bg-slate-200 dark:bg-slate-700'}`} />
                            <div className="flex flex-col">
                              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">{s.name}</span>
                              {status?.summary && <span className="text-[9px] text-slate-400 uppercase tracking-tight">{status.summary}</span>}
                            </div>
                          </div>
                          <button
                            onClick={() => toggleScriptArm(path)}
                            className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all
                              ${isArmed ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 border border-amber-200 dark:border-amber-800' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600'}`}
                          >
                            {isArmed ? 'DEPLOYED' : 'DEPLOY'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="py-12 text-center bg-slate-50 dark:bg-slate-900/20 rounded-2xl border-2 border-dashed border-slate-100 dark:border-slate-800">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">No sentinel sources added yet.</span>
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
