import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSync, faSpinner, faFolderOpen, faMousePointer, faCrosshairs, faSearch, faCheck } from "@fortawesome/free-solid-svg-icons";
import { open, save } from "@tauri-apps/api/dialog";
import type { ScriptParameter } from "@/types/scriptModel";
import { SliderInput } from "./SliderInput";
import { PointInput } from "./PointInput";
import { StepperInput } from "./StepperInput";
import { SegmentedControl } from "./SegmentedControl";
import { ColorInput } from "./ColorInput";

interface ParameterInputProps {
  param: ScriptParameter;
  index: number;
  onChange: (index: number, value: string | number | boolean) => void;
  onCompute?: (paramName: string) => void;
  onPickObject?: (selectionType: string, index: number) => void;
  isComputing?: boolean;
  disabled?: boolean;
}

interface MultiSelectInputProps {
  param: ScriptParameter;
  index: number;
  onChange: (index: number, value: string | number | boolean) => void;
  onCompute?: (paramName: string) => void;
  isComputing?: boolean;
  disabled?: boolean;
}

const ToggleSwitch = ({ checked, onChange, disabled }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => !disabled && onChange(!checked)}
    className={`${checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'} 
      relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent 
      transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 
      ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    <span
      className={`${checked ? 'translate-x-5' : 'translate-x-0'} 
        pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 
        transition duration-200 ease-in-out`}
    />
  </button>
);

const MultiSelectInput: React.FC<MultiSelectInputProps> = ({ param, index, onChange, onCompute, isComputing, disabled }) => {
  const [searchTerm, setSearchTerm] = useState("");

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

  const selectedValues = getMultiSelectValues();

  const filteredOptions = (param.options || []).filter(opt =>
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAllNone = (selectAll: boolean) => {
    const newValues = selectAll ? [...(param.options || [])] : [];
    onChange(index, JSON.stringify(newValues));
  };

  return (
    <div className="flex flex-col border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
      {/* Search Header */}
      <div className="flex items-center px-2 py-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div className="relative flex-grow">
          <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
            <FontAwesomeIcon icon={faSearch} className="text-gray-400 text-xs" />
          </div>
          <input
            type="text"
            placeholder="Search options..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-2 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-shadow"
            disabled={disabled}
          />
        </div>
        
        {param.requiresCompute && onCompute && (
           <button
             onClick={() => onCompute(param.name)}
             disabled={disabled || isComputing}
             className={`ml-2 p-1.5 rounded-md text-xs transition-colors ${isComputing ? 'animate-pulse' : ''} 
               ${param.options && param.options.length > 0 
                 ? "text-gray-500 hover:text-blue-600 hover:bg-gray-200 dark:hover:bg-gray-700" 
                 : "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800"}`}
             title={param.options && param.options.length > 0 ? "Refresh options" : "Compute options"}
           >
             <FontAwesomeIcon icon={isComputing ? faSpinner : faSync} className={isComputing ? 'animate-spin' : ''} />
           </button>
        )}
      </div>

      {/* Options List */}
      <div className="max-h-48 overflow-y-auto custom-scrollbar p-1 bg-white dark:bg-gray-900/50">
        {filteredOptions.length > 0 ? (
          <div className="space-y-0.5">
            {filteredOptions.map((option: string, i: number) => {
               const isSelected = selectedValues.includes(option);
               return (
                <label 
                  key={i} 
                  className={`flex items-center justify-between px-3 py-1.5 rounded cursor-pointer transition-colors text-xs select-none
                    ${isSelected 
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium' 
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'}`}
                >
                  <span className="truncate flex-1 mr-2" title={option}>{option}</span>
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors
                    ${isSelected 
                      ? 'bg-blue-500 border-blue-500 text-white' 
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'}`}>
                    {isSelected && <FontAwesomeIcon icon={faCheck} className="text-[10px]" />}
                  </div>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      const newValues = e.target.checked
                        ? [...selectedValues, option]
                        : selectedValues.filter(v => v !== option);
                      onChange(index, JSON.stringify(newValues));
                    }}
                    className="hidden" // Hide native checkbox
                    disabled={disabled}
                  />
                </label>
               );
            })}
          </div>
        ) : (
          <div className="py-4 text-center text-xs text-gray-400 italic">
            No matching options
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="flex justify-between items-center px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700 text-xs">
        <span className="text-gray-400 dark:text-gray-500">
          {selectedValues.length} selected
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => handleAllNone(true)}
            disabled={disabled}
            className="text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"
          >
            Select All
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={() => handleAllNone(false)}
            disabled={disabled}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:underline disabled:opacity-50"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
};

