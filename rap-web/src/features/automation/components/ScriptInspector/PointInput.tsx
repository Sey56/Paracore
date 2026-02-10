import React, { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRevitStatus } from "@/hooks/useRevitStatus";
import { faCrosshairs, faExclamationTriangle } from "@fortawesome/free-solid-svg-icons";

interface PointInputProps {
  value: string;
  onChange: (newValue: string) => void;
  onPick: () => void;
  disabled?: boolean;
  isPicking?: boolean;
  computedInDocument?: string;
}

export const PointInput: React.FC<PointInputProps> = ({ value, onChange, onPick, disabled, isPicking, computedInDocument }) => {
  const { revitStatus } = useRevitStatus();
  const [coords, setCoords] = useState({ x: 0, y: 0, z: 0 });

  const isContextMismatch = computedInDocument && revitStatus.document && computedInDocument !== revitStatus.document;

  // Sync state with prop value (string -> objects)
  useEffect(() => {
    if (!value) {
      setCoords({ x: 0, y: 0, z: 0 });
      return;
    }

    const parts = value.split(',').map(s => parseFloat(s.trim()));
    if (parts.length === 3 && !parts.some(isNaN)) {
      setCoords({ x: parts[0], y: parts[1], z: parts[2] });
    }
  }, [value]);

  const handleCoordChange = (axis: 'x' | 'y' | 'z', newVal: string) => {
    const numVal = parseFloat(newVal);
    // Allow typing valid numbers, but handle empty/partial inputs gracefully?
    // For now, let's just update if it's a number, or keep 0. 
    // Actually, to allow typing "-", we might need to store local string state, 
    // but simplified approach: update parent immediately.

    const newCoords = { ...coords, [axis]: isNaN(numVal) ? 0 : numVal };
    setCoords(newCoords); // Optimistic update
    onChange(`${newCoords.x},${newCoords.y},${newCoords.z}`);
  };

  return (
    <div className="flex gap-2 w-full items-center">
      <div className="flex gap-1 flex-grow">
        {(['x', 'y', 'z'] as const).map(axis => (
          <div key={axis} className="relative flex-1 min-w-0">
            <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
              <span className="text-xs font-bold text-gray-400 uppercase">{axis}</span>
            </div>
            <input
              type="number"
              step="any"
              value={coords[axis]}
              onChange={(e) => handleCoordChange(axis, e.target.value)}
              className="w-full h-9 pl-6 pr-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
              disabled={disabled}
            />
          </div>
        ))}
      </div>

      <button
        onClick={onPick}
        disabled={disabled || isPicking}
        className={`w-9 h-9 bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 flex items-center justify-center transition-colors flex-shrink-0 p-0 ${isPicking ? 'animate-pulse' : ''}`}
        title={isContextMismatch
          ? `Picked in '${computedInDocument}'. Click to re-pick for '${revitStatus.document}'.`
          : "Pick Point in Revit"}
      >
        <FontAwesomeIcon
          icon={isContextMismatch ? faExclamationTriangle : faCrosshairs}
          className={isContextMismatch ? 'text-amber-500' : ''}
        />
      </button>
    </div>
  );
};
