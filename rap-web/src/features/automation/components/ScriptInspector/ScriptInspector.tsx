import React, { useEffect, useState } from 'react';
import { ParametersTab } from './ParametersTab';
import { useScriptExecution } from '@/features/automation';
import { useScripts } from '../../hooks/useScripts';
import { useUI } from '@/hooks/useUI';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { useAuth } from '@/features/auth';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faInfoCircle, faArrowLeft, faCode, faEdit } from '@fortawesome/free-solid-svg-icons';
import { MetadataTabContent } from './MetadataTabContent';
import { Tooltip } from '@/components/common/Tooltip';

interface ScriptInspectorProps {
  onBack?: () => void;
}

export const ScriptInspector: React.FC<ScriptInspectorProps> = ({ onBack }) => {
  const { selectedScript, setSelectedScript, editScript } = useScriptExecution();
  const { scripts } = useScripts();
  const { toggleFloatingCodeViewer } = useUI();
  const { revitStatus, ParacoreConnected } = useRevitStatus();
  const { isAuthenticated } = useAuth();

  const [isMetadataOpen, setIsMetadataOpen] = useState(false);

  const script = selectedScript;
  const isActionable = ParacoreConnected && isAuthenticated;

  const getTooltipMessage = () => {
    if (!isAuthenticated) return "You must sign in to use Paracore";
    if (!ParacoreConnected) return "Paracore server disconnected";
    return "";
  };

  const tooltipMessage = getTooltipMessage();

  // If no script is selected, show a minimal fallback (shouldn't normally happen)
  if (!script) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-white dark:bg-slate-900 text-slate-400">
        <p className="text-sm">No script selected</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full rounded-none shadow-none bg-white dark:bg-slate-900 overflow-hidden min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-12 bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] flex-shrink-0" />
          <span
            className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate"
            title={script.metadata?.displayName || script.name}
          >
            {script.metadata?.displayName || script.name}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Tooltip text="View Code" position="bottom-center">
            <button
              onClick={toggleFloatingCodeViewer}
              className="p-1.5 text-slate-400 hover:text-blue-500 transition-colors rounded"
            >
              <FontAwesomeIcon icon={faCode} className="text-xs" />
            </button>
          </Tooltip>
          <Tooltip text="Edit Script" position="bottom-center">
            <button
              onClick={() => editScript(script)}
              disabled={!isActionable}
              className={`p-1.5 transition-colors rounded ${isActionable ? 'text-slate-400 hover:text-blue-500' : 'text-slate-200 dark:text-slate-800'}`}
            >
              <FontAwesomeIcon icon={faEdit} className="text-xs" />
            </button>
          </Tooltip>
          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
          {onBack && (
            <Tooltip text="Back to Gallery" position="bottom-center">
              <button
                onClick={onBack}
                className="p-1.5 text-slate-400 hover:text-blue-500 transition-colors rounded"
              >
                <FontAwesomeIcon icon={faArrowLeft} className="text-xs" />
              </button>
            </Tooltip>
          )}
          <Tooltip text="Script Info" position="bottom-center">
            <button
              onClick={() => setIsMetadataOpen(!isMetadataOpen)}
              className={`p-1.5 rounded transition-all duration-200 ${isMetadataOpen
                ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30"
                : "text-slate-400 hover:text-blue-600 dark:text-slate-500 dark:hover:text-blue-400"
                }`}
            >
              <FontAwesomeIcon icon={faInfoCircle} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Metadata Panel */}
      {isMetadataOpen && script.metadata && (
        <div className="border-b border-slate-200/60 dark:border-slate-700/40 bg-slate-50/80 dark:bg-slate-900/60 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center px-5 pt-3 pb-1">
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Script Info</span>
          </div>
          <div className="px-5 pb-4 max-h-[200px] overflow-y-auto custom-scrollbar">
            <MetadataTabContent metadata={script.metadata} scriptName={script.name} />
          </div>
        </div>
      )}

      {/* Content Area — Parameters only */}
      <div className="flex-1 overflow-hidden">
        <ParametersTab
          script={script}
          onViewCodeClick={toggleFloatingCodeViewer}
          isActionable={isActionable}
          tooltipMessage={tooltipMessage}
        />
      </div>
    </div>
  );
};
