import React, { useState } from 'react';
import { open } from '@tauri-apps/api/dialog';
import { useScripts } from '@/features/automation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolder, faTrash, faShieldHeart, faChevronRight, faChevronDown, faSpinner, faCheckCircle } from '@fortawesome/free-solid-svg-icons';
import { Script } from '@/types/scriptModel';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';
import { useWatchdog } from '@/context/providers/WatchdogProvider';

interface WatchdogSettingsProps {
  isAuthenticated: boolean;
}

export const WatchdogSettings: React.FC<WatchdogSettingsProps> = ({ isAuthenticated }) => {
  const {
    configuredWatchdogRoots,
    addConfiguredWatchdogRoot,
    removeConfiguredWatchdogRoot,
    watchdogSources,
    setWatchdogSources
  } = useScripts();
  const { showNotification } = useNotifications();
  const { watchdogs, failedWatchdogs } = useWatchdog();

  // Local state for fetching scripts *independently* of the main context
  const [expandedRoots, setExpandedRoots] = useState<Record<string, boolean>>({});
  const [rootScripts, setRootScripts] = useState<Record<string, { data: Script[], loading: boolean, error: boolean }>>({});

  const normalize = (path: string) => path.replace(/\\/g, '/').toLowerCase();

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
      // Load scripts for this folder
      setRootScripts(prev => ({ ...prev, [folder]: { data: [], loading: true, error: false } }));
      try {
        const response = await api.get(`/api/scripts?folderPath=${encodeURIComponent(folder)}`);
        const scripts: Script[] = response.data;
        setRootScripts(prev => ({ ...prev, [folder]: { data: scripts, loading: false, error: false } }));

        // JIT Migration: If the ROOT itself is armed, explode it to these scripts now
        const normFolder = normalize(folder);
        if (watchdogSources.some(s => normalize(s) === normFolder)) {
          console.log("[WatchdogSettings] JIT Migration: Converting bulk-armed root to granular projects.");

          // 1. Unregister Root
          try { await api.post("/api/watchdogs/unregister-source", { path: folder }); } catch (e) { };

          // 2. Register All Children
          for (const script of scripts) {
            try { await api.post("/api/watchdogs/register-source", { path: script.absolutePath }); } catch (e) { };
          }

          // 3. Update State: Remove Root, Add Children
          setWatchdogSources(prev => {
            const withoutRoot = prev.filter(s => normalize(s) !== normFolder);
            const withChildren = [...withoutRoot, ...scripts.map(s => s.absolutePath)];
            // Dedup
            return Array.from(new Set(withChildren));
          });

          showNotification(`Migrated ${scripts.length} watchdogs to granular control.`, "success");
        }

      } catch (err) {
        console.error(err);
        setRootScripts(prev => ({ ...prev, [folder]: { data: [], loading: false, error: true } }));
        showNotification("Failed to load scripts for this source.", "error");
      }
    }
  };

  const toggleScriptArm = async (scriptPath: string) => {
    const normPath = normalize(scriptPath);
    const isArmed = watchdogSources.some(s => normalize(s) === normPath);

    if (isArmed) {
      // Disarm
      const newSources = watchdogSources.filter(s => normalize(s) !== normPath);
      setWatchdogSources(newSources); // Optimistic update

      try {
        await api.post("/api/watchdogs/unregister-source", { path: scriptPath });
        showNotification("Watchdog disarmed.", "info");
      } catch (err) {
        console.error(err);
        setWatchdogSources(watchdogSources); // Revert
        showNotification("Failed to disarm watchdog.", "error");
      }
    } else {
      // Arm
      const newSources = [...watchdogSources, scriptPath];
      setWatchdogSources(newSources); // Optimistic update

      try {
        const response = await api.post("/api/watchdogs/register-source", { path: scriptPath });
        if (response.data.is_success) {
          // Check if it was actually registered
          if (response.data.watchdogs_registered === 0) {
            showNotification("No valid watchdog logic found in this script.", "warning");
            // Optional: Revert if we strictly want only valid watchdogs in the list
            // But keeping it allows 'intent' to arm even if currently invalid
          } else {
            showNotification("Watchdog armed successfully.", "success");
          }
        } else {
          throw new Error(response.data.error_message);
        }
      } catch (err: any) {
        console.error(err);
        setWatchdogSources(watchdogSources); // Revert
        showNotification(err.message || "Failed to arm watchdog.", "error");
      }
    }
  };

  const handleAddFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
    });

    if (typeof selected === 'string') {
      const path = selected as string;
      // Just add to configuration, don't auto-arm
      addConfiguredWatchdogRoot(path);
      // Auto-expand to show scripts
      toggleRootExpansion(path);
    }
  };

  const handleRemoveSource = async (path: string) => {
    // 1. Unregister ALL children that are armed?
    // We should probably check if any scripts in this root are armed.
    // For simplicity, we just remove the root configuration.
    // The separate 'watchdogSources' list still holds the armed definitions.
    // Ideally we should cleanup.

    // Let's iterate watchdogSources and remove any that start with this path
    const normRoot = normalize(path) + '/'; // Ensure trailing slash for prefix check
    const relatedSources = watchdogSources.filter(s => normalize(s).startsWith(normRoot) || normalize(s) === normalize(path));

    if (relatedSources.length > 0) {
      // Unregister them
      for (const src of relatedSources) {
        try { await api.post("/api/watchdogs/unregister-source", { path: src }); } catch (e) { }
      }
      // Update state
      setWatchdogSources(prev => prev.filter(s => !relatedSources.includes(s)));
    }

    removeConfiguredWatchdogRoot(path);
    showNotification("Source folder removed.", "info");
  };

  return (
    <fieldset disabled={!isAuthenticated} className="disabled:opacity-50">
      <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Watchdog Settings</h3>

      <div className="space-y-4 mb-8 text-sm">
        <p className="text-gray-600 dark:text-gray-400">
          Designate <strong>Watchdog Sources</strong> to enable autonomous background monitoring. Any script projects found in these folders that utilize the Watchdog API can be armed individually.
        </p>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleAddFolder}
            className="px-4 py-2 bg-blue-500 text-white text-sm font-semibold rounded-md shadow-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
          >
            Add Watchdog Source
          </button>
        </div>
      </div>

      <div>
        <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4 border-b border-gray-100 dark:border-gray-700 pb-2">Active Watchdog Sources</h4>
        <ul className="space-y-3">
          {configuredWatchdogRoots && configuredWatchdogRoots.length > 0 ? (
            configuredWatchdogRoots.map((folder: string, index: number) => {
              const isExpanded = expandedRoots[folder];
              const scriptsState = rootScripts[folder];
              const isLoading = scriptsState?.loading;
              const hasError = scriptsState?.error;
              const scripts = scriptsState?.data || [];
              const armedCount = scripts.filter(s => watchdogSources.some(w => normalize(w) === normalize(s.absolutePath))).length;

              return (
                <li key={index} className="flex flex-col bg-white dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700/50 shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    onClick={() => toggleRootExpansion(folder)}
                  >
                    <div className="flex items-center min-w-0 mr-4">
                      <div className={`p-1 mr-3 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                        <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
                      </div>
                      <FontAwesomeIcon icon={faFolder} className="h-5 w-5 text-amber-500 mr-3 shrink-0" />
                      <div className="flex flex-col min-w-0">
                        <span className="text-[13px] font-medium text-gray-700 dark:text-gray-300 truncate">{folder}</span>
                        <span className="text-[11px] text-gray-400">
                          {isLoading ? 'Loading projects...' : `${scripts.length} projects found • ${armedCount} armed`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRemoveSource(folder); }}
                        className="p-2 rounded-lg text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 transition-colors"
                        title="Remove Source"
                      >
                        <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Scripts List */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-900/30">
                      {isLoading && (
                        <div className="p-4 text-center text-gray-400 text-xs">
                          <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
                          Scanning for projects...
                        </div>
                      )}
                      {hasError && (
                        <div className="p-4 text-center text-red-400 text-xs">
                          Failed to load projects from this folder.
                        </div>
                      )}
                      {!isLoading && !hasError && scripts.length === 0 && (
                        <div className="p-4 text-center text-gray-400 text-xs">
                          No projects found in this folder.
                        </div>
                      )}
                      {!isLoading && scripts.length > 0 && (
                        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                          {scripts.map(script => {
                            const isArmed = watchdogSources.some(w => normalize(w) === normalize(script.absolutePath));
                            const status = getScriptStatus(script.absolutePath);

                            return (
                              <li key={script.id} className="flex items-center justify-between px-4 py-2 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-colors">
                                <div className="flex items-center gap-3">
                                  <div className={`w-2 h-2 rounded-full flex items-center justify-center ${isArmed
                                    ? (status?.type === 'active' ? (status.status === 'error' ? 'bg-red-500' : 'bg-green-500')
                                      : status?.type === 'failed' ? 'bg-red-500' : 'bg-gray-300 animate-pulse')
                                    : 'bg-gray-300 dark:bg-gray-600'
                                    }`} title={status?.type === 'failed' ? status.error : status?.summary}>
                                  </div>
                                  <div className="flex flex-col">
                                    <span className="text-xs font-mono text-gray-600 dark:text-gray-400">{script.name}</span>
                                    {isArmed && status?.type === 'failed' && (
                                      <span className="text-[10px] text-red-500 font-bold" title={status.error}>Failed: {status.error}</span>
                                    )}
                                    {isArmed && !status && (
                                      <span className="text-[10px] text-gray-400 italic">Pending...</span>
                                    )}
                                  </div>
                                </div>
                                <button
                                  onClick={() => toggleScriptArm(script.absolutePath)}
                                  className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${isArmed
                                    ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-200 dark:border-orange-800"
                                    : "bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 border border-transparent"
                                    }`}
                                >
                                  <FontAwesomeIcon icon={isArmed ? faShieldHeart : faCheckCircle} className={isArmed ? "animate-pulse" : ""} />
                                  {isArmed ? "ARMED" : "ARM"}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              );
            })
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8 bg-gray-50 dark:bg-gray-900/20 rounded-xl border border-dashed border-gray-200 dark:border-gray-800">
              No local script sources have been added yet.
            </p>
          )}
        </ul>
      </div>
    </fieldset>
  );
};
