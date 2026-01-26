import React from 'react';

interface ColorInputProps {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}

export const ColorInput: React.FC<ColorInputProps> = ({ value, onChange, disabled }) => {
    // Ensure we have a valid hex color
    const hexValue = value.startsWith('#') ? value : '#000000';

    return (
        <div className="flex items-center w-full gap-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 focus-within:ring-1 focus-within:ring-blue-500">
            <div
                className="relative w-6 h-6 rounded-md shadow-sm border border-gray-200 dark:border-gray-500 transition-transform active:scale-95"
                style={{ backgroundColor: hexValue }}
            >
                <input
                    type="color"
                    value={hexValue}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                />
            </div>
            <input
                type="text"
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                placeholder="#RRGGBB"
                className="flex-grow bg-transparent text-sm text-gray-800 dark:text-gray-200 font-mono focus:outline-none uppercase"
            />
        </div>
    );
};
