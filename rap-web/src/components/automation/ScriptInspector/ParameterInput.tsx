import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSync, faSpinner, faFolderOpen } from "@fortawesome/free-solid-svg-icons";
import { open, save } from "@tauri-apps/api/dialog";
import type { ScriptParameter } from "@/types/scriptModel";

interface ParameterInputProps {
  param: ScriptParameter;
  index: number;
  onChange: (index: number, value: string | number | boolean) => void;
  onCompute?: (paramName: string) => void;
  isComputing?: boolean;
  disabled?: boolean;
}

export const ParameterInput: React.FC<ParameterInputProps> = ({ param, index, onChange, onCompute, isComputing, disabled }) => {
  // Helper to parse multi-select value safely
  const getMultiSelectValues = (): string[] => {
    try {
      if (Array.isArray(param.value)) return param.value;
      if (typeof param.value === 'string') {
        const parsed = JSON.parse(param.value);
        return Array.isArray(parsed) ? parsed : [];
      }
      return [];
    } catch { return []; }
  };

  const handleFileBrowse = async () => {
    try {
      let selection: string | string[] | null = null;

      if (param.inputType === 'SaveFile') {
        selection = await save({
          title: param.description || "Save File",
          defaultPath: param.value as string || undefined,
          filters: [{ name: 'CSV', extensions: ['csv'] }, { name: 'All Files', extensions: ['*'] }]
        });
      } else {
        selection = await open({
          multiple: false,
          directory: param.inputType === 'Folder',
          title: param.description || `Select ${param.inputType}`
        });
      }

      if (selection && typeof selection === 'string') {
        onChange(index, selection);
      }
    } catch (err) {
      console.error("Failed to open file dialog:", err);
    }
  };

  const renderInput = () => {
    // Case 0: File/Folder Picker (Native Dialog)
    if (param.inputType === 'File' || param.inputType === 'Folder' || param.inputType === 'SaveFile') {
      return (
        <div className="flex gap-2 w-full">
          <input
            type="text"
            value={param.value !== null && param.value !== undefined ? String(param.value) : ''}
            onChange={(e) => onChange(index, e.target.value)}
            className="flex-grow border border-gray-300 dark:border-gray-600 rounded-l px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            disabled={disabled}
            placeholder={param.inputType === 'Folder' ? "Select folder..." : (param.inputType === 'SaveFile' ? "Enter save path..." : "Select file...")}
          />
          <button
            onClick={handleFileBrowse}
            disabled={disabled}
            className="px-3 py-1 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded-r border border-l-0 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
            title="Browse..."
          >
            <FontAwesomeIcon icon={faFolderOpen} />
          </button>
        </div>
      );
    }

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

    // ... (rest of renderInput cases: Checkbox, Boolean, Number, Default String)

    // Case 2: Multi-Select (Checkboxes)
    if (param.options && param.options.length > 0 && param.multiSelect) {
      const selectedValues = getMultiSelectValues();
      const [searchTerm, setSearchTerm] = useState("");

      const filteredOptions = param.options.filter(opt =>
        opt.toLowerCase().includes(searchTerm.toLowerCase())
      );

      const handleAllNone = (selectAll: boolean) => {
        const newValues = selectAll ? [...param.options!] : [];
        onChange(index, JSON.stringify(newValues));
      };

      return (
        <div className="flex flex-col space-y-2 border border-gray-300 dark:border-gray-600 rounded p-2 bg-gray-50 dark:bg-gray-800">
          {/* Search and Helpers */}
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Search options..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-grow px-2 py-1 text-[10px] rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              disabled={disabled}
            />
            <div className="flex gap-1">
              <button
                onClick={() => handleAllNone(true)}
                disabled={disabled}
                className="px-1.5 py-0.5 text-[9px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded hover:bg-blue-100 transition-colors"
                title="Select All"
              >
                All
              </button>
              <button
                onClick={() => handleAllNone(false)}
                disabled={disabled}
                className="px-1.5 py-0.5 text-[9px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded hover:bg-gray-200 transition-colors"
                title="Clear All"
              >
                None
              </button>
            </div>
          </div>

          {/* Grid of Checkboxes */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option: string, i: number) => (
                <label key={i} className="flex items-center space-x-2 cursor-pointer group py-0.5">
                  <input
                    type="checkbox"
                    checked={selectedValues.includes(option)}
                    onChange={(e) => {
                      const newValues = e.target.checked
                        ? [...selectedValues, option]
                        : selectedValues.filter(v => v !== option);
                      onChange(index, JSON.stringify(newValues));
                    }}
                    className="rounded text-blue-600 focus:ring-blue-500 h-3.5 w-3.5 border-gray-300 dark:border-gray-700 dark:bg-gray-900"
                    disabled={disabled}
                  />
                  <span className="text-[11px] text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 truncate" title={option}>
                    {option}
                  </span>
                </label>
              ))
            ) : (
              <div className="col-span-2 text-center py-2 text-[10px] text-gray-400 italic">
                No matching options found
              </div>
            )}
          </div>
        </div>
      );
    }

    // Case 3: Boolean
    if (param.type === "boolean") {
      const isChecked = param.value === true || (typeof param.value === 'string' && param.value.toLowerCase() === 'true');
      return (
        <label className="inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={isChecked}
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
      const isDecimal = param.numericType === 'double';
      const step = param.step || (isDecimal ? 0.1 : 1);
      const min = param.min !== undefined ? param.min : undefined;
      const max = param.max !== undefined ? param.max : undefined;

      const hasSlider = min !== undefined && max !== undefined && max > min;

      if (hasSlider) {
        return (
          <div className="flex flex-col space-y-1 w-full">
            <div className="flex items-center space-x-3">
              <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={Number(param.value) || 0}
                onChange={(e) => onChange(index, parseFloat(e.target.value))}
                className="flex-grow h-2 rounded-lg cursor-pointer accent-blue-600"
                disabled={disabled}
              />
              <input
                type="number"
                value={typeof param.value === 'number' || typeof param.value === 'string' ? param.value : ''}
                min={min}
                max={max}
                step={step}
                onChange={(e) => {
                  const val = e.target.value === "" ? 0 : parseFloat(e.target.value);
                  onChange(index, val);
                }}
                className="w-24 border border-gray-300 dark:border-gray-600 rounded px-2 py-0.5 text-xs font-mono bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                disabled={disabled}
              />
            </div>
            <div className="flex justify-between px-1">
              <span className="text-[10px] text-gray-400 font-mono">{min}</span>
              <span className="text-[10px] text-gray-400 font-mono">{max}</span>
            </div>
          </div>
        );
      }

      return (
        <input
          type="number"
          value={param.value !== null && param.value !== undefined ? String(param.value) : ''}
          min={min}
          max={max}
          step={step}
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
      <div className="flex gap-2 items-center">
        <div className="flex-grow">
          {renderInput()}
        </div>
        {param.requiresCompute && onCompute && (
          <button
            onClick={() => onCompute(param.name)}
            disabled={disabled || isComputing}
            className={`flex-shrink-0 p-2 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${isComputing ? 'animate-pulse' : ''}`}
            title={param.options && param.options.length > 0 ? `Refresh options (Current: ${param.options.length})` : "Compute options from Revit"}
          >
            <FontAwesomeIcon
              icon={isComputing ? faSpinner : faSync}
              className={`${isComputing ? 'animate-spin' : ''} ${param.options && param.options.length > 0 ? 'text-gray-400 dark:text-gray-500' : 'text-blue-600 dark:text-blue-400'}`}
            />
          </button>
        )}
      </div>
    </div>
  );
};
