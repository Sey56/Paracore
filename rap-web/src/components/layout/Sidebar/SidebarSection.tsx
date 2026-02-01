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
        className="flex items-center justify-between py-2 px-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-md group transition-colors select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <FontAwesomeIcon 
            icon={isExpanded ? faChevronDown : faChevronRight} 
            className="text-[10px] text-gray-400 dark:text-gray-500 w-3"
          />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 truncate flex items-center gap-2">
            {icon && (
              <FontAwesomeIcon icon={icon} className={iconColor || "text-gray-500"} />
            )}
            {title}
          </h3>
        </div>
        
        {actions && (
          <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="pl-2 mt-1">
          {children}
        </div>
      )}
    </div>
  );
};
