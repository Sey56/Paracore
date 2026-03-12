import React from 'react';

interface TooltipProps {
    text: string;
    children: React.ReactNode;
    position?: 'top' | 'bottom';
    className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({ text, children, position = 'top', className = '' }) => {
    if (!text) return <>{children}</>;

    const positionClasses = position === 'top'
        ? 'bottom-full mb-2'
        : 'top-full mt-2';

    return (
        <div className={`relative group/tooltip ${className}`}>
            {children}
            <div className={`absolute z-50 left-1/2 -translate-x-1/2 ${positionClasses} px-3 py-2 rounded-xl shadow-2xl bg-white dark:bg-slate-900 text-slate-700 dark:text-white text-[11px] font-medium leading-relaxed max-w-[250px] whitespace-pre-wrap opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all duration-300 transform translate-y-1 group-hover/tooltip:translate-y-0 pointer-events-none`}>
                {text}
            </div>
        </div>
    );
};
