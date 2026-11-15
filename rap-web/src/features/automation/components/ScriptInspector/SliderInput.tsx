import React, { useState, useEffect, useRef } from "react";
import { FontAwesomeIcon } from "@/components/ui/Icon";
import { faChevronUp, faChevronDown } from "@/components/ui/iconAliases";

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
    // The mouseup that completes the focus click would otherwise collapse a select-all
    // back to a bare caret at the end of the number. Track only that FIRST click.
    const selectOnMouseUp = useRef(false);

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

    // ── Step spinners ──────────────────────────────────────────────────────────
    // `[Range(0, 100, 5)]` = min 0, max 100, step 5. The arrows must land on the
    // step grid anchored at `min` (0, 5, 10 … 100) even when someone typed an
    // off-grid value such as 3. Native `type="number" step={step}` did exactly
    // this before the precision fix changed the field to `type="text"`; draw the
    // arrows ourselves so free decimal typing ("6.") keeps working.
    const stepBy = (direction: 1 | -1) => {
        const safeStep = step > 0 ? step : 1;
        const current = parseFloat(localValue);
        const base = isNaN(current) ? min : current;
        const offset = (base - min) / safeStep;
        const index = direction > 0
            ? Math.floor(offset + 1e-9) + 1
            : Math.ceil(offset - 1e-9) - 1;
        let next = min + index * safeStep;
        next = Math.min(max, Math.max(min, next));
        next = parseFloat(next.toFixed(10));
        setLocalValue(String(next));
        // A spinner click is one discrete action — commit immediately, no debounce.
        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        onChange(next);
    };

    const currentNumber = parseFloat(localValue);
    const atMin = !isNaN(currentNumber) && currentNumber <= min;
    const atMax = !isNaN(currentNumber) && currentNumber >= max;

    const spinnerButtonClass =
        "flex-1 flex items-center justify-center text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:text-blue-400 dark:hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors";

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
                <div className="relative flex items-center">
                    <input
                        type="text"
                        value={localValue}
                        onFocus={(e) => {
                            setIsFocused(true);
                            // This is a replace-the-whole-number field. Select the value on
                            // entry so the user can type a new number immediately instead of
                            // putting the caret at the end and backspacing digit by digit.
                            selectOnMouseUp.current = true;
                            e.currentTarget.select();
                        }}
                        onMouseUp={(e) => {
                            // React's handler runs BEFORE the browser's default mouseup
                            // action, which would place a caret and drop the selection.
                            // Keep the whole value selected on that first click only;
                            // later clicks position the caret normally.
                            if (!selectOnMouseUp.current) return;
                            selectOnMouseUp.current = false;
                            e.preventDefault();
                            e.currentTarget.select();
                        }}
                        onDoubleClick={(e) => {
                            // Double-click selects the ENTIRE numeric value, not just the
                            // word under the cursor ("-12.5" is more than one word).
                            selectOnMouseUp.current = false;
                            e.currentTarget.select();
                        }}
                        onKeyDown={(e) => {
                            // Arrow keys step too, matching a native number input.
                            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                                e.preventDefault();
                                stepBy(e.key === "ArrowUp" ? 1 : -1);
                            }
                        }}
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
                        className="w-28 h-9 border border-gray-300 dark:border-gray-600 rounded pl-3 pr-7 text-sm font-semibold bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        disabled={disabled}
                    />
                    {/* Spinners live inside the entry on its right. Preventing the
                        mousedown default keeps focus (and any selection) in the text
                        field, so the button's click cannot trigger its onBlur. */}
                    <div className="absolute right-0 top-0 h-full w-6 flex flex-col border-l border-gray-200 dark:border-gray-600 rounded-r overflow-hidden">
                        <button
                            type="button"
                            aria-label={`Increase by ${step}`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => stepBy(1)}
                            disabled={disabled || atMax}
                            className={spinnerButtonClass}
                        >
                            <FontAwesomeIcon icon={faChevronUp} className="text-[9px]" />
                        </button>
                        <button
                            type="button"
                            aria-label={`Decrease by ${step}`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => stepBy(-1)}
                            disabled={disabled || atMin}
                            className={spinnerButtonClass}
                        >
                            <FontAwesomeIcon icon={faChevronDown} className="text-[9px]" />
                        </button>
                    </div>
                </div>
            </div>
            <div className="flex justify-between px-1">
                <span className="text-xs text-gray-400 font-mono">{isDecimal ? min.toFixed(1) : min}</span>
                <span className="text-xs text-gray-400 font-mono">{isDecimal ? max.toFixed(1) : max}</span>
            </div>
        </div>
    );
};
