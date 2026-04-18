import React, { useEffect, useState } from 'react';
import { ParametersTab } from './ParametersTab';
import { ReplModeContent } from './ReplModeContent';
import { useScriptExecution } from '@/features/automation';
import { useScripts } from '../../hooks/useScripts';
import { useUI } from '@/hooks/useUI';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { useAuth } from '@/features/auth';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTerminal, faInfoCircle, faChevronUp, faFile, faFolderOpen, faSave, faCode } from '@fortawesome/free-solid-svg-icons';
import { MetadataTabContent } from './MetadataTabContent';
import { useConsole } from '../../store/ConsoleContext';

export const ScriptInspector: React.FC = () => {
  const { selectedScript, runningScriptPath, setSelectedScript } = useScriptExecution();
  const { scripts } = useScripts();
  const { agentSelectedScriptPath, toggleFloatingCodeViewer } = useUI();
  const { revitStatus, ParacoreConnected } = useRevitStatus();
  const { isAuthenticated } = useAuth();
  const { activeSnippetName, multiLineValue, handleNewSnippet, handleLoadSnippet, handleSaveSnippet } = useConsole();
  
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);

  useEffect(() => {
    if (agentSelectedScriptPath && scripts.length > 0) {
      const script = scripts.find(s => s.absolutePath === agentSelectedScriptPath || s.id === agentSelectedScriptPath);
      if (script) {
        setSelectedScript(script, 'agent');
      }
    }
  }, [agentSelectedScriptPath, scripts, setSelectedScript]);

  const script = selectedScript;
  const isActionable = ParacoreConnected && isAuthenticated;

  const getTooltipMessage = () => {
    if (!isAuthenticated) return "You must sign in to use Paracore";
    if (!ParacoreConnected) return "Paracore server disconnected";
    return "";
  };

  const tooltipMessage = getTooltipMessage();

  return (
    <div className="flex flex-col h-full rounded-none shadow-none bg-white dark:bg-slate-900 overflow-hidden min-w-0">
      {/* Dynamic Header */}
      <div className="flex items-center justify-between px-4 h-12 bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-gray-700 shrink-0">
        <div className="flex items-center gap-3 overflow-hidden">
          {script ? (
            <>
              <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] flex-shrink-0" />
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">
                {script.metadata?.displayName || script.name}
              </span>
            </>
          ) : (
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                <FontAwesomeIcon icon={faTerminal} className="text-[10px]" />
                <span className="text-[11px] font-bold whitespace-nowrap">REPL Playground</span>
              </div>
              {activeSnippetName && (
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 border-l border-slate-200 dark:border-slate-700 ml-2 pl-3">
                  <FontAwesomeIcon icon={faCode} className="text-[10px]" />
                  <span className="text-[10px] font-bold tracking-wider italic truncate max-w-[120px]">{activeSnippetName}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {script ? (
            <>
              <button
                onClick={() => setIsMetadataOpen(!isMetadataOpen)}
                className={`p-1.5 rounded transition-all duration-200 ${isMetadataOpen
                  ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30"
                  : "text-slate-400 hover:text-blue-600 dark:text-slate-500 dark:hover:text-blue-400"
                  }`}
                title="Script Info"
              >
                <FontAwesomeIcon icon={faInfoCircle} />
              </button>
              <button
                onClick={() => setSelectedScript(null)}
                className="p-1.5 text-slate-400 hover:text-red-500 transition-all duration-200 ml-1"
                title="Back to REPL"
              >
                <FontAwesomeIcon icon={faChevronUp} className="text-xs" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={handleNewSnippet} title="New Snippet" className="p-1.5 text-slate-400 hover:text-green-500 transition-colors">
                <FontAwesomeIcon icon={faFile} className="text-xs" />
              </button>
              <button onClick={handleLoadSnippet} title="Load Snippet" className="p-1.5 text-slate-400 hover:text-blue-500 transition-colors">
                <FontAwesomeIcon icon={faFolderOpen} className="text-xs" />
              </button>
              <button 
                onClick={() => handleSaveSnippet(false)} 
                disabled={!multiLineValue.trim()} 
                title="Save Snippet" 
                className={`p-1.5 transition-colors ${multiLineValue.trim() ? 'text-slate-400 hover:text-blue-500' : 'text-slate-200 dark:text-slate-800'}`}
              >
                <FontAwesomeIcon icon={faSave} className="text-xs" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Metadata Panel */}
      {isMetadataOpen && script && script.metadata && (
        <div className="border-b border-slate-200/60 dark:border-slate-700/40 bg-slate-50/80 dark:bg-slate-900/60 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between px-5 pt-3 pb-1">
            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Script Info</span>
            <button onClick={() => setIsMetadataOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded transition-colors">
              <FontAwesomeIcon icon={faChevronUp} className="text-[10px]" />
            </button>
          </div>
          <div className="px-5 pb-4 max-h-[200px] overflow-y-auto custom-scrollbar">
            <MetadataTabContent metadata={script.metadata} scriptName={script.name} />
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative">
        {script ? (
          <div className="h-full w-full overflow-hidden">
            <ParametersTab
              script={script}
              onViewCodeClick={toggleFloatingCodeViewer}
              isActionable={isActionable}
              tooltipMessage={tooltipMessage}
            />
          </div>
        ) : (
          <ReplModeContent />
        )}
      </div>
    </div>
  );
};
