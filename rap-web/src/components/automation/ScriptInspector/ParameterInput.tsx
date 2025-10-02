import React from "react";
import type { ScriptParameter } from "@/types/scriptModel";

interface ParameterInputProps {
  param: ScriptParameter;
  index: number;
  onChange: (index: number, value: string | number | boolean) => void;
  disabled?: boolean; // New prop
}

export const ParameterInput: React.FC<ParameterInputProps> = ({ param, index, onChange, disabled }) => {
  let processedValue: string | number | boolean = param.value ?? '';

  if (param.type === 'number' && typeof param.value === 'number') {
    processedValue = String(param.value);
  }

  return (
    <div key={index}>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {param.name} {param.description && `(${param.description})`}
      </label>

      {param.type === "enum" ? (
        <select
          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          value={param.value as string}
          onChange={(e) => onChange(index, e.target.value)}
          disabled={disabled} // Apply disabled prop
        >
          {param.options?.map((option: string, i: number) => (
            <option key={i} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : param.type === "boolean" ? (
        <label className="inline-flex items-center">
          <input
            type="checkbox"
            checked={Boolean(param.value)}
            onChange={(e) => onChange(index, e.target.checked)}
            className="rounded text-blue-600"
            disabled={disabled} // Apply disabled prop
          />
          <span className="ml-2 text-gray-700 dark:text-gray-300">
            Enable
          </span>
        </label>
      ) : (
        <input
          type={param.type === "number" ? "number" : "text"}
          value={String(processedValue)}
          onChange={(e) => {
            const newValue = param.type === "number" ? parseFloat(e.target.value) : e.target.value;
            onChange(index, newValue);
          }}
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          disabled={disabled} // Apply disabled prop
        />
      )}
    </div>
  );
};
