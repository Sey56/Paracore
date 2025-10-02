import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes } from '@fortawesome/free-solid-svg-icons';

interface FilterPillsProps {
  filters: { type: string; value: string }[];
  onRemoveFilter: (type: string, value: string) => void;
}

export const FilterPills: React.FC<FilterPillsProps> = ({ filters, onRemoveFilter }) => {
  if (filters.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {filters.map((filter, index) => (
        <span
          key={index}
          className="flex items-center bg-blue-100 text-blue-800 text-xs font-medium px-2.5 py-0.5 rounded-full dark:bg-blue-900 dark:text-blue-300"
        >
          {filter.type}: {filter.value}
          <button
            type="button"
            onClick={() => onRemoveFilter(filter.type, filter.value)}
            className="inline-flex items-center p-1 ml-2 text-sm text-blue-400 bg-transparent rounded-full hover:bg-blue-200 hover:text-blue-900 dark:hover:bg-blue-800 dark:hover:text-blue-300"
            aria-label="Remove filter"
          >
            <FontAwesomeIcon icon={faTimes} className="w-2 h-2" />
          </button>
        </span>
      ))}
    </div>
  );
};
