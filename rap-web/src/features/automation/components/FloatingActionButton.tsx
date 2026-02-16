import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldAlt, faCheckCircle, faExclamationCircle, faTimesCircle, faChevronRight, faSpinner } from '@fortawesome/free-solid-svg-icons';
import { useWatchdog } from '@/context/providers/WatchdogProvider';
import { useUI } from '@/hooks/useUI';
import { useScripts } from '../hooks/useScripts'; // Import useScripts to get isArmingWatchdogs

interface FloatingActionButtonProps {
  disabled?: boolean;
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({ disabled }) => {
  const { watchdogs, hasIssues, isWatchdogInitialized } = useWatchdog(); // Get isWatchdogInitialized
  const { isArmingWatchdogs } = useScripts(); // Get isArmingWatchdogs from useScripts
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
      default: return faShieldAlt;
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
      : faShieldAlt;

  return (
    <div
      ref={fabRef}
      className="fixed bottom-6 right-6 z-50 transition-none"
      style={{ transform: `translate(${position.x}px, ${position.y}px)`, cursor: isDragging ? 'grabbing' : 'grab' }}
      onMouseDown={handleMouseDown}
    >
      <div className="relative" ref={dropdownRef}>
        {/* Dropdown Menu (Pop-upwards) */}
        {isOpen && !isArmingWatchdogs && isWatchdogInitialized && ( // Only show dropdown if not arming and initialized
          <div className="absolute bottom-full left-0 mb-4 w-80 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-bottom-left cursor-default"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-50 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Model Health Monitor</h3>
            </div>

            <div className="max-h-96 overflow-y-auto custom-scrollbar">
              {watchdogs.length === 0 ? (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400 flex flex-col items-center">
                  <FontAwesomeIcon icon={faCheckCircle} className="text-4xl text-green-500 mb-2 opacity-50" />
                  <span className="text-xs font-medium">No watchdogs configured or running.</span>
                </div>
              ) : (
                watchdogs.map((w, idx) => (
                  <div key={idx} className="p-4 border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <FontAwesomeIcon icon={getStatusIcon(w.status)} className={`${getStatusColor(w.status)} mt-0.5 text-base`} />
                        <div>
                          <div className="text-xs font-bold text-gray-900 dark:text-gray-100">{w.script_name}</div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 font-medium leading-relaxed">{w.summary}</div>
                        </div>
                      </div>
                      <button className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-blue-500 transition-all">
                        <FontAwesomeIcon icon={faChevronRight} className="text-[10px]" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[8px] font-bold text-gray-400 uppercase tracking-tighter">
                      <span>Last Run: {new Date(w.timestamp).toLocaleTimeString()}</span>
                      {w.status !== 'success' && <span className="px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300">Action Required</span>}
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
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full shadow-lg transition-all duration-300 
            ${fabColorClass} ${disabled ? 'bg-gray-400 cursor-not-allowed' : ''}`}
          onClick={handleFabClick}
          disabled={disabled || isArmingWatchdogs || !isWatchdogInitialized}
          title={isArmingWatchdogs || !isWatchdogInitialized ? "Watchdogs Initializing..." : "BIM Watchdog Status (Drag to move)"}
        >
          <FontAwesomeIcon icon={fabIcon} className={`text-base text-white ${isArmingWatchdogs || !isWatchdogInitialized ? 'animate-spin' : ''}`} />
          <span className="text-[10px] font-black uppercase tracking-tight text-white">
            {fabText}
          </span>
        </button>
      </div>
    </div>
  );
};
