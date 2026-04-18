import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBolt, faTrash, faSpinner, faCheckCircle, faInfoCircle, faShieldHalved, faChartPie, faDisplay } from '@fortawesome/free-solid-svg-icons';
import api from '@/api/axios';
import { useNotifications } from '@/hooks/useNotifications';
import { isTelemetryEnabled, setTelemetryEnabled } from '@/utils/telemetry';
import { useUI } from '@/hooks/useUI';

export const AutomationSettings: React.FC = () => {
  const { showNotification } = useNotifications();
  const { showSentinelFAB, toggleSentinelFAB } = useUI();
  const [isClearing, setIsClearing] = useState(false);
  const [telemetryOptIn, setTelemetryOptIn] = useState(false);

  React.useEffect(() => {
    setTelemetryOptIn(isTelemetryEnabled());
  }, []);

  const handleTelemetryToggle = () => {
    const newState = !telemetryOptIn;
    setTelemetryOptIn(newState);
    setTelemetryEnabled(newState);
    if (!newState) {
      showNotification("Anonymous telemetry disabled.", "info");
    } else {
      showNotification("Usage telemetry enabled. Thank you for helping improve Paracore!", "success");
    }
  };

  const handleClearCache = async () => {
    setIsClearing(true);
    try {
      const response = await api.post('/api/scripts/clear-cache');
      if (response.data.is_success) {
        showNotification("Assembly cache purged successfully.", "success");
      } else {
        showNotification(response.data.message || "Failed to clear cache.", "error");
      }
    } catch (err: unknown) {
      console.error("[AutomationSettings] Error clearing cache:", err);
      showNotification("Failed to communicate with Paracore engine.", "error");
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* UI Experience Section */}
      <div className="space-y-2">
        <h3 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
          <FontAwesomeIcon icon={faDisplay} className="text-blue-500 text-sm" />
          Interface & Experience
        </h3>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed max-w-xl">
          Customize how Paracore's floating interface elements behave.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-white dark:bg-slate-900/40 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 p-6 shadow-sm group hover:border-blue-500/30 transition-all flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex gap-4 items-center flex-1">
            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500 shrink-0">
              <FontAwesomeIcon icon={faDisplay} className="text-xl" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">Show Sentinel FAB</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-lg">
                Display the floating elliptical button for quick access to Sentinel controls. Disable this if it blocks your workflow.
              </p>
            </div>
          </div>

          <button
            onClick={toggleSentinelFAB}
            className={`
              relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent 
              transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2
              ${showSentinelFAB ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}
            `}
            role="switch"
            aria-checked={showSentinelFAB}
          >
            <span
              aria-hidden="true"
              className={`
                pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 
                transition duration-200 ease-in-out
                ${showSentinelFAB ? 'translate-x-7' : 'translate-x-0'}
              `}
            />
          </button>
        </div>
      </div>

      <div className="space-y-2 pt-4">
        <h3 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
          <FontAwesomeIcon icon={faBolt} className="text-blue-500 text-sm" />
          Engine Performance
        </h3>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed max-w-xl">
          Manage the internal state of the Paracore scripting engine. These settings affect execution speed and memory usage.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Assembly Cache Management */}
        <div className="bg-white dark:bg-slate-900/40 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 p-6 shadow-sm group hover:border-blue-500/30 transition-all">
          <div className="flex items-start justify-between mb-4">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">Assembly Cache</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Paracore caches compiled C# scripts in memory for instant re-runs. 
                Clearing this will force all scripts to re-compile on their next execution.
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-500">
              <FontAwesomeIcon icon={faBolt} />
            </div>
          </div>

          <div className="flex items-center gap-4 mt-6">
            <button
              onClick={handleClearCache}
              disabled={isClearing}
              className="flex-grow md:flex-none px-6 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/20 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {isClearing ? (
                <FontAwesomeIcon icon={faSpinner} spin />
              ) : (
                <FontAwesomeIcon icon={faTrash} className="text-[10px]" />
              )}
              {isClearing ? 'Purging Cache...' : 'Clear Assembly Cache'}
            </button>
          </div>
        </div>

        {/* Technical Info Note */}
        <div className="flex gap-3 px-4 py-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl border border-blue-100/50 dark:border-blue-800/20">
          <FontAwesomeIcon icon={faInfoCircle} className="text-blue-400 text-xs mt-0.5" />
          <p className="text-[10px] font-bold text-blue-600/70 dark:text-blue-400/70 leading-relaxed uppercase tracking-wider">
            Tip: Code changes automatically invalidate specific cache entries. You only need to use this if you want to perform a complete engine reset without restarting Revit.
          </p>
        </div>

        {/* --- START TELEMETRY COMPONENT --- */}
        <div className="mt-8 space-y-2">
          <h3 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
            <FontAwesomeIcon icon={faShieldHalved} className="text-indigo-500 text-sm" />
            Analytics & Privacy
          </h3>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-relaxed max-w-xl">
            Control what data Paracore sends back to help improve the software.
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900/40 rounded-2xl border border-slate-200/60 dark:border-slate-800/60 p-6 shadow-sm group hover:border-indigo-500/30 transition-all flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex gap-4 items-center flex-1">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-500 shrink-0">
              <FontAwesomeIcon icon={faChartPie} className="text-xl" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">Share Anonymous Usage Data</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-lg">
                Help us improve Paracore by sharing crash reports and UI interaction metrics. 
                <strong className="dark:text-slate-300"> We DO NOT collect personal information, code, file paths, or Revit data.</strong>
              </p>
            </div>
          </div>

          <button
            onClick={handleTelemetryToggle}
            className={`
              relative inline-flex h-7 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent 
              transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2
              ${telemetryOptIn ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}
            `}
            role="switch"
            aria-checked={telemetryOptIn}
          >
            <span
              aria-hidden="true"
              className={`
                pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 
                transition duration-200 ease-in-out
                ${telemetryOptIn ? 'translate-x-7' : 'translate-x-0'}
              `}
            />
          </button>
        </div>
        {/* --- END TELEMETRY COMPONENT --- */}

      </div>
    </div>
  );
};

