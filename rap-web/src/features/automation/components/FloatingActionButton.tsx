import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faShieldHeart, faCheckCircle, faExclamationCircle, faTimesCircle, faChevronRight, faSpinner, faMousePointer, faEye, faTable, faExclamationTriangle, faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons';
import { useWatchdog } from '@/context/providers/WatchdogProvider';
import { useUI } from '@/hooks/useUI';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import api from '@/api/axios';
import { useContext } from 'react';
import type { Script, ScriptParameter } from '@/types/scriptModel';
import { ScriptContext } from '@/features/automation/store/ScriptContext';
import { ScriptExecutionContext } from '@/features/automation/store/ScriptExecutionContext';
import { SentinelControlList } from './SentinelControlList';
interface FloatingActionButtonProps {
  disabled?: boolean;
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({ disabled }) => {
  const { watchdogs, hasIssues, isWatchdogInitialized, isArmingWatchdogs, deployedDocumentMap } = useWatchdog();
  const scriptContext = useContext(ScriptContext);
  const scriptExecutionContext = useContext(ScriptExecutionContext);
  const { revitStatus } = useRevitStatus();
  const currentDocTitle = revitStatus.document ? revitStatus.document.split(/[\\/]/).pop() || null : null;

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

  const handleDetach = useCallback(async () => {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/window');
      const win = WebviewWindow.getByLabel('sentinel-control');
      if (win) {
        await win.show();
        await win.center();
        await win.setFocus();
        setIsOpen(false);
      } else {
        console.error("[SentinelControl] Pre-declared 'sentinel-control' window not found.");
      }
    } catch (err) {
      console.error("[SentinelControl] Failed to show sentinel window:", err);
    }
  }, []);

  // Check if the detached window is currently visible
  const isDetachedVisible = useCallback(async (): Promise<boolean> => {
    try {
      const { WebviewWindow } = await import('@tauri-apps/api/window');
      const win = WebviewWindow.getByLabel('sentinel-control');
      if (win) {
        return await win.isVisible();
      }
    } catch { }
    return false;
  }, []);

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
    if (disabled || isArmingWatchdogs || !isWatchdogInitialized) return;

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

  const handleFabClick = useCallback(async (e: React.MouseEvent) => {
    if (hasMoved.current || isArmingWatchdogs || !isWatchdogInitialized) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // If the detached window is visible, focus it instead of toggling the dropdown
    const detached = await isDetachedVisible();
    if (detached) {
      const { WebviewWindow } = await import('@tauri-apps/api/window');
      const win = WebviewWindow.getByLabel('sentinel-control');
      if (win) await win.setFocus();
      return;
    }

    setIsOpen(prev => !prev);
  }, [isArmingWatchdogs, isWatchdogInitialized, isDetachedVisible]);

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
    ? 'bg-amber-500 hover:bg-amber-600 animate-pulse'
    : !isWatchdogInitialized
      ? 'bg-gray-500 hover:bg-gray-600'
      : watchdogs.length === 0
        ? 'bg-gray-500 hover:bg-gray-600'
        : hasIssuesInternal
          ? 'bg-amber-500 hover:bg-amber-600 animate-pulse'
          : 'bg-green-500 hover:bg-green-600';

  const fabText = !isWatchdogInitialized
    ? "Loading..."
    : isArmingWatchdogs
      ? "Initializing..."
      : watchdogs.length === 0
        ? "Idle"
        : isHealthy
          ? "System Healthy"
          : `${watchdogs.length} Active`;

  const fabIcon = !isWatchdogInitialized || isArmingWatchdogs
    ? faSpinner
    : watchdogs.length === 0
      ? faShieldHeart
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
        {isOpen && !isArmingWatchdogs && isWatchdogInitialized && (
          <div className="absolute bottom-full right-0 mb-4 w-80 bg-slate-900/98 dark:bg-white/95 rounded-[2rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3)] border border-white/10 dark:border-slate-200/60 z-[100] overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 origin-bottom-right cursor-default backdrop-blur-3xl"
          >
            {/* Watchtower Header — acts as a drag handle (mouseDown propagates to parent for FAB dragging) */}
            <div
              className="p-6 pb-4 border-b border-white/5 dark:border-slate-100 relative overflow-hidden cursor-grab active:cursor-grabbing select-none flex items-center justify-between"
            >
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-blue-500/10 to-transparent opacity-50" />
              <h3 className="relative text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.25em] flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-pulse" />
                Sentinel Control
              </h3>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDetach();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="relative z-50 w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-blue-500 hover:bg-white/5 dark:hover:bg-slate-100 transition-all active:scale-95 group/detach"
                title="Detach Window"
              >
                <FontAwesomeIcon icon={faExternalLinkAlt} className="text-xs group-hover/detach:scale-110 transition-transform" />
              </button>
            </div>

            {/* Sentinel list — no extra scroll wrapper, SentinelControlList handles its own */}
            <div onMouseDown={(e) => e.stopPropagation()}>
              <SentinelControlList onDetach={handleDetach} />
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
