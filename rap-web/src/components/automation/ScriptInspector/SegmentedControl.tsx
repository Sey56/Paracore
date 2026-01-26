import React from 'react';

interface SegmentedControlProps {
    options: string[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}

export const SegmentedControl: React.FC<SegmentedControlProps> = ({ options, value, onChange, disabled }) => {
    return (
        <div className="flex flex-wrap w-full bg-gray-100 dark:bg-gray-800 rounded-lg p-1 border border-gray-200 dark:border-gray-700 gap-1">
            {(options ?? []).map((option) => {
                const isActive = value === option;
                return (
                    <button
                        key={option}
                        disabled={disabled}
                        onClick={() => onChange(option)}
                        className={`flex-grow px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${isActive
                            ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-400 shadow-sm'
                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                            } disabled:opacity-50`}
                    >
                        {option}
                    </button>
                );
            })}
        </div>
    );
};
