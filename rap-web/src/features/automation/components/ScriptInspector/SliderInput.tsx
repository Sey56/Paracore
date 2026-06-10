import React, { useState, useEffect, useRef } from "react";

interface SliderInputProps {
    min: number;
    max: number;
    step: number;
    value: number;
    onChange: (val: number) => void;
    disabled?: boolean;
    suffix?: string;
    isDecimal?: boolean;
}

export const SliderInput: React.FC<SliderInputProps> = ({ min, max, step, value, onChange, disabled, suffix, isDecimal }) => {
    const [localValue, setLocalValue] = useState(String(value));
    const [isDragging, setIsDragging] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync with prop changes (e.g. preset selection) only if NOT interacting
    useEffect(() => {
        if (isFocused || isDragging) return;
        const incoming = String(value);
        if (incoming !== localValue && parseFloat(incoming) !== parseFloat(localValue)) {
            setLocalValue(incoming);
        }
    }, [value, isDragging, isFocused, localValue]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        };
    }, []);

    const handleChange = (newVal: number, rawString?: string) => {
        const stringVal = rawString ?? String(newVal);
        setLocalValue(stringVal);

        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        debounceTimeout.current = setTimeout(() => {
            onChange(newVal);
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
                    value={parseFloat(localValue) || 0}
                    onInput={(e) => {
                        const val = parseFloat((e.target as HTMLInputElement).value);
                        handleChange(val);
                    }}
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
                        type="text"
                        value={localValue}
                        onFocus={() => setIsFocused(true)}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (val === "" || /^-?\d*\.?\d*$/.test(val)) {
                                setLocalValue(val);
                                if (val !== "" && !val.endsWith(".") && !val.endsWith(".0")) {
                                    const parsed = parseFloat(val);
                                    if (!isNaN(parsed)) {
                                        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
                                        debounceTimeout.current = setTimeout(() => onChange(parsed), 16);
                                    }
                                }
                            }
                        }}
                        onBlur={() => {
                            setIsFocused(false);
                            const parsed = parseFloat(localValue);
                            if (!isNaN(parsed)) {
                                setLocalValue(String(parsed));
                                onChange(parsed);
                            } else {
                                // Cleared to empty — reset to min
                                setLocalValue(String(min));
                                onChange(min);
                            }
                        }}
                        className="w-28 h-9 border border-gray-300 dark:border-gray-600 rounded px-3 text-sm font-semibold bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
                        disabled={disabled}
                    />
                </div>
            </div>
            <div className="flex justify-between px-1">
                <span className="text-xs text-gray-400 font-mono">{isDecimal ? min.toFixed(1) : min}</span>
                <span className="text-xs text-gray-400 font-mono">{isDecimal ? max.toFixed(1) : max}</span>
            </div>
        </div>
    );
};
