import React from 'react';

interface SegmentedControlProps {
    options: string[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}

/**
 * A segmented control that wraps instead of clipping.
 *
 * Four options per row is the CAP, not a fixed count: each button has a 25%
 * flex-basis and a minimum width, so the available width decides how many fit.
 * Dragging the inspector narrower pushes options down to the next row (4 -> 3
 * -> 2 -> 1) and dragging it wider pulls them back up. The browser reflows the
 * flex lines on its own, so no resize listener is needed.
 *
 * Rows are centred, so a short last line sits in the middle like wrapped text
 * rather than being stretched to the left and right edges.
 */
export const SegmentedControl: React.FC<SegmentedControlProps> = ({ options, value, onChange, disabled }) => {
    return (
        <div className="flex flex-wrap justify-center w-full min-h-9 p-1 gap-1 bg-gray-100 dark:bg-gray-800/50 rounded-md">
            {(options ?? []).map((option) => {
                const isActive = value === option;
                return (
                    <button
                        key={option}
                        type="button"
                        aria-pressed={isActive}
                        title={option}
                        disabled={disabled}
                        onClick={() => onChange(option)}
                        className={`grow-0 shrink basis-[calc(25%-0.25rem)] min-w-[5.5rem] min-h-7 px-1.5 py-1 flex items-center justify-center text-center text-xs leading-tight break-words rounded-md transition-colors duration-150
                            ${isActive
                                ? 'bg-white dark:bg-gray-600 text-blue-600 dark:text-blue-100 font-semibold'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-200/50 dark:hover:bg-gray-700/50 font-medium'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {option}
                    </button>
                );
            })}
        </div>
    );
};
