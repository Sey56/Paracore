import React from "react";
import type { ScriptParameter } from "@/types/scriptModel";

interface ParameterInputProps {
  param: ScriptParameter;
  index: number;
  onChange: (index: number, value: string | number | boolean) => void;
  disabled?: boolean;
}

export const ParameterInput: React.FC<ParameterInputProps> = ({ param, index, onChange, disabled }) => {
  // Helper to parse multi-select value safely
  const getMultiSelectValues = (): string[] => {
    console.log(`DEBUG: MultiSelect value for '${param.name}':`, param.value, `(type: ${typeof param.value})`);
    try {
      // Case 1: Value is already a valid array
      if (Array.isArray(param.value)) {
        return param.value;
      }
      // Case 2: Value is a JSON string
      if (typeof param.value === 'string') {
        const parsed = JSON.parse(param.value);
        return Array.isArray(parsed) ? parsed : [];
      }
      // Fallback for any other unexpected type
      return [];
    } catch {
      // Handles JSON.parse errors if the string is not valid JSON
      return [];
    }
  };

  const renderInput = () => {
    // Case 1: Dropdown (Single Select)
    if (param.options && param.options.length > 0 && !param.multiSelect) {
      return (
        <select
          className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={param.value as string}
          onChange={(e) => onChange(index, e.target.value)}
          disabled={disabled}
        >
          {param.options.map((option: string, i: number) => (
            <option key={i} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    }

    // Case 2: Multi-Select (Checkboxes)
    if (param.options && param.options.length > 0 && param.multiSelect) {
      const selectedValues = getMultiSelectValues();
      return (
        <div className="flex flex-wrap gap-2 border border-gray-300 dark:border-gray-600 rounded p-2 bg-gray-50 dark:bg-gray-800">
          {param.options.map((option: string, i: number) => (
            <label key={i} className="inline-flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedValues.includes(option)}
                onChange={(e) => {
                  const newValues = e.target.checked
                    ? [...selectedValues, option]
                    : selectedValues.filter(v => v !== option);
                  onChange(index, JSON.stringify(newValues));
                }}
                className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
                disabled={disabled}
              />
              <span className="text-xs text-gray-700 dark:text-gray-300">{option}</span>
            </label>
          ))}
        </div>
      );
    }

    // Case 3: Boolean
    if (param.type === "boolean") {
      return (
        <label className="inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(param.value)}
            onChange={(e) => onChange(index, e.target.checked)}
            className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4"
            disabled={disabled}
          />
          <span className="ml-2 text-xs text-gray-700 dark:text-gray-300">
            True
          </span>
        </label>
      );
    }

    // Case 4: Number
    if (param.type === "number") {
      return (
        <input
          type="number"
          value={param.value !== null && param.value !== undefined ? String(param.value) : ''}
          onChange={(e) => {
            const val = e.target.value === "" ? 0 : parseFloat(e.target.value);
            onChange(index, val);
          }}
          className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          disabled={disabled}
        />
      );
    }

    // Case 5: Default (String)
    return (
      <input
        type="text"
        value={param.value !== null && param.value !== undefined ? String(param.value) : ''}
        onChange={(e) => onChange(index, e.target.value)}
        className="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
        disabled={disabled}
      />
    );
  };

  return (
    <div key={index} className="flex flex-col space-y-1">
      <div className="flex justify-between items-baseline">
        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400">
          {param.name}
        </label>
        {param.description && (
          <span className="text-xs text-gray-400 dark:text-gray-500 italic truncate max-w-[60%] text-right" title={param.description}>
            {param.description}
          </span>
        )}
      </div>
      {renderInput()}
    </div>
  );
};
