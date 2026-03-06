import React, { useState, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSync, faSpinner, faFolderOpen, faMousePointer, faCrosshairs, faSearch, faCheck, faExclamationTriangle, faChevronDown, faInfoCircle } from "@fortawesome/free-solid-svg-icons";
import { open, save } from "@tauri-apps/api/dialog";
import { useRevitStatus } from "@/hooks/useRevitStatus";
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
    className={`${checked ? 'bg-blue-600 shadow-[0_0_10px_rgba(59,130,246,0.2)]' : 'bg-slate-200 dark:bg-slate-800'} 
      relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent 
      transition-all duration-300 ease-in-out focus:outline-none 
      ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    <span
      className={`${checked ? 'translate-x-5' : 'translate-x-0'} 
        pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-md
        transition duration-300 ease-in-out`}
    />
  </button>
);

const VirtualList: React.FC<{
  items: string[];
  selectedValues: string[];
  onChange: (option: string, checked: boolean) => void;
  rowHeight: number;
  height: number;
  disabled?: boolean;
  type?: 'single' | 'multi';
}> = ({ items, selectedValues, onChange, rowHeight, height, disabled, type = 'multi' }) => {
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = items.length * rowHeight;
  const visibleCount = Math.ceil(height / rowHeight);
  const startIndex = Math.floor(scrollTop / rowHeight);
  const endIndex = Math.min(items.length, startIndex + visibleCount + 5);

  const activeItems = items.slice(startIndex, endIndex).map((item, index) => ({
    item,
    index: startIndex + index,
  }));

  return (
    <div
      className="overflow-y-auto overflow-x-hidden custom-scrollbar w-full relative"
      style={{ height }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {activeItems.map(({ item }) => {
          const isSelected = selectedValues.includes(item);
          const top = items.indexOf(item) * rowHeight;

          return (
            <div
              key={item}
              onClick={() => !disabled && onChange(item, !isSelected)}
              className={`absolute left-0 right-0 grid grid-cols-[1fr_auto] gap-2 items-center px-4 rounded-lg cursor-pointer transition-all text-[13px] select-none
                ${isSelected
                  ? 'bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400'}`}
              style={{ top, height: rowHeight }}
            >
              <div className="min-w-0" title={item}>
                <div className="truncate w-full block font-medium tracking-tight">{item}</div>
              </div>

              {type === 'multi' && (
                <div className="flex items-center flex-shrink-0">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all
                    ${isSelected
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'}`}>
                    {isSelected && <FontAwesomeIcon icon={faCheck} className="text-[10px]" />}
                  </div>
                </div>
              )}
              {type === 'single' && isSelected && (
                <div className="flex items-center flex-shrink-0 text-blue-600 dark:text-blue-400">
                  <FontAwesomeIcon icon={faCheck} className="text-[11px]" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SingleSelectInput: React.FC<MultiSelectInputProps> = ({ param, index, onChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const value = param.value as string;

  const filteredOptions = (param.options || []).filter(opt =>
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (option: string) => {
    onChange(index, option);
    setIsOpen(false);
    setSearchTerm("");
  };

  return (
    <div className={`relative w-full ${isOpen ? 'z-50' : ''}`}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full h-10 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 text-[13px] font-bold bg-slate-50 dark:bg-slate-800/40 text-left flex justify-between items-center focus:outline-none focus:border-blue-500/30 transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : 'text-slate-700 dark:text-slate-200'}`}
      >
        <span className="truncate mr-2 block min-w-0">
          {value || <span className="text-slate-400 dark:text-slate-600 italic font-normal">Select configuration...</span>}
        </span>
        <FontAwesomeIcon icon={faChevronDown} className={`text-[10px] text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute z-50 w-full mt-2 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200 origin-top border border-slate-100 dark:border-slate-800">
            <div className="p-2 bg-slate-50 dark:bg-slate-800/50">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoFocus
                  className="w-full pl-4 pr-3 py-1.5 text-[13px] font-medium rounded-lg border-none bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/10"
                />
              </div>
            </div>
            <div className="bg-transparent p-1">
              {filteredOptions.length > 0 ? (
                <VirtualList
                  items={filteredOptions}
                  selectedValues={value ? [value] : []}
                  onChange={(opt) => handleSelect(opt)}
                  rowHeight={36}
                  height={Math.min(filteredOptions.length * 36, 360)}
                  type="single"
                />
              ) : (
                <div className="py-6 text-center text-xs text-slate-400 font-bold uppercase tracking-widest italic">
                  No matches found
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const MultiSelectInput: React.FC<MultiSelectInputProps> = ({ param, index, onChange, onCompute, isComputing, disabled }) => {
  const { revitStatus } = useRevitStatus();
  const [searchTerm, setSearchTerm] = useState("");

  const currentDocTitle = revitStatus.document ? revitStatus.document.split(/[\\/]/).pop() : null;
  const isContextMismatch = param.computedInDocument && currentDocTitle && param.computedInDocument !== currentDocTitle;

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

  const handleItemChange = (option: string, checked: boolean) => {
    const newValues = checked
      ? [...selectedValues, option]
      : selectedValues.filter(v => v !== option);
    onChange(index, JSON.stringify(newValues));
  };

  return (
    <div className="flex flex-col border border-slate-200 dark:border-slate-700/50 rounded-2xl bg-slate-50/50 dark:bg-slate-800/20 overflow-hidden w-full min-w-0">
      <div className="flex items-center px-2 py-2 bg-white dark:bg-slate-900/50">
        <div className="relative flex-grow min-w-0 px-1">
          <input
            type="text"
            placeholder="Filter options..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-1.5 text-[13px] font-medium rounded-xl border-none bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/10 transition-all"
            disabled={disabled}
          />
        </div>

        {param.requiresCompute && onCompute && (
          <div className="relative group/compute ml-2">
            <button
              onClick={() => onCompute(param.name)}
              disabled={disabled || isComputing}
              className={`p-2 rounded-xl text-xs transition-all ${isComputing ? 'animate-pulse' : 'active:scale-90'} 
                 ${param.options && param.options.length > 0
                  ? "bg-white dark:bg-slate-800 text-slate-500 hover:text-blue-600"
                  : "bg-blue-600 text-white shadow-lg shadow-blue-500/20"}`}
            >
              <FontAwesomeIcon
                icon={isComputing ? faSpinner : (isContextMismatch ? faExclamationTriangle : faSync)}
                className={`${isComputing ? 'animate-spin' : ''}`}
              />
            </button>

            {param.options && param.options.length > 0 && !isComputing && (
              <div className="absolute z-50 right-0 bottom-full mb-2 p-3 rounded-xl shadow-2xl bg-white dark:bg-slate-900 text-slate-700 dark:text-white text-[12px] font-bold leading-relaxed w-48 opacity-0 invisible group-hover/compute:opacity-100 group-hover/compute:visible transition-all duration-300 transform translate-y-1 group-hover/compute:translate-y-0 pointer-events-none border border-slate-100 dark:border-slate-800">
                <span className="text-blue-500">{param.options.length} options found.</span>
                {isContextMismatch && <div className="mt-1 text-amber-500">⚠ Document Mismatch!</div>}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-1">
        {filteredOptions.length > 0 ? (
          <VirtualList
            items={filteredOptions}
            selectedValues={selectedValues}
            onChange={handleItemChange}
            rowHeight={36}
            height={252}
            disabled={disabled}
          />
        ) : (
          <div className="h-56 py-10 text-center text-[13px] text-slate-400 font-bold italic tracking-tight">
            Discovery awaiting...
          </div>
        )}
      </div>

      <div className="flex justify-between items-center px-4 py-2.5 bg-white dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800 text-[11px] font-black uppercase tracking-widest">
        <span className="text-blue-600 dark:text-blue-400 tabular-nums">
          {selectedValues.length} Selected
        </span>
        <div className="flex gap-4">
          <button onClick={() => handleAllNone(true)} disabled={disabled} className="text-slate-400 hover:text-blue-600 transition-colors disabled:opacity-50">All</button>
          <button onClick={() => handleAllNone(false)} disabled={disabled} className="text-slate-400 hover:text-rose-500 transition-colors disabled:opacity-50">None</button>
        </div>
      </div>
    </div>
  );
};

export const ParameterInput: React.FC<ParameterInputProps> = ({ param, index, onChange, onCompute, onPickObject, isComputing, disabled }) => {
  const { revitStatus } = useRevitStatus();
  const [localValue, setLocalValue] = useState<string>(
    param.value !== null && param.value !== undefined ? String(param.value) : ""
  );

  React.useEffect(() => {
    const incomingValue = param.value !== null && param.value !== undefined ? String(param.value) : "";
    if (incomingValue !== localValue) {
      const isFocused = document.activeElement?.tagName === 'INPUT' && (document.activeElement as HTMLInputElement).value === localValue;
      if (isFocused && parseFloat(incomingValue) === parseFloat(localValue)) return;
      setLocalValue(incomingValue);
    }
  }, [param.value]);

  const currentDocTitle = revitStatus.document ? revitStatus.document.split(/[\\/]/).pop() : null;
  const isContextMismatch = param.computedInDocument && currentDocTitle && param.computedInDocument !== currentDocTitle;

  const handleFileBrowse = async () => {
    try {
      let selection: string | string[] | null = null;
      if (param.inputType === 'SaveFile') {
        selection = await save({
          title: param.description || "Output File Path",
          defaultPath: param.value as string || undefined,
          filters: [{ name: 'CSV', extensions: ['csv'] }, { name: 'All Files', extensions: ['*'] }]
        });
      } else {
        selection = await open({
          multiple: false,
          directory: param.inputType === 'Folder',
          title: param.description || `Station: Select ${param.inputType}`
        });
      }
      if (selection && typeof selection === 'string') onChange(index, selection);
    } catch (err) { console.error("Failed to open file dialog:", err); }
  };

  const renderInput = () => {
    if (param.inputType === 'File' || param.inputType === 'Folder' || param.inputType === 'SaveFile') {
      return (
        <div className="flex gap-2 w-full">
          <input
            type="text"
            value={param.value !== null && param.value !== undefined ? String(param.value) : ''}
            onChange={(e) => onChange(index, e.target.value)}
            className="flex-grow h-10 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 text-[13px] font-bold bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500/30 transition-all shadow-sm"
            disabled={disabled}
            placeholder={param.inputType === 'Folder' ? "Select source folder..." : "Select target path..."}
          />
          <button
            onClick={handleFileBrowse}
            disabled={disabled}
            className="w-10 h-10 bg-white dark:bg-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-700/50 text-slate-400 hover:text-blue-500 transition-all flex items-center justify-center flex-shrink-0 active:scale-90"
          >
            <FontAwesomeIcon icon={faFolderOpen} className="text-xs" />
          </button>
        </div>
      );
    }

    if (param.options && param.options.length > 0 && !param.multiSelect) {
      if (param.inputType === 'Segmented') return <SegmentedControl options={param.options ?? []} value={param.value as string} onChange={(val) => onChange(index, val)} disabled={disabled} />;
      return <SingleSelectInput param={param} index={index} onChange={onChange} disabled={disabled} />;
    }

    if (param.multiSelect) return <MultiSelectInput param={param} index={index} onChange={onChange} onCompute={onCompute} isComputing={isComputing} disabled={disabled} />;

    if (param.type === "boolean") {
      const isChecked = param.value === true || (typeof param.value === 'string' && param.value.toLowerCase() === 'true');
      return (
        <div className="flex items-center p-3 bg-slate-50 dark:bg-slate-800/20 rounded-xl hover:bg-slate-100/50 dark:hover:bg-slate-800/40 transition-all">
          <ToggleSwitch checked={isChecked} onChange={(checked) => onChange(index, checked)} disabled={disabled} />
          <span className={`ml-4 text-[13px] font-bold uppercase tracking-widest ${isChecked ? 'text-blue-500' : 'text-slate-400 dark:text-slate-500'}`}>
            {isChecked ? 'On' : 'Off'}
          </span>
        </div>
      );
    }

    if (param.type === "number") {
      const isDecimal = param.numericType === 'double';
      const step = param.step || (isDecimal ? 0.1 : 1);
      const min = (param.min !== undefined && param.min !== null) ? param.min : undefined;
      const max = (param.max !== undefined && param.max !== null) ? param.max : undefined;
      if (min !== undefined && max !== undefined && max > min) return <SliderInput min={min!} max={max!} step={step} value={Number(param.value) || min!} onChange={(val) => onChange(index, val)} disabled={disabled} suffix={param.suffix} isDecimal={isDecimal} />;
      if (param.inputType === 'Stepper') {
        const stepperVal = (param.value !== null && param.value !== undefined && param.value !== "") ? Number(param.value) : (param.defaultValue !== undefined && param.defaultValue !== null ? Number(param.defaultValue) : (min ?? 0));
        return <StepperInput value={isNaN(stepperVal) ? 0 : stepperVal} min={min} max={max} step={step} onChange={(val) => onChange(index, val)} disabled={disabled} />;
      }
      return (
        <div className="flex gap-2 w-full items-center">
          <input
            type="text"
            value={localValue}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "" || /^-?\d*\.?\d*$/.test(val)) {
                setLocalValue(val);
                if (val !== "" && !val.endsWith(".") && !val.endsWith(".0")) {
                  const parsed = parseFloat(val);
                  if (!isNaN(parsed)) onChange(index, parsed);
                } else if (val === "") onChange(index, 0);
              }
            }}
            onBlur={() => {
              if (param.numericType === 'double' && localValue !== "") {
                const parsed = parseFloat(localValue);
                if (!isNaN(parsed)) {
                  let formatted = String(parsed);
                  if (!formatted.includes(".")) formatted = parsed.toFixed(1);
                  setLocalValue(formatted);
                  onChange(index, parsed);
                }
              }
            }}
            className="flex-grow h-10 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 text-[13px] font-bold bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500/30 transition-all shadow-sm"
            disabled={disabled}
            inputMode="decimal"
          />
          {param.selectionType && param.selectionType !== "None" && onPickObject && (
            <button
              onClick={() => onPickObject(param.selectionType!, index)}
              disabled={disabled || isComputing}
              className="w-10 h-10 bg-white dark:bg-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-700/50 text-slate-400 hover:text-blue-500 flex items-center justify-center transition-all shadow-sm active:scale-90 flex-shrink-0"
            >
              <FontAwesomeIcon icon={isContextMismatch ? faExclamationTriangle : (param.selectionType === 'Point' ? faCrosshairs : faMousePointer)} className={isContextMismatch ? 'text-amber-500' : ''} />
            </button>
          )}
        </div>
      );
    }

    if (param.selectionType === 'Point') return <PointInput value={String(param.value || "0,0,0")} onChange={(val) => onChange(index, val)} onPick={() => onPickObject && onPickObject('Point', index)} disabled={disabled} isPicking={isComputing} computedInDocument={param.computedInDocument} />;
    if (param.inputType === 'Color') return <ColorInput value={String(param.value || "#000000")} onChange={(val) => onChange(index, val)} disabled={disabled} />;

    return (
      <div className="flex gap-2 w-full items-center">
        <input
          type="text"
          value={param.value !== null && param.value !== undefined ? String(param.value) : ''}
          onChange={(e) => onChange(index, e.target.value)}
          className="flex-grow h-10 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 text-[13px] font-bold bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500/30 transition-all shadow-sm"
          disabled={disabled}
        />
        {param.selectionType && param.selectionType !== "None" && onPickObject && (
          <button
            onClick={() => onPickObject(param.selectionType!, index)}
            disabled={disabled || isComputing}
            className="w-10 h-10 bg-white dark:bg-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-700/50 text-slate-400 hover:text-blue-500 flex items-center justify-center transition-all shadow-sm active:scale-90 flex-shrink-0"
          >
            <FontAwesomeIcon icon={isContextMismatch ? faExclamationTriangle : (param.selectionType === 'Point' ? faCrosshairs : faMousePointer)} className={isContextMismatch ? 'text-amber-500' : ''} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div key={index} className="flex flex-col space-y-2 pb-4 border-b border-slate-50 dark:border-slate-800/30 last:border-0 last:pb-0">
      <div className="flex justify-between items-center min-w-0">
        <label className="flex items-center text-[14px] font-bold tracking-wide text-slate-700 dark:text-slate-300 truncate">
          <div className="w-1 h-3 bg-blue-500/40 rounded-full mr-2.5" />
          {param.name}
          {param.suffix && <span className="ml-1 text-slate-400 font-medium text-[11px] font-black uppercase tracking-widest">({param.suffix})</span>}
          {param.required && <span className="text-rose-500 ml-1 font-bold">*</span>}
        </label>
        {param.description && (
          <div className="relative group/info cursor-help">
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 italic tracking-tight truncate max-w-[120px] block uppercase whitespace-nowrap">
              {param.description}
            </span>
            <div className="absolute z-50 right-0 bottom-full mb-2 p-3 rounded-xl shadow-2xl bg-white dark:bg-slate-900 text-slate-700 dark:text-white text-[12px] font-bold leading-relaxed max-w-[240px] break-words opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all duration-300 transform translate-y-1 group-hover/info:translate-y-0 border border-slate-100 dark:border-slate-800">
              {param.description}
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-3 items-start">
        <div className="flex-grow min-w-0">
          {renderInput()}
        </div>
        {param.requiresCompute && onCompute && !param.multiSelect && (
          <div className="relative group/compute">
            <button
              onClick={() => onCompute(param.name)}
              disabled={disabled || isComputing}
              className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700/50 transition-all active:scale-90
                ${isComputing ? 'animate-pulse bg-blue-50 dark:bg-blue-900/20' : ''}
                ${param.options && param.options.length > 0
                  ? "bg-white dark:bg-slate-800/60 text-slate-400 hover:text-blue-500"
                  : "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20"}`}
            >
              <FontAwesomeIcon
                icon={isComputing ? faSpinner : (isContextMismatch ? faExclamationTriangle : faSync)}
                className={`${isComputing ? 'animate-spin' : ''} ${isContextMismatch ? 'text-amber-500' : ''}`}
              />
            </button>

            {param.options && param.options.length > 0 && !isComputing && (
              <div className="absolute z-50 right-0 bottom-full mb-2 p-3 rounded-xl shadow-2xl bg-white dark:bg-slate-900 text-slate-700 dark:text-white text-[12px] font-bold leading-relaxed w-48 opacity-0 invisible group-hover/compute:opacity-100 group-hover/compute:visible transition-all duration-300 transform translate-y-1 group-hover/compute:translate-y-0 pointer-events-none border border-slate-100 dark:border-slate-800">
                <span className="text-blue-500">{param.options.length} options discovered.</span>
                {isContextMismatch && <div className="mt-1 text-amber-500">⚠ Document Mismatch!</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
