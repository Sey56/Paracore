import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faMinus } from '@fortawesome/free-solid-svg-icons';

interface StepperInputProps {
    value: number;
    min?: number;
    max?: number;
    step?: number;
    onChange: (value: number) => void;
    disabled?: boolean;
}

export const StepperInput: React.FC<StepperInputProps> = ({ value, min, max, step = 1, onChange, disabled }) => {
    // V2.5 Fix: Robust numeric conversion (handles strings, nulls, and precision)
    const currentNumValue = React.useMemo(() => {
        const val = typeof value === 'string' ? parseFloat(value) : value;
        return isNaN(val as number) ? (min ?? 0) : (val as number);
    }, [value, min]);

    const handleDecrement = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (disabled) return;

        const newValue = parseFloat((currentNumValue - step).toFixed(10));
        console.log(`[Stepper] DECREMENT: ${currentNumValue} - ${step} = ${newValue}. Min limit: ${min}`);

        if (min !== undefined && min !== null && newValue < min) {
            console.warn(`[Stepper] Min limit reached.`);
            return;
        }

        onChange(newValue);
    };

    const handleIncrement = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (disabled) return;

        const newValue = parseFloat((currentNumValue + step).toFixed(10));
        console.log(`[Stepper] INCREMENT: ${currentNumValue} + ${step} = ${newValue}. Max limit: ${max}`);

        if (max !== undefined && max !== null && newValue > max) {
            console.warn(`[Stepper] Max limit reached.`);
            return;
        }

        onChange(newValue);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        if (isNaN(val)) {
            // Allow empty input for better UX during typing, but pass a safe fallback if needed
            // Or just return to let user finish typing
            return;
        }
        onChange(val);
    };

    return (
        <div className="flex items-center w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden shadow-sm">
            <button
                type="button"
                onClick={handleDecrement}
                disabled={disabled || (min !== undefined && min !== null && currentNumValue <= min)}
                className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-30 disabled:grayscale transition-all border-r border-gray-200 dark:border-gray-600"
                title="Decrease"
            >
                <FontAwesomeIcon icon={faMinus} className="text-[0.7rem]" />
            </button>

            <input
                type="number"
                value={value}
                onChange={handleInputChange}
                disabled={disabled}
                className="flex-grow text-center bg-transparent text-sm font-medium text-gray-800 dark:text-gray-200 focus:outline-none py-1.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none min-w-[40px]"
            />

            <button
                type="button"
                onClick={handleIncrement}
                disabled={disabled || (max !== undefined && max !== null && currentNumValue >= max)}
                className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-30 disabled:grayscale transition-all border-l border-gray-200 dark:border-gray-600"
                title="Increase"
            >
                <FontAwesomeIcon icon={faPlus} className="text-[0.7rem]" />
            </button>
        </div>
    );
};
