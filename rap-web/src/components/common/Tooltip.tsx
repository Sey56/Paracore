import React, { useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
    text: string;
    children: React.ReactNode;
    position?: 'top' | 'bottom' | 'bottom-center';
    className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ text, children, position = 'top', className = '' }) => {
    const triggerRef = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);
    const [coords, setCoords] = useState({ top: 0, left: 0 });

    const show = useCallback(() => {
        if (!triggerRef.current || !text) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        if (position === 'top') {
            // Centered above the trigger
            const margin = 133; // half max-width (125px) + 8px padding
            setCoords({
                top: rect.top - 8,
                left: Math.max(margin, Math.min(window.innerWidth - margin, centerX)),
            });
        } else {
            // Centered below the trigger — clamp by actual tooltip width, not a fixed margin
            const halfWidth = Math.min(text.length * 4 + 24, 125);
            setCoords({
                top: rect.bottom + 8,
                left: Math.max(halfWidth, Math.min(window.innerWidth - halfWidth, centerX)),
            });
        }
        setVisible(true);
    }, [text, position]);

    const hide = useCallback(() => setVisible(false), []);

    if (!text) return <>{children}</>;

    return (
        <div
            ref={triggerRef}
            className={className}
            onMouseEnter={show}
            onMouseLeave={hide}
        >
            {children}
            {visible && createPortal(
                <div
                    style={{
                        position: 'fixed',
                        top: coords.top,
                        left: coords.left,
                        transform: position === 'top'
                            ? 'translate(-50%, -100%)'
                            : 'translate(-50%, 0)',
                        zIndex: 99999,
                        pointerEvents: 'none',
                        backgroundColor: 'var(--tooltip-bg)',
                        color: 'var(--tooltip-text)',
                    }}
                    className="px-3 py-1.5 rounded-xl shadow-2xl text-[11px] font-medium leading-[1.5] max-w-[250px] whitespace-nowrap"
                >
                    {text}
                </div>,
                document.body
            )}
        </div>
    );
};
