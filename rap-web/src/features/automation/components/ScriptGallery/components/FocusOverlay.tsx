import React, { useRef, useLayoutEffect } from 'react';
import { Script } from '@/types/scriptModel';
import { ScriptCard } from '../../ScriptCard/ScriptCard';
import styles from '../ScriptGallery.module.css';
import { useScriptExecution } from '@/features/automation';

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
  const { selectedScript } = useScriptExecution();

  const isSelected = selectedScript?.id?.toLowerCase().replace(/\\/g, '/') === script.id?.toLowerCase().replace(/\\/g, '/');

  // 1. Position & Resize Logic (Must run before animation)
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

  // 2. FLIP Animation
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
        zIndex: 50,
      }}
    >
      <div
        ref={overlayRef}
        className="w-full h-full flex items-center justify-center p-8 overflow-hidden bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl"
      >
        <div ref={containerRef} className="w-full max-w-sm">
          <ScriptCard
            script={script}
            isSelected={isSelected}
            onSelect={() => { }}
            isFromActiveSource={isFromActiveSource}
            isCompact={false}
            showExitFocus={true}
            onExitFocus={onExit}
          />
        </div>
      </div>
    </div>
  );
};
