import React, { Suspense, lazy } from 'react';
import { Rnd } from 'react-rnd';
const CodeViewer = lazy(() => import('./CodeViewer').then(module => ({ default: module.CodeViewer })));
import type { Script } from '../../../types/scriptModel';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faEdit } from '@fortawesome/free-solid-svg-icons';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth'; // Import useAuth
import { useRevitStatus } from '@/hooks/useRevitStatus'; // Import useRevitStatus

interface FloatingCodeViewerProps {
  script: Script;
  isOpen: boolean;
  onClose: () => void;
}

export const FloatingCodeViewer: React.FC<FloatingCodeViewerProps> = ({ script, isOpen, onClose }) => {
  const { theme } = useTheme();
  const { user, cloudToken } = useAuth(); // Get user and cloudToken from auth context
  const { ParacoreConnected } = useRevitStatus(); // Get ParacoreConnected status

  if (!isOpen) {
    return null;
  }

  const canEdit = !!user && ParacoreConnected;

  const getTitleMessage = () => {
    if (!user) return "You must be signed in to edit scripts";
    if (!ParacoreConnected) return "Paracore is disconnected. Please connect to Revit.";
    return "Edit Script";
  };

  const onDragResizeStart = () => {
    document.body.style.overflow = 'hidden';
  };

  const onDragResizeStop = () => {
    document.body.style.overflow = 'auto';
  };

  const handleEditScript = async () => {
    if (!script || !canEdit) return;

    try {
      const response = await fetch("http://localhost:8000/api/edit-script", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cloudToken}`
        },
        body: JSON.stringify({ scriptPath: script.absolutePath, type: script.type }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
    } catch (error) {
      console.error("Failed to open script for editing:", error);
    }
  };

  return (
    <Rnd
      default={{
        x: 100,
        y: 100,
        width: 600,
        height: 400,
      }}
      minWidth={300}
      minHeight={200}
      bounds="window"
      className={`
        rounded-lg border shadow-2xl
        ${theme === 'dark' ? 'dark bg-gray-800 border-gray-700' : 'bg-white border-gray-300'}
      `}
      style={{ zIndex: 1000 }}
      dragHandleClassName="handle"
      onDragStart={onDragResizeStart}
      onDragStop={onDragResizeStop}
      onResizeStart={onDragResizeStart}
      onResizeStop={onDragResizeStop}
    >
      <div
        className="handle absolute top-0 left-0 right-0 h-10 flex items-center justify-between px-3 cursor-move bg-gray-200 dark:bg-gray-700"
      >
        <span className="font-bold text-gray-800 dark:text-white">{script.name}</span>
        <button onClick={onClose} className="bg-transparent border-none text-gray-800 dark:text-white cursor-pointer">
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </div>
      <div className="absolute top-10 bottom-16 left-0 right-0 overflow-auto">
        <Suspense fallback={<div>Loading...</div>}>
          <CodeViewer script={script} />
        </Suspense>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-16 p-4 border-t border-gray-300 dark:border-gray-600 flex justify-end items-center bg-gray-200 dark:bg-gray-700">
        <button
          onClick={handleEditScript}
          disabled={!canEdit}
          className={`bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold flex items-center ${
            !canEdit ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
          }`}
          title={getTitleMessage()}
        >
          <FontAwesomeIcon icon={faEdit} className="mr-2" />
          Edit in VSCode
        </button>
      </div>
    </Rnd>
  );
};
