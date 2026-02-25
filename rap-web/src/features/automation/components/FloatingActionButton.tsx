import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldHeart, faCheckCircle, faExclamationCircle, faTimesCircle, faChevronRight, faSpinner, faMousePointer, faEye, faTable } from '@fortawesome/free-solid-svg-icons';
import { useWatchdog } from '@/context/providers/WatchdogProvider';
import { useUI } from '@/hooks/useUI';
import api from '@/api/axios';
import { useContext } from 'react';
import type { Script, ScriptParameter } from '@/types/scriptModel';
import { ScriptContext } from '@/features/automation/store/ScriptContext';
import { ScriptExecutionContext } from '@/features/automation/store/ScriptExecutionContext';
interface FloatingActionButtonProps {
  disabled?: boolean;
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({ disabled }) => {
  const { watchdogs, hasIssues, isWatchdogInitialized, isArmingWatchdogs } = useWatchdog();
  const scriptContext = useContext(ScriptContext);
  const scriptExecutionContext = useContext(ScriptExecutionContext);

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fabRef = useRef<HTMLDivElement>(null);

  // Drag State
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 }); // Transform offset
  const dragStartPos = useRef({ x: 0, y: 0 });
  const initialTransform = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  const { toggleInspector } = useUI();

  const normalize = (p: string) => (p || "").replace(/\\/g, '/').toLowerCase().trim();

  const handleAction = useCallback(async (scriptPath: string, action: string) => {
    try {
      let s: Script | undefined = scriptContext?.scripts.find((scriptItem: Script) => normalize(scriptItem.absolutePath) === normalize(scriptPath));

      // If the script is NOT in the gallery context, dynamically fetch its complete structure
      if (!s) {
        const response = await api.get(`/api/script-details?scriptPath=${encodeURIComponent(scriptPath)}`);
        s = response.data as Script;
      }

      if (s && scriptExecutionContext) {
        // Set the script active so the inspector populates
        await scriptExecutionContext.setSelectedScript(s, 'user');

        let execParams = scriptExecutionContext.userEditedScriptParameters[s.id] || s.parameters;

        // Fetch exactly what the background watcher sees
        const watchdog = watchdogs.find(w => normalize(w.script_path) === normalize(scriptPath));
        if (watchdog?.parameters_json) {
          try {
            const parsed = JSON.parse(watchdog.parameters_json);
            if (Array.isArray(parsed)) {
              execParams = parsed;
            } else if (typeof parsed === 'object' && parsed !== null) {
              // The backend snapshot is a Dictionary (key-value pair). 
              if (execParams && Array.isArray(execParams) && execParams.length > 0) {
                // Map values over the existing schema array if it exists.
                execParams = execParams.map((p: ScriptParameter) => {
                  if (parsed[p.name] !== undefined) {
                    return { ...p, value: parsed[p.name] };
                  }
                  return p;
                });
              } else {
                // We don't have the UI parameter schema loaded. Synthesize the bare minimum structure expected by the execution backend.
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
            console.warn("[Watchtower] Failed to parse parameters_json", e);
          }
        }

        // Add the requested action so the C# Sentinel logic can pivot (Select, Isolate, Table)
        const paramAction: ScriptParameter = {
          name: '__sentinel_action__',
          value: action,
          type: 'string',
          defaultValue: action,
          required: true,
          options: []
        };
        execParams = [paramAction, ...execParams];

        // Execute exactly like the "Run" button but substituting tracked parameters
        scriptExecutionContext.runScript(s, execParams);
      }
    } catch (error) {
      console.error("[Watchtower] Failed to fetch or execute ad-hoc script:", error);
    }
  }, [scriptContext, scriptExecutionContext]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled || isArmingWatchdogs || !isWatchdogInitialized) return; // Disable dragging during arming/initialization

    setIsDragging(true);
    hasMoved.current = false;
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    initialTransform.current = { ...position };

    // Prevent text selection
    e.preventDefault();
  }, [disabled, position, isArmingWatchdogs, isWatchdogInitialized]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      hasMoved.current = true;
    }

    setPosition({
      x: initialTransform.current.x + dx,
      y: initialTransform.current.y + dy
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleFabClick = useCallback((e: React.MouseEvent) => {
    if (hasMoved.current || isArmingWatchdogs || !isWatchdogInitialized) { // Disable clicking during arming/initialization
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    setIsOpen(prev => !prev);
  }, [isArmingWatchdogs, isWatchdogInitialized]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-green-500';
      case 'warning': return 'text-amber-500';
      case 'error': return 'text-red-500';
      default: return 'text-gray-400';
    }
  };

  const hasIssuesInternal = watchdogs.length > 0 && hasIssues;
  const isHealthy = watchdogs.length === 0 || !hasIssues;

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return faCheckCircle;
      case 'warning': return faExclamationCircle;
      case 'error': return faTimesCircle;
      default: return faShieldHeart;
    }
  };

  const fabColorClass = isArmingWatchdogs
    ? 'bg-amber-500 hover:bg-amber-600 animate-pulse' // Amber pulsating during active arming (High Priority)
    : !isWatchdogInitialized
      ? 'bg-gray-500 hover:bg-gray-600' // Neutral gray during initial loading
      : hasIssuesInternal
        ? 'bg-amber-500 hover:bg-amber-600 animate-pulse' // Amber for warnings/errors
        : 'bg-green-500 hover:bg-green-600'; // Green for healthy

  const fabText = !isWatchdogInitialized
    ? "Loading..."
    : isArmingWatchdogs
      ? "Initializing..."
      : isHealthy
        ? "System Healthy"
        : `${watchdogs.length} Active`;

  const fabIcon = !isWatchdogInitialized || isArmingWatchdogs
    ? faSpinner // Spinner during loading or arming
    : isHealthy
      ? faCheckCircle
      : faShieldHeart;

  return (
    <div
      ref={fabRef}
      className="fixed bottom-6 right-6 z-50 transition-none"
      style={{ transform: `translate(${position.x}px, ${position.y}px)`, cursor: isDragging ? 'grabbing' : 'grab' }}
      onMouseDown={handleMouseDown}
    >
      <div className="relative" ref={dropdownRef}>
        {/* Dropdown Menu (Pop-upwards and to the Left) */}
        {isOpen && !isArmingWatchdogs && isWatchdogInitialized && ( // Only show dropdown if not arming and initialized
          <div className="absolute bottom-full right-0 mb-4 w-80 bg-slate-900/98 dark:bg-white/95 rounded-[2rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] border border-white/10 dark:border-slate-200/60 z-[100] overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 origin-bottom-right cursor-default backdrop-blur-3xl"
          >
            {/* Watchtower Header — acts as a drag handle (mouseDown propagates to parent) */}
            <div className="p-6 pb-4 border-b border-white/5 dark:border-slate-100 relative overflow-hidden cursor-grab active:cursor-grabbing select-none">
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-500/10 to-transparent opacity-50" />
              <h3 className="relative text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.25em] flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-pulse" />
                Sentinel Control
              </h3>
            </div>

            <div className="max-h-[32rem] overflow-y-auto custom-scrollbar p-4 space-y-3"
              onMouseDown={(e) => e.stopPropagation()}
            >
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
                        <div className="text-sm font-bold text-slate-100 dark:text-slate-800 leading-tight tracking-tight mb-0.5">
                          {w.script_name.replace(/\.(wtool|ptool|cs)$/i, '')}
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
          </div>
        )}

        {/* FAB Button */}
        <button
          id="fab"
          className={`flex items-center gap-2.5 pl-4 pr-5 py-2.5 rounded-full shadow-xl transition-all duration-300 hover:scale-105 active:scale-95
            ${fabColorClass} ${disabled ? 'bg-gray-400 cursor-not-allowed' : ''}`}
          onClick={handleFabClick}
          disabled={disabled || isArmingWatchdogs || !isWatchdogInitialized}
          style={{ animationDuration: '4s' }}
          title={isArmingWatchdogs || !isWatchdogInitialized ? "Sentinels Initializing..." : "Sentinel System Status (Drag to move)"}
        >
          <div className="relative">
            <FontAwesomeIcon icon={fabIcon} className={`text-base text-white ${isArmingWatchdogs || !isWatchdogInitialized ? 'animate-spin' : ''}`} />
            {!isHealthy && !isArmingWatchdogs && (
              <div
                className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-amber-500 animate-ping"
                style={{ animationDuration: '3s' }}
              />
            )}
          </div>
          <span className="text-[11px] font-bold tracking-normal text-white">
            {fabText}
          </span>
        </button>
      </div>
    </div>
  );
};
