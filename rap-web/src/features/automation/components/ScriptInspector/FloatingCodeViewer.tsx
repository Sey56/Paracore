import React, { Suspense, lazy } from 'react';
import { Rnd } from 'react-rnd';
const CodeViewer = lazy(() => import('./CodeViewer').then(module => ({ default: module.CodeViewer })));
import type { Script } from '@/types/scriptModel';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faEdit, faShieldAlt, faHammer } from '@fortawesome/free-solid-svg-icons';
import { useTheme } from '@/context/ThemeContext';
import { useScriptExecution } from '@/features/automation';
import { useAuth } from '@/features/auth';
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
  const { editScript, buildTool } = useScriptExecution();

  if (!isOpen) {
    return null;
  }

  const canEdit = !!user && ParacoreConnected && !script.metadata.isProtected;

  const getTitleMessage = () => {
    if (!user) return "You must be signed in to edit scripts";
    if (!ParacoreConnected) return "Paracore is disconnected. Please connect to Revit.";
    if (script.metadata.isProtected) return "Source code for this tool is protected and cannot be edited.";
    return script.metadata.isWatchdog ? "Edit Sentinel" : "Edit Script";
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
        rounded-lg border
        ${theme === 'dark' || theme === 'midnight' || theme === 'eclipse' ? 'dark bg-slate-800 border-slate-700' : 'bg-white border-slate-300'}
        ${theme === 'eclipse' ? 'shadow-[0_0_40px_rgba(0,0,0,0.6)] border-slate-700/40' : 'shadow-2xl'}
      `}
      style={{ zIndex: 1000 }}
      dragHandleClassName="handle"
      onDragStart={onDragResizeStart}
      onDragStop={onDragResizeStop}
      onResizeStart={onDragResizeStart}
      onResizeStop={onDragResizeStop}
    >
      <div
        className="handle absolute top-0 left-0 right-0 h-11 flex items-center justify-between px-4 cursor-move bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-700/60 rounded-t-lg"
      >
        <span className="font-bold text-slate-700 dark:text-slate-200 text-sm tracking-tight">{script.name}</span>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-red-500 transition-colors p-1"
          title="Close Viewer"
        >
          <FontAwesomeIcon icon={faTimes} />
        </button>
      </div>
      <div className="absolute top-10 bottom-16 left-0 right-0 overflow-auto custom-scrollbar">
        <Suspense fallback={<div>Loading...</div>}>
          <CodeViewer script={script} />
        </Suspense>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-16 p-4 border-t border-slate-300 dark:border-slate-700 flex justify-end items-center bg-slate-100 dark:bg-slate-800">
        <button
          onClick={() => editScript(script)}
          disabled={!canEdit}
          className={`bg-blue-600 text-white py-2 px-4 rounded-lg font-semibold flex items-center ${!canEdit ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
            }`}
          title={getTitleMessage()}
        >
          <FontAwesomeIcon icon={faEdit} className="mr-2" />
          {script.metadata.isWatchdog ? "Edit Sentinel" : "Edit Script"}
        </button>
        {!script.metadata.isProtected && (
          <button
            onClick={() => buildTool(script)}
            disabled={!ParacoreConnected}
            className={`ml-3 bg-indigo-600 text-white py-2 px-4 rounded-lg font-semibold flex items-center ${!ParacoreConnected ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700'
              }`}
            title={ParacoreConnected
              ? `Compile this script into a sealed ${script.metadata.isWatchdog ? '.wtool Sentinel' : '.ptool Tool'} package`
              : "Paracore is disconnected. Please connect to Revit to compile scripts."}
          >
            <FontAwesomeIcon icon={script.metadata.isWatchdog ? faShieldAlt : faHammer} className="mr-2" />
            {script.metadata.isWatchdog ? "Forge Sentinel" : "Forge Tool"}
          </button>
        )}
      </div>
    </Rnd>
  );
};
