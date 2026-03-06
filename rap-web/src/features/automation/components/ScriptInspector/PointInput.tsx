import React from 'react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCrosshairs, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";
import { useRevitStatus } from "@/hooks/useRevitStatus";

interface PointInputProps {
  value: string;
  onChange: (value: string) => void;
  onPick: () => void;
  disabled?: boolean;
  isPicking?: boolean;
  computedInDocument?: string | null;
}

export const PointInput: React.FC<PointInputProps> = ({
  value,
  onChange,
  onPick,
  disabled,
  isPicking,
  computedInDocument
}) => {
  const { revitStatus } = useRevitStatus();
  const currentDocTitle = revitStatus.document ? revitStatus.document.split(/[\\/]/).pop() : null;
  const isContextMismatch = computedInDocument && currentDocTitle && computedInDocument !== currentDocTitle;

  const handleCoordChange = (axis: number, newVal: string) => {
    const coords = value.split(',').map(c => c.trim());
    coords[axis] = newVal;
    onChange(coords.join(','));
  };

  const coords = value.split(',').map(c => c.trim());

  return (
    <div className="flex gap-2 items-center w-full">
      <div className="flex-grow grid grid-cols-3 gap-1">
        {['X', 'Y', 'Z'].map((axis, i) => (
          <div key={axis} className="relative group">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400 select-none">
              {axis}
            </span>
            <input
              type="text"
              value={coords[i] || "0"}
              onChange={(e) => handleCoordChange(i, e.target.value)}
              className="w-full h-9 pl-6 pr-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              disabled={disabled}
            />
          </div>
        ))}
      </div>

      <div className="relative group/pick flex-shrink-0">
        <button
          onClick={onPick}
          disabled={disabled || isPicking}
          className={`w-9 h-9 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 flex items-center justify-center transition-colors flex-shrink-0 p-0 ${isPicking ? 'animate-pulse' : ''}`}
        >
          <FontAwesomeIcon
            icon={isPicking ? faCrosshairs : (isContextMismatch ? faExclamationTriangle : faCrosshairs)}
            className={`${isPicking ? 'animate-spin' : ''} ${isContextMismatch ? 'text-amber-500' : ''}`}
          />
        </button>

        {!isPicking && (
          <div className="absolute z-50 right-0 bottom-full mb-2 p-3 rounded-xl shadow-2xl bg-white dark:bg-slate-900 text-slate-700 dark:text-white text-[10px] font-bold leading-relaxed w-48 opacity-0 invisible group-hover/pick:opacity-100 group-hover/pick:visible transition-all duration-300 transform translate-y-1 group-hover/pick:translate-y-0 pointer-events-none">
            <div className="text-blue-500 mb-1 uppercase tracking-widest">
              Point Selection
            </div>
            Click to pick a point directly in Revit.
            {isContextMismatch && (
              <div className="mt-2 text-amber-400 font-black pt-1 uppercase">
                ⚠ Document Mismatch!
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
