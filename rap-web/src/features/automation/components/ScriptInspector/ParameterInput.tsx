import React, { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSync, faSpinner, faFolderOpen, faMousePointer, faCrosshairs, faSearch, faCheck, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
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

const useDropdownPosition = (isOpen: boolean, triggerRef: React.RefObject<HTMLElement | null>) => {
  const [coords, setCoords] = useState({ left: 0, top: 0 as number | 'auto', bottom: 0 as number | 'auto', width: 0, isUp: false, maxHeight: 300 });

  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    
    let isActive = true;

    const updatePosition = () => {
      if (!isActive || !triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      
      const isUp = spaceBelow < 250 && spaceAbove > spaceBelow;
      
      setCoords({
        left: rect.left,
        width: rect.width,
        isUp,
        top: isUp ? 'auto' : rect.bottom + 6,
        bottom: isUp ? window.innerHeight - rect.top + 6 : 'auto',
        maxHeight: isUp ? spaceAbove - 24 : spaceBelow - 24,
      });
    };
    
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    
    return () => {
      isActive = false;
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, triggerRef]);

  return coords;
};

const ToggleSwitch = ({ checked, onChange, disabled }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={() => !disabled && onChange(!checked)}
    className={`${checked ? 'bg-blue-600 shadow-[0_0_10px_rgba(59,130,246,0.3)]' : 'bg-slate-200 dark:bg-slate-800'} 
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
  const endIndex = Math.min(items.length, startIndex + visibleCount + 5); // Buffer

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
              className={`absolute left-0 right-0 grid grid-cols-[1fr_auto] gap-2 items-center px-4 rounded-lg cursor-pointer transition-all text-xs select-none
                ${isSelected
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-bold'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400'}`}
              style={{ top, height: rowHeight }}
            >
              <div className="min-w-0">
                <div className="truncate w-full block tracking-wide">{item}</div>
              </div>

              {type === 'multi' && (
                <div className="flex items-center flex-shrink-0">
                  <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all
                    ${isSelected
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'}`}>
                    {isSelected && <FontAwesomeIcon icon={faCheck} className="text-[10px]" />}
                  </div>
                </div>
              )}
              {type === 'single' && isSelected && (
                <div className="flex items-center flex-shrink-0 text-blue-600 dark:text-blue-400">
                  <FontAwesomeIcon icon={faCheck} className="text-[10px]" />
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const coords = useDropdownPosition(isOpen, buttonRef);

  const value = param.value as string;

  const filteredOptions = (param.options || []).filter(opt =>
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (option: string) => {
    onChange(index, option);
    setIsOpen(false);
    setSearchTerm("");
  };

  const dropdownMaxHeight = Math.max(150, Math.min(coords.maxHeight, 350));
  const targetListHeight = Math.min(filteredOptions.length * 32, dropdownMaxHeight - 55);

  return (
    <div className={`relative w-full ${isOpen ? 'z-50' : ''}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full h-10 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 text-xs font-semibold bg-slate-50 dark:bg-slate-800/40 text-left flex justify-between items-center focus:outline-none focus:border-blue-500/30 transition-all shadow-sm ${disabled ? 'opacity-50 cursor-not-allowed' : 'text-slate-600 dark:text-slate-300'}`}
      >
        <span className="truncate mr-2 block min-w-0 tracking-wide">
          {value || <span className="text-slate-400 dark:text-slate-600 italic font-normal">Select configuration...</span>}
        </span>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && createPortal(
        <>
          <div className="fixed inset-0 z-[100]" onClick={() => setIsOpen(false)} />
          <div 
            className={`fixed z-[100] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200 backdrop-blur-xl ${coords.isUp ? 'origin-bottom' : 'origin-top'}`}
            style={{ 
              left: coords.left, 
              width: coords.width, 
              top: coords.top !== 'auto' ? coords.top : undefined,
              bottom: coords.bottom !== 'auto' ? coords.bottom : undefined,
              maxHeight: dropdownMaxHeight
            }}
          >
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 shrink-0">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-xs" />
                </div>
                <input
                  type="text"
                  placeholder="Filter matrix..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoFocus
                  className="w-full pl-9 pr-3 py-2 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="bg-transparent p-1">
              {filteredOptions.length > 0 ? (
                <VirtualList
                  items={filteredOptions}
                  selectedValues={value ? [value] : []}
                  onChange={(opt) => handleSelect(opt)}
                  rowHeight={32}
                  height={targetListHeight}
                  type="single"
                />
              ) : (
                <div className="py-6 text-center text-xs text-slate-400 font-bold uppercase tracking-widest italic">
                  No matches found
                </div>
              )}
            </div>
          </div>
        </>,
        document.body
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
      if (Array.isArray(param.value)) return (param.value as unknown[]).map((v: unknown) => String(v));
      if (typeof param.value === 'string') {
        const parsed = JSON.parse(param.value);
        return Array.isArray(parsed) ? (parsed as unknown[]).map((v: unknown) => String(v)) : [];
      }
      return [];
    } catch { return []; }
  };

  const selectedValues = getMultiSelectValues();
  const filteredOptions = (param.options || []).filter(opt =>
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAllNone = (selectAll: boolean) => {
    if (selectAll) {
      if (searchTerm) {
        // Incrementally add filtered items to total selection
        const newValues = Array.from(new Set([...selectedValues, ...filteredOptions]));
        onChange(index, JSON.stringify(newValues));
      } else {
        // Standard Behavior: Select everything
        onChange(index, JSON.stringify([...(param.options || [])]));
      }
    } else {
      if (searchTerm) {
        // Incrementally remove filtered items from total selection
        const newValues = selectedValues.filter(v => !filteredOptions.includes(v));
        onChange(index, JSON.stringify(newValues));
      } else {
        // Standard Behavior: Clear everything
        onChange(index, JSON.stringify([]));
      }
    }
  };

  const handleItemChange = (option: string, checked: boolean) => {
    const newValues = checked
      ? [...selectedValues, option]
      : selectedValues.filter(v => v !== option);
    onChange(index, JSON.stringify(newValues));
  };

  return (
    <div className="flex flex-col border border-slate-200 dark:border-slate-700/50 rounded-2xl bg-slate-50/50 dark:bg-slate-800/20 shadow-inner w-full min-w-0">
      <div className="flex items-center px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 rounded-t-2xl">
        <div className="relative flex-grow min-w-0">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <FontAwesomeIcon icon={faSearch} className="text-slate-400 text-xs" />
          </div>
          <input
            type="text"
            placeholder="Filter options..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs font-semibold rounded-xl border border-transparent bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
            disabled={disabled}
          />
        </div>

        {param.requiresCompute && onCompute && (
          <div className="relative group/compute ml-3">
            <button
              onClick={() => onCompute(param.name)}
              disabled={disabled || isComputing}
              className={`p-2 rounded-xl text-xs transition-all shadow-sm ${isComputing ? 'animate-pulse' : 'active:scale-90'} 
                 ${param.options && param.options.length > 0
                  ? "bg-white dark:bg-slate-800 text-slate-500 hover:text-blue-600 border border-slate-200 dark:border-slate-700"
                  : "bg-blue-600 text-white shadow-lg shadow-blue-500/20"}`}
            >
              <FontAwesomeIcon
                icon={isComputing ? faSpinner : (isContextMismatch ? faExclamationTriangle : faSync)}
                className={`${isComputing ? 'animate-spin' : ''}`}
              />
            </button>

            {/* COMPUTE TOOLTIP: Always show info when options exist */}
            {param.options && param.options.length > 0 && !isComputing && (
              <div className="absolute z-50 right-0 bottom-full mb-2 p-3 rounded-xl shadow-2xl bg-white dark:bg-slate-900 text-slate-700 dark:text-white text-[10px] font-bold leading-relaxed w-48 opacity-0 invisible group-hover/compute:opacity-100 group-hover/compute:visible transition-all duration-300 transform translate-y-1 group-hover/compute:translate-y-0 pointer-events-none">
                <div className="flex items-center gap-2 text-blue-400 mb-1 pb-1 uppercase tracking-widest">
                  <FontAwesomeIcon icon={faCheck} className="text-[8px]" /> Computed Results
                </div>
                <span className="text-slate-700 dark:text-white text-xs">{param.options.length} options discovered.</span>
                {param.computedInDocument && (
                  <div className="mt-1 text-slate-500 dark:text-slate-400 text-[9px] italic">
                    Source: {param.computedInDocument}
                  </div>
                )}
                {isContextMismatch && (
                  <div className="mt-2 text-amber-400 font-black pt-1 uppercase">
                    ⚠ Document Mismatch!
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-transparent p-1">
        {filteredOptions.length > 0 ? (
          <VirtualList
            items={filteredOptions}
            selectedValues={selectedValues}
            onChange={handleItemChange}
            rowHeight={32}
            height={224}
            disabled={disabled}
          />
        ) : (
          <div className="h-56 py-10 text-center text-xs text-slate-400 font-bold uppercase tracking-widest italic">
            Discovery awaiting...
          </div>
        )}
      </div>

      <div className="flex justify-between items-center px-4 py-3 bg-white dark:bg-slate-900/80 border-t border-slate-100 dark:border-slate-800 text-xs font-black uppercase tracking-widest rounded-b-2xl">
        <span className="text-blue-600 dark:text-blue-400 tabular-nums">
          {selectedValues.length} Selected
        </span>
        <div className="flex gap-4">
          <button onClick={() => handleAllNone(true)} disabled={disabled} className="text-slate-400 hover:text-blue-600 transition-colors disabled:opacity-50">All</button>
          <button onClick={() => handleAllNone(false)} disabled={disabled} className="text-slate-400 hover:text-rose-500 transition-colors disabled:opacity-50">Clear</button>
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
  const [isFocused, setIsFocused] = useState(false);

  React.useEffect(() => {
    if (isFocused) return; // Never overwrite while user is typing
    const incomingValue = param.value !== null && param.value !== undefined ? String(param.value) : "";
    if (incomingValue !== localValue) {
      setLocalValue(incomingValue);
    }
  }, [param.value, isFocused]);

  const currentDocTitle = revitStatus.document ? revitStatus.document.split(/[\\/]/).pop() : null;
  const isContextMismatch = param.computedInDocument && currentDocTitle && param.computedInDocument !== currentDocTitle;

  // Revit Selection Protection:
  // We prevent manual editing for parameters that represent Revit objects (Elements, Faces, Edges, Points, etc.)
  // because these IDs/Reference strings are sensitive and should only be populated via the selection tool.
  const isRevitSelection = param.selectionType && param.selectionType !== "None";

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
          {isRevitSelection ? (
            <div className="flex-grow h-10 border border-slate-200/50 dark:border-slate-700/30 rounded-xl px-4 text-xs font-bold bg-slate-100/50 dark:bg-slate-900/40 text-blue-600 dark:text-blue-400 flex items-center shadow-inner cursor-default truncate min-w-0 tracking-wider">
              {param.value !== null && param.value !== undefined ? String(param.value) : <span className="text-slate-400 dark:text-slate-600 font-normal italic">None selected</span>}
            </div>
          ) : (
            <input
              type="text"
              value={param.value !== null && param.value !== undefined ? String(param.value) : ''}
              onChange={(e) => onChange(index, e.target.value)}
              className="flex-grow h-10 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 text-xs font-medium bg-slate-50 dark:bg-slate-800/40 text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500/30 transition-all shadow-sm"
              disabled={disabled}
              placeholder={param.inputType === 'Folder' ? "Select source folder..." : "Select target path..."}
            />
          )}
          <button
            onClick={handleFileBrowse}
            disabled={disabled}
            className="w-10 h-10 bg-white dark:bg-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-700/50 text-slate-400 hover:text-blue-500 transition-all flex items-center justify-center flex-shrink-0 shadow-sm active:scale-90"
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
        <div className="flex items-center p-3 bg-slate-50 dark:bg-slate-800/20 rounded-xl border border-transparent hover:border-slate-100 dark:hover:border-slate-700/50 transition-all">
          <ToggleSwitch checked={isChecked} onChange={(checked) => onChange(index, checked)} disabled={disabled} />
          <span className={`ml-4 text-xs font-bold uppercase tracking-[0.15em] ${isChecked ? 'text-blue-500' : 'text-slate-400 dark:text-slate-500'}`}>
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
          {isRevitSelection ? (
            <div className="flex-grow h-10 border border-slate-200/50 dark:border-slate-700/30 rounded-xl px-4 text-xs font-bold bg-slate-100/50 dark:bg-slate-900/40 text-blue-600 dark:text-blue-400 flex items-center shadow-inner cursor-default truncate min-w-0 tracking-wider">
              {param.value !== null && param.value !== undefined ? String(param.value) : <span className="text-slate-400 dark:text-slate-600 font-normal italic">None selected</span>}
            </div>
          ) : (
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
                    if (!isNaN(parsed)) onChange(index, parsed);
                  } else if (val === "") {
                    onChange(index, 0);
                  }
                }
              }}
              onBlur={() => {
                setIsFocused(false);
                if (localValue !== "" && localValue !== "-") {
                  const parsed = parseFloat(localValue);
                  if (!isNaN(parsed)) onChange(index, parsed);
                }
              }}
              className="flex-grow h-10 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 text-xs font-semibold bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-200 focus:outline-none focus:border-blue-500/30 transition-all shadow-sm"
              disabled={disabled}
              inputMode="decimal"
            />
          )}
          {param.selectionType && param.selectionType !== "None" && onPickObject && (
            <div className="relative group/pick flex-shrink-0">
              <button
                onClick={() => onPickObject(param.selectionType!, index)}
                disabled={disabled || isComputing}
                className="w-10 h-10 bg-white dark:bg-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-700/50 text-slate-400 hover:text-blue-500 flex items-center justify-center transition-all shadow-sm active:scale-90 flex-shrink-0"
              >
                <FontAwesomeIcon icon={isContextMismatch ? faExclamationTriangle : (param.selectionType === 'Point' ? faCrosshairs : faMousePointer)} className={isContextMismatch ? 'text-amber-500' : ''} />
              </button>

              {!isComputing && (
                <div className="absolute z-[100] right-0 bottom-full mb-3 p-3 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-white text-[10px] font-bold leading-relaxed w-56 opacity-0 invisible group-hover/pick:opacity-100 group-hover/pick:visible transition-all duration-300 transform translate-y-2 group-hover/pick:translate-y-0 pointer-events-none backdrop-blur-xl">
                  <div className="flex items-center gap-2 text-blue-500 mb-1.5 pb-1 border-b border-slate-100 dark:border-slate-800 uppercase tracking-widest text-[9px]">
                    <FontAwesomeIcon icon={param.selectionType === 'Point' ? faCrosshairs : faMousePointer} className="text-[10px]" /> {param.selectionType} Selection
                  </div>
                  <div className="text-slate-600 dark:text-slate-300 text-xs font-medium leading-normal">
                    Click to pick a {param.selectionType?.toLowerCase()} directly in Revit.
                  </div>
                  {isContextMismatch && (
                    <div className="mt-2.5 pt-2 border-t border-amber-500/20 dark:border-amber-500/10 flex items-center gap-2 text-amber-500 font-black uppercase text-[9px] animate-pulse">
                      <FontAwesomeIcon icon={faExclamationTriangle} /> Document Mismatch
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      );
    }

    if (param.selectionType === 'Point') return <PointInput value={String(param.value || "0,0,0")} onChange={(val) => onChange(index, val)} onPick={() => onPickObject && onPickObject('Point', index)} disabled={disabled} isPicking={isComputing} computedInDocument={param.computedInDocument} />;
    if (param.inputType === 'Color') return <ColorInput value={String(param.value || "#000000")} onChange={(val) => onChange(index, val)} disabled={disabled} />;

    return (
      <div className="flex gap-2 w-full items-center">
        {isRevitSelection ? (
          <div className="flex-grow h-10 border border-slate-200/50 dark:border-slate-700/30 rounded-xl px-4 text-xs font-bold bg-slate-100/50 dark:bg-slate-900/40 text-blue-600 dark:text-blue-400 flex items-center shadow-inner cursor-default truncate min-w-0 tracking-wider">
            {param.value !== null && param.value !== undefined ? String(param.value) : <span className="text-slate-400 dark:text-slate-600 font-normal italic">None selected</span>}
          </div>
        ) : (
          <input
            type="text"
            value={param.value !== null && param.value !== undefined ? String(param.value) : ''}
            onChange={(e) => onChange(index, e.target.value)}
            className="flex-grow h-10 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 text-xs font-semibold bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-200 focus:outline-none focus:border-blue-500/30 transition-all shadow-sm"
            disabled={disabled}
          />
        )}
        {param.selectionType && param.selectionType !== "None" && onPickObject && (
          <div className="relative group/pick flex-shrink-0">
            <button
              onClick={() => onPickObject(param.selectionType!, index)}
              disabled={disabled || isComputing}
              className="w-10 h-10 bg-white dark:bg-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-700/50 text-slate-400 hover:text-blue-500 flex items-center justify-center transition-all shadow-sm active:scale-90 flex-shrink-0"
            >
              <FontAwesomeIcon icon={isContextMismatch ? faExclamationTriangle : (param.selectionType === 'Point' ? faCrosshairs : faMousePointer)} className={isContextMismatch ? 'text-amber-500' : ''} />
            </button>

            {!isComputing && (
              <div className="absolute z-[100] right-0 bottom-full mb-3 p-3 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-white text-[10px] font-bold leading-relaxed w-56 opacity-0 invisible group-hover/pick:opacity-100 group-hover/pick:visible transition-all duration-300 transform translate-y-2 group-hover/pick:translate-y-0 pointer-events-none backdrop-blur-xl">
                <div className="flex items-center gap-2 text-blue-500 mb-1.5 pb-1 border-b border-slate-100 dark:border-slate-800 uppercase tracking-widest text-[9px]">
                  <FontAwesomeIcon icon={param.selectionType === 'Point' ? faCrosshairs : faMousePointer} className="text-[10px]" /> {param.selectionType} Selection
                </div>
                <div className="text-slate-600 dark:text-slate-300 text-xs font-medium leading-normal">
                  Click to pick a {param.selectionType?.toLowerCase()} directly in Revit.
                </div>
                {isContextMismatch && (
                  <div className="mt-2.5 pt-2 border-t border-amber-500/20 dark:border-amber-500/10 flex items-center gap-2 text-amber-500 font-black uppercase text-[9px] animate-pulse">
                    <FontAwesomeIcon icon={faExclamationTriangle} /> Document Mismatch
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      </div>
    );
  };

  return (
    <div key={index} className="flex flex-col space-y-2 pb-4 border-b border-slate-50 dark:border-slate-800/30 last:border-0 last:pb-0">
      <div className="flex justify-between items-center min-w-0">
        <label className="flex items-center text-[13px] font-semibold tracking-wide text-slate-500 dark:text-slate-200 truncate">
          <div className="w-1 h-3 bg-slate-300 dark:bg-slate-600 rounded-full mr-2.5" />
          {param.name}
          {param.suffix && <span className="ml-1 text-slate-400 font-medium text-xs">({param.suffix})</span>}
          {param.required && <span className="text-rose-500 ml-1 font-bold">*</span>}
        </label>
        {param.description && (
          <div className="relative group/info cursor-help">
            <span className="text-xs font-medium text-slate-400 dark:text-slate-300 italic tracking-tight truncate max-w-[120px] block">
              {param.description}
            </span>
            <div className="absolute z-50 right-0 bottom-full mb-2 p-3 rounded-xl shadow-2xl bg-white dark:bg-slate-900 text-slate-700 dark:text-white text-xs font-medium leading-relaxed max-w-[200px] break-words opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all duration-300 transform translate-y-1 group-hover/info:translate-y-0">
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
              className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-xl border transition-all active:scale-90
                ${isComputing ? 'animate-pulse bg-blue-50 dark:bg-blue-900/20' : ''}
                ${param.options && param.options.length > 0
                  ? "bg-white dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/50 text-slate-400 hover:text-blue-500"
                  : "bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20"}`}
            >
              <FontAwesomeIcon
                icon={isComputing ? faSpinner : (isContextMismatch ? faExclamationTriangle : faSync)}
                className={`${isComputing ? 'animate-spin' : ''} ${isContextMismatch ? 'text-amber-500' : ''}`}
              />
            </button>

            {/* COMPUTE TOOLTIP: High-fidelity feedback for standard inputs */}
            {param.options && param.options.length > 0 && !isComputing && (
              <div className="absolute z-50 right-0 bottom-full mb-2 p-3 rounded-xl shadow-2xl bg-white dark:bg-slate-900 text-slate-700 dark:text-white text-[10px] font-bold leading-relaxed w-48 opacity-0 invisible group-hover/compute:opacity-100 group-hover/compute:visible transition-all duration-300 transform translate-y-1 group-hover/compute:translate-y-0 pointer-events-none">
                <div className="flex items-center gap-2 text-blue-400 mb-1 pb-1 uppercase tracking-widest">
                  <FontAwesomeIcon icon={faCheck} className="text-[8px]" /> Computed Results
                </div>
                <span className="text-slate-700 dark:text-white text-xs">{param.options.length} options discovered.</span>
                {param.computedInDocument && (
                  <div className="mt-1 text-slate-500 dark:text-slate-400 text-[9px] italic">
                    Source: {param.computedInDocument}
                  </div>
                )}
                {isContextMismatch && (
                  <div className="mt-2 text-amber-400 font-black pt-1 uppercase">
                    ⚠ Document Mismatch!
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
