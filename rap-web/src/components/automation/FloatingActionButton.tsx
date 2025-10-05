import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import { useUI } from '@/hooks/useUI';


export const FloatingActionButton: React.FC = () => {
  const [showTooltip, setShowTooltip] = useState(false);
  const { toggleInspector } = useUI();

  const handleClick = () => {
    // For now, just log to console
    toggleInspector();// TODO: Pass 'false' once toggleInspector supports boolean input
  };

  return (
    <button
      id="fab"
      className="fab fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg z-20"
      onClick={handleClick}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <FontAwesomeIcon icon={faPlus} className="text-xl" />
      <span 
        className={`tooltip absolute right-16 bg-gray-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap ${
          showTooltip ? 'block' : 'hidden'
        }`}
      >
        New Script
      </span>
    </button>
  );
};