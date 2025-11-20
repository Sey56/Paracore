import React from 'react';

interface WorkingSetPanelProps {
  workingSet: number[]; // The list of element IDs
  // We'll add more props later, e.g., for getting element details
}

const WorkingSetPanel: React.FC<WorkingSetPanelProps> = ({ workingSet }) => {
  if (!workingSet || workingSet.length === 0) {
    return null; // Don't render anything if the working set is empty
  }

  const count = workingSet.length;
  const summaryText = `${count} element${count > 1 ? 's' : ''} in working set`;

  return (
    <div className="absolute bottom-20 right-4 bg-blue-100 border border-blue-400 text-blue-800 text-xs font-semibold px-3 py-1 rounded-full shadow-lg flex items-center">
      <span className="mr-2">⚡</span>
      <span>{summaryText}</span>
      {/* We can add a clear button here later */}
      {/* <button className="ml-2 text-blue-500 hover:text-blue-700">×</button> */}
    </div>
  );
};

export default WorkingSetPanel;
