import React, { Suspense, lazy } from 'react';
import { Rnd } from 'react-rnd';
const CodeViewer = lazy(() => import('./CodeViewer').then(module => ({ default: module.CodeViewer })));
import type { Script } from '../../../types/scriptModel';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faEdit } from '@fortawesome/free-solid-svg-icons';
import { useTheme } from '@/context/ThemeContext';
import { useScriptExecution } from '@/hooks/useScriptExecution';
import { useAuth } from '@/hooks/useAuth';
import { useRevitStatus } from '@/hooks/useRevitStatus';

interface FloatingCodeViewerProps {
  script: Script;
  isOpen: boolean;
  onClose: () => void;
}

export const FloatingCodeViewer: React.FC<FloatingCodeViewerProps> = ({ script, isOpen, onClose }) => {
  const { theme } = useTheme();
  const { user } = useAuth();
  const { ParacoreConnected } = useRevitStatus();
  const { editScript } = useScriptExecution();

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
        className="handle absolute top-0 left-0 right-0 h-11 flex items-center justify-between px-4 cursor-move bg-gray-50/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700/60 rounded-t-lg"
      >
        <span className="font-bold text-gray-700 dark:text-gray-200 text-sm tracking-tight">{script.name}</span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-red-500 transition-colors p-1"
          title="Close Viewer"
        >
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
          onClick={() => editScript(script)}
          disabled={!canEdit}
          className={`bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold flex items-center ${!canEdit ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
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
