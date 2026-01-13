import React, { useState, useEffect, useRef } from "react";

interface SliderInputProps {
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (val: number) => void;
    disabled?: boolean;
    suffix?: string;
}

export const SliderInput: React.FC<SliderInputProps> = ({ min, max, step, value, onChange, disabled, suffix }) => {
    const [localValue, setLocalValue] = useState(value);
    const [isDragging, setIsDragging] = useState(false);
    const debounceTimeout = useRef<any>(null);

    // Sync with prop changes (e.g. preset selection) only if NOT dragging
    useEffect(() => {
        if (!isDragging) {
            setLocalValue(value);
        }
    }, [value, isDragging]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        };
    }, []);

    const handleChange = (newValue: number) => {
        setLocalValue(newValue);

        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

        // Throttle/Debounce the parent update to 16ms (60fps) to prevent heavy re-renders
        debounceTimeout.current = setTimeout(() => {
            onChange(newValue);
        }, 16);
    };

    return (
        <div className="flex flex-col space-y-1 w-full">
            <div className="flex items-center space-x-3">
                <input
                    type="range"
                    min={min}
                    max={max}
                    step={step}
                    value={localValue}
                    onInput={(e) => handleChange(parseFloat((e.target as HTMLInputElement).value))}
                    onMouseDown={() => setIsDragging(true)}
                    onMouseUp={() => setIsDragging(false)}
                    onTouchStart={() => setIsDragging(true)}
                    onTouchEnd={() => setIsDragging(false)}
                    onBlur={() => setIsDragging(false)}
                    className="flex-grow h-2 rounded-lg cursor-pointer accent-blue-600"
                    disabled={disabled}
                />
                <div className="flex items-center">
                    <input
                        type="number"
                        value={localValue}
                        min={min}
                        max={max}
                        step={step}
                        onChange={(e) => {
                            const val = e.target.value === "" ? 0 : parseFloat(e.target.value);
                            handleChange(val);
                        }}
                        className="w-28 border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm font-mono bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        disabled={disabled}
                    />
                </div>
            </div>
            <div className="flex justify-between px-1">
                <span className="text-xs text-gray-400 font-mono">{min}</span>
                <span className="text-xs text-gray-400 font-mono">{max}</span>
            </div>
        </div>
    );
};