export const ParameterInput: React.FC<ParameterInputProps> = ({ param, index, onChange, onCompute, onPickObject, isComputing, disabled }) => {
  const [showTooltip, setShowTooltip] = useState(false);

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
        <div className="flex gap-2 w-full shadow-sm rounded-md">
          <input
            type="text"
            value={param.value !== null && param.value !== undefined ? String(param.value) : ''}
            onChange={(e) => onChange(index, e.target.value)}
            className="flex-grow border border-gray-300 dark:border-gray-600 rounded-l-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
            disabled={disabled}
            placeholder={param.inputType === 'Folder' ? "Select folder..." : (param.inputType === 'SaveFile' ? "Enter save path..." : "Select file...")}
          />
          <button
            onClick={handleFileBrowse}
            disabled={disabled}
            className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-r-md border border-l-0 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 transition-colors"
            title="Browse..."
          >
            <FontAwesomeIcon icon={faFolderOpen} />
          </button>
        </div>
      );
    }

    // Case 1: Dropdown (Single Select)
    if (param.options && param.options.length > 0 && !param.multiSelect) {
      if (param.inputType === 'Segmented') {
        return (
          <SegmentedControl
            options={param.options ?? []}
            value={param.value as string}
            onChange={(val) => onChange(index, val)}
            disabled={disabled}
          />
        );
      }

      return (
        <div className="relative w-full">
          <select
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-sm appearance-none"
            value={param.value as string}
            onChange={(e) => onChange(index, e.target.value)}
            disabled={disabled}
          >
            {param.options.map((option: string, i: number) => (
              <option key={i} value={option} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                {option}
              </option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none">
             {/* Custom Chevron for better look across browsers */}
             <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
             </svg>
          </div>
        </div>
      );
    }

    // Case 2: Multi-Select (Checkboxes)
    if (param.multiSelect) {
      return (
        <MultiSelectInput
          param={param}
          index={index}
          onChange={onChange}
          onCompute={onCompute}
          isComputing={isComputing}
          disabled={disabled}
        />
      );
    }

    // Case 3: Boolean
    if (param.type === "boolean") {
      const isChecked = param.value === true || (typeof param.value === 'string' && param.value.toLowerCase() === 'true');
      return (
        <div className="flex items-center">
          <ToggleSwitch
            checked={isChecked}
            onChange={(checked) => onChange(index, checked)}
            disabled={disabled}
          />
          <span className={`ml-3 text-sm font-medium ${isChecked ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}`}>
            {isChecked ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      );
    }

    // Case 4: Number
    if (param.type === "number") {
      const isDecimal = param.numericType === 'double';
      const step = param.step || (isDecimal ? 0.1 : 1);
      const min = (param.min !== undefined && param.min !== null) ? param.min : undefined;
      const max = (param.max !== undefined && param.max !== null) ? param.max : undefined;

      const hasSlider = min !== undefined && max !== undefined && max > min;

      if (hasSlider) {
        return (
          <SliderInput
            min={min!}
            max={max!}
            step={step}
            value={Number(param.value) || min!}
            onChange={(val) => onChange(index, val)}
            disabled={disabled}
            suffix={param.suffix}
          />
        );
      }

      if (param.inputType === 'Stepper') {
        const stepperVal = (param.value !== null && param.value !== undefined && param.value !== "")
          ? Number(param.value)
          : (param.defaultValue !== undefined && param.defaultValue !== null ? Number(param.defaultValue) : (min ?? 0));
        return (
          <StepperInput
            value={isNaN(stepperVal) ? 0 : stepperVal}
            min={min}
            max={max}
            step={step}
            onChange={(val) => onChange(index, val)}
            disabled={disabled}
          />
        );
      }

      return (
        <div className="flex gap-2 w-full items-center">
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
            className="flex-grow border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-sm"
            disabled={disabled}
          />
          {param.selectionType && param.selectionType !== "None" && onPickObject && (
            <button
              onClick={() => onPickObject(param.selectionType!, index)}
              disabled={disabled || isComputing}
              className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 flex items-center justify-center min-w-[40px] transition-colors shadow-sm"
              title={`Select ${param.selectionType} in Revit`}
            >
              <FontAwesomeIcon icon={param.selectionType === 'Point' ? faCrosshairs : faMousePointer} />
            </button>
          )}
        </div>
      );
    }

    // Case X: Point Selection (XYZ)
    if (param.selectionType === 'Point') {
      return (
        <PointInput
          value={String(param.value || "0,0,0")}
          onChange={(val) => onChange(index, val)}
          onPick={() => onPickObject && onPickObject('Point', index)}
          disabled={disabled}
          isPicking={isComputing} // reusing isComputing for loading state
        />
      );
    }

    // Case Y: Color Input
    if (param.inputType === 'Color') {
      return (
        <ColorInput
          value={String(param.value || "#000000")}
          onChange={(val) => onChange(index, val)}
          disabled={disabled}
        />
      );
    }

    // Case 5: Default (String)
    return (
      <div className="flex gap-2 w-full items-center">
        <input
          type="text"
          value={param.value !== null && param.value !== undefined ? String(param.value) : ''}
          onChange={(e) => onChange(index, e.target.value)}
          className="flex-grow border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all shadow-sm"
          disabled={disabled}
        />
        {param.selectionType && param.selectionType !== "None" && onPickObject && (
          <button
            onClick={() => onPickObject(param.selectionType!, index)}
            disabled={disabled || isComputing}
            className="px-3 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 flex items-center justify-center min-w-[40px] transition-colors shadow-sm"
            title={`Select ${param.selectionType} in Revit`}
          >
            <FontAwesomeIcon icon={param.selectionType === 'Point' ? faCrosshairs : faMousePointer} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div key={index} className="flex flex-col space-y-1.5 pb-2">
      <div className="flex justify-between items-baseline min-w-0 mb-1">
        <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 truncate mr-2">
          {param.name}
          {param.suffix && <span className="ml-1 text-gray-400 font-normal text-xs">({param.suffix})</span>}
          {param.required && <span className="text-red-500 ml-1" title="Required">*</span>}
        </label>
        {param.description && (
          <div className="relative group/info">
            <span
              className="text-xs text-gray-400 dark:text-gray-500 italic block truncate max-w-[150px] overflow-hidden whitespace-nowrap cursor-help"
            >
              {param.description}
            </span>
            <div className="absolute z-50 right-0 top-full mt-1 p-2 rounded-md shadow-lg bg-gray-800 text-white text-xs max-w-[250px] break-words opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all duration-200">
              {param.description}
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2 items-start">
        <div className="flex-grow min-w-0">
          {renderInput()}
        </div>
        {param.requiresCompute && onCompute && !param.multiSelect && (
          <button
            onClick={() => onCompute(param.name)}
            disabled={disabled || isComputing}
            className={`flex-shrink-0 p-2.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all shadow-sm ${isComputing ? 'animate-pulse' : ''}`}
            title={param.options && param.options.length > 0 ? `Refresh options (Current: ${param.options.length})` : "Compute options from Revit"}
          >
            <FontAwesomeIcon
              icon={isComputing ? faSpinner : faSync}
              className={`${isComputing ? 'animate-spin' : ''} ${param.options && param.options.length > 0 ? 'text-gray-500 dark:text-gray-400' : 'text-blue-600 dark:text-blue-400'}`}
            />
          </button>
        )}
      </div>
    </div>
  );
};
