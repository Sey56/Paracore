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
    // V5 PRECISION FIX: Use string for localValue to preserve trailing zeros (6.0)
    const [localValue, setLocalValue] = useState(String(value));
    const [isDragging, setIsDragging] = useState(false);
    const debounceTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Sync with prop changes (e.g. preset selection) only if NOT dragging
    useEffect(() => {
        if (!isDragging) {
            let incoming = String(value);
            // If it's a decimal and we got a whole number string, format it
            if (isDecimal && !incoming.includes(".")) {
                incoming = value.toFixed(1);
            }
            
            if (incoming !== localValue && parseFloat(incoming) !== parseFloat(localValue)) {
                setLocalValue(incoming);
            }
        }
    }, [value, isDragging, isDecimal, localValue]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        };
    }, []);

    const handleChange = (newVal: number, rawString?: string) => {
        let stringVal = rawString ?? String(newVal);
        
        // V5: If we are in decimal mode and the value is an integer, force the .0
        if (isDecimal && !stringVal.includes(".")) {
            stringVal = newVal.toFixed(1);
        }

        setLocalValue(stringVal);

        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

        // Throttle/Debounce the parent update to 16ms (60fps) to prevent heavy re-renders
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
                            // V5 PRECISION FORMATTER: Ensure at least one decimal for non-integers or precision needs
                            if (localValue !== "") {
                                const parsed = parseFloat(localValue);
                                if (!isNaN(parsed)) {
                                    let formatted = String(parsed);
                                    if (isDecimal && !formatted.includes(".")) {
                                        formatted = parsed.toFixed(1);
                                    }
                                    setLocalValue(formatted);
                                    onChange(parsed);
                                }
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
