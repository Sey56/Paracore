import React, { useRef, useLayoutEffect } from 'react';
import { Script } from '@/types/scriptModel';
import { ScriptCard } from '../../ScriptCard/ScriptCard';
import styles from '../ScriptGallery.module.css';
import { 
  useExecutionState, 
  useScriptSelection, 
  useScriptData 
} from '../../../hooks/useScriptExecution';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { useWatchdog } from '@/context/providers/WatchdogProvider';
import { useScripts } from '../../../hooks/useScripts';
import { filterVisibleParameters, validateParameters } from '@/utils/parameterVisibility';
import { useAuth } from '@/features/auth';

interface FocusOverlayProps {
  script: Script;
  sourceRect: DOMRect | null;
  onExit: () => void;
  isFromActiveSource: boolean;
  targetElement: HTMLElement | null;
}

export const FocusOverlay: React.FC<FocusOverlayProps> = ({ 
  script, 
  sourceRect, 
  onExit, 
  isFromActiveSource, 
  targetElement 
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  
  // V12: Pull all volatile context to calculate props for focused card
  const { runningScriptPath } = useExecutionState();
  const { selectedScript } = useScriptSelection();
  const { userEditedScriptParameters } = useScriptData();
  const { ParacoreConnected, revitStatus } = useRevitStatus();
  const { watchdogs } = useWatchdog();
  const { isSyncActive } = useScripts();
  const { isAuthenticated } = useAuth();

  // Helper to calculate props (identical to ScriptGrid logic)
  const getScriptProps = (s: Script) => {
    const isSelected = selectedScript?.id?.toLowerCase().replace(/\\/g, '/') === s.id?.toLowerCase().replace(/\\/g, '/');
    const isRunning = runningScriptPath === s.id;
    
    const path = (s.absolutePath || s.id || s.name || "").toLowerCase().replace(/\\/g, '/');
    const isWTool = path.endsWith('.wtool') || path.includes('.wtool/');
    const isPTool = path.endsWith('.ptool') || path.includes('.ptool/');
    
    const isGuard = s.metadata?.isWatchdog === true ||
      s.metadata?.is_watchdog === true ||
      (s.metadata as any)?.IsWatchdog === true ||
      path.endsWith('.wtool') ||
      path.includes('.wtool');

    const isArmed = isGuard && watchdogs.some(w => w.script_path.toLowerCase().replace(/\\/g, '/') === path);
    const isActiveInIDE = isSyncActive(s.absolutePath);

    const requiredDocType = s.metadata.documentType || 'Any';
    const currentDocType = revitStatus?.documentType || 'Any';

    const isCompatibleWithDocument = !ParacoreConnected || revitStatus?.document === null || requiredDocType === 'Any' || currentDocType === 'Any' || requiredDocType.toLowerCase() === currentDocType.toLowerCase();

    const currentParams = userEditedScriptParameters[s.id] || s.parameters || [];
    const visibleParameters = filterVisibleParameters(currentParams);
    const validationErrors = validateParameters(visibleParameters);

    const isRunButtonDisabled = !ParacoreConnected || !isCompatibleWithDocument || isRunning || validationErrors.length > 0 || !isAuthenticated;

    const tooltipMessage = !isAuthenticated
      ? "Please sign in to run scripts"
      : !ParacoreConnected
        ? "Paracore is disconnected"
        : revitStatus?.document === null
          ? "No document opened in Revit"
          : !isCompatibleWithDocument
            ? `Script requires '${requiredDocType}' but current is '${currentDocType}'`
            : validationErrors.length > 0
              ? validationErrors.join('\n')
              : "";

    return {
      isRunning,
      isSelected,
      isArmed,
      isActiveInIDE,
      isRunButtonDisabled,
      tooltipMessage
    };
  };

  const statusProps = getScriptProps(script);

  // 1. Position & Resize Logic
  useLayoutEffect(() => {
    if (!targetElement || !wrapperRef.current) return;

    const updatePosition = () => {
      const rect = targetElement.getBoundingClientRect();
      if (wrapperRef.current) {
        wrapperRef.current.style.top = `${rect.top}px`;
        wrapperRef.current.style.left = `${rect.left}px`;
        wrapperRef.current.style.width = `${rect.width}px`;
        wrapperRef.current.style.height = `${rect.height}px`;
      }
    };

    updatePosition();

    const observer = new ResizeObserver(updatePosition);
    observer.observe(targetElement);
    window.addEventListener('resize', updatePosition);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updatePosition);
    };
  }, [targetElement]);

  // 2. Scroll Initialization
  useLayoutEffect(() => {
    if (!overlayRef.current) return;
    overlayRef.current.scrollTop = 80;
  }, []);

  // 3. FLIP Animation
  useLayoutEffect(() => {
    if (!containerRef.current || !sourceRect) return;

    const animationFrame = requestAnimationFrame(() => {
      if (!containerRef.current || !sourceRect) return;

      const lastRect = containerRef.current.getBoundingClientRect();

      const deltaX = sourceRect.left - lastRect.left;
      const deltaY = sourceRect.top - lastRect.top;
      const deltaW = sourceRect.width / lastRect.width;

      containerRef.current.animate([
        {
          transformOrigin: 'top left',
          transform: `translate(${deltaX}px, ${deltaY}px) scale(${deltaW})`,
          opacity: 0.8
        },
        {
          transformOrigin: 'top left',
          transform: 'none',
          opacity: 1
        }
      ], {
        duration: 400,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        fill: 'both'
      });
    });

    return () => cancelAnimationFrame(animationFrame);
  }, [sourceRect]);

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'fixed',
        zIndex: 1000,
      }}
    >
      <div className={styles.inlineFocusEffects}>
        <div className={styles.animatedBackdrop}></div>
      </div>

      <div
        ref={overlayRef}
        className={styles.focusOverlayContainer}
        style={{
          width: '100%',
          height: '100%',
          overflowY: 'auto'
        }}
      >
        <div ref={containerRef} className={styles.heroGrid}>
          <ScriptCard
            script={script}
            onSelect={() => { }}
            isFromActiveSource={isFromActiveSource}
            isCompact={false}
            showExitFocus={true}
            onExitFocus={onExit}
            {...statusProps}
          />
        </div>
      </div>
    </div>
  );
};
