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
            <div className="w-full h-9 pl-6 pr-1 text-xs border border-slate-200/50 dark:border-slate-700/30 rounded-xl bg-slate-100/50 dark:bg-slate-900/40 text-blue-600 dark:text-blue-400 flex items-center shadow-inner cursor-default font-mono tracking-tighter overflow-hidden">
              {coords[i] || "0"}
            </div>
          </div>
        ))}
      </div>

      <div className="relative group/pick flex-shrink-0">
        <button
          onClick={onPick}
          disabled={disabled || isPicking}
          className={`w-10 h-10 bg-white dark:bg-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl border border-slate-200 dark:border-slate-700/50 text-slate-400 hover:text-blue-500 flex items-center justify-center transition-all shadow-sm active:scale-90 flex-shrink-0 ${isPicking ? 'animate-pulse' : ''}`}
        >
          <FontAwesomeIcon
            icon={isPicking ? faCrosshairs : (isContextMismatch ? faExclamationTriangle : faCrosshairs)}
            className={`${isPicking ? 'animate-spin' : ''} ${isContextMismatch ? 'text-amber-500' : ''}`}
          />
        </button>

        {!isPicking && (
          <div className="absolute z-[100] right-0 bottom-full mb-3 p-3 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-white text-[10px] font-bold leading-relaxed w-56 opacity-0 invisible group-hover/pick:opacity-100 group-hover/pick:visible transition-all duration-300 transform translate-y-2 group-hover/pick:translate-y-0 pointer-events-none backdrop-blur-xl">
            <div className="flex items-center gap-2 text-blue-500 mb-1.5 pb-1 border-b border-slate-100 dark:border-slate-800 uppercase tracking-widest text-[9px]">
              <FontAwesomeIcon icon={faCrosshairs} className="text-[10px]" /> Point Selection
            </div>
            <div className="text-slate-600 dark:text-slate-300 text-xs font-medium leading-normal">
              Click to pick a coordinate point directly in Revit.
            </div>
            {isContextMismatch && (
              <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2 text-amber-500 font-black uppercase text-[9px] animate-pulse">
                <FontAwesomeIcon icon={faExclamationTriangle} /> Document Mismatch
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
