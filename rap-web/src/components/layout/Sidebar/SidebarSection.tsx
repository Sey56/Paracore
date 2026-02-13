import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronRight, IconDefinition } from '@fortawesome/free-solid-svg-icons';

interface SidebarSectionProps {
  title: string;
  icon?: IconDefinition;
  iconColor?: string;
  defaultExpanded?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const SidebarSection: React.FC<SidebarSectionProps> = ({
  title,
  icon,
  iconColor,
  defaultExpanded = true,
  actions,
  children,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className={`mb-2 ${className}`}>
      <div
        className="flex items-center group/section px-2 py-1.5 rounded-xl cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-all duration-300 select-none border border-transparent hover:border-gray-100 dark:hover:border-gray-800/50 shadow-none hover:shadow-sm"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2.5 overflow-hidden shrink-0">
          <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`}>
            <FontAwesomeIcon
              icon={faChevronRight}
              className="text-[10px] text-gray-300 dark:text-gray-600 w-2.5"
            />
          </div>
          <h3 className="text-[11px] font-black uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400 truncate flex items-center gap-2">
            {icon && (
              <div className={`w-5 h-5 rounded-md flex items-center justify-center bg-gray-50 dark:bg-gray-900/50 group-hover/section:scale-110 transition-transform ${iconColor || "text-gray-400"}`}>
                <FontAwesomeIcon icon={icon} className="text-[10px]" />
              </div>
            )}
            {title}
          </h3>
        </div>

        {actions && (
          <div className="flex-1 flex items-center justify-end pr-1 opacity-0 group-hover/section:opacity-100 transition-all duration-300 translate-x-2 group-hover/section:translate-x-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 rounded-lg p-0.5">
              {actions}
            </div>
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="pl-6 mt-0.5 relative animate-in fade-in slide-in-from-top-1 duration-300">
          <div className="absolute left-[13px] top-0 bottom-3 w-px bg-gradient-to-b from-gray-100 to-transparent dark:from-gray-800 dark:to-transparent" />
          {children}
        </div>
      )}
    </div>
  );
};
