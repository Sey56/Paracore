import React, { useEffect, useState, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBolt } from '@fortawesome/free-solid-svg-icons';

interface WorkingSetPanelProps {
  workingSet: Record<string, number[]>; // Category -> List of Element IDs
}

const WorkingSetPanel: React.FC<WorkingSetPanelProps> = ({ workingSet }) => {
  const [diff, setDiff] = useState<{ type: 'add' | 'remove'; count: number } | null>(null);
  const prevWorkingSetRef = useRef<Set<number>>(new Set());
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flatten the working set dictionary into a set of IDs for easy comparison
  const currentIds = React.useMemo(() => {
    const ids = new Set<number>();
    if (workingSet) {
      Object.values(workingSet).forEach(list => list.forEach(id => ids.add(id)));
    }
    return ids;
  }, [workingSet]);

  useEffect(() => {
    const prevIds = prevWorkingSetRef.current;

    // Calculate difference
    const added = [...currentIds].filter(x => !prevIds.has(x));
    const removed = [...prevIds].filter(x => !currentIds.has(x));

    if (added.length > 0) {
      setDiff({ type: 'add', count: added.length });
    } else if (removed.length > 0) {
      setDiff({ type: 'remove', count: removed.length });
    }

    // Update ref
    prevWorkingSetRef.current = currentIds;

    // Clear diff message after 3 seconds
    if (added.length > 0 || removed.length > 0) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setDiff(null);
      }, 3000);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [currentIds]);

  // if (currentIds.size === 0) {
  //   return null;
  // }

  return (
    <div className="absolute bottom-20 right-4 flex flex-col items-end space-y-2 pointer-events-none">
      {/* Transient Feedback Bubble */}
      {diff && (
        <div className={`
          px-3 py-1 rounded-full text-xs font-bold shadow-md transition-all duration-300 transform translate-y-0 opacity-100
          ${diff.type === 'add' ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-red-100 text-red-700 border border-red-300'}
        `}>
          {diff.type === 'add' ? '+' : '-'}{diff.count} element{diff.count !== 1 ? 's' : ''}
        </div>
      )}

      {/* Main Status Panel - Only show if there are elements */}
      {currentIds.size > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-900 text-blue-600 dark:text-blue-400 text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center space-x-2 pointer-events-auto">
          <FontAwesomeIcon icon={faBolt} className="text-yellow-500" />
          <span>{currentIds.size} element{currentIds.size !== 1 ? 's' : ''} in working set</span>
        </div>
      )}
    </div>
  );
};

export default WorkingSetPanel;
