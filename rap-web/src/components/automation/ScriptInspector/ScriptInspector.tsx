import React from 'react';
import { InspectorTabs } from './InspectorTabs';
import { useScriptExecution } from '@/hooks/useScriptExecution';
import { useScripts } from '@/hooks/useScripts';
import { useUI } from '@/hooks/useUI';
import { ScriptHeader } from './ScriptHeader';
import { useRevitStatus } from '@/hooks/useRevitStatus'; // Import useRevitStatus
import { useAuth } from '@/hooks/useAuth';

export const ScriptInspector: React.FC = () => {
  const { selectedScript, runningScriptPath } = useScriptExecution();
  const { toggleFavoriteScript } = useScripts();
  const { toggleFloatingCodeViewer } = useUI();
  const { revitStatus } = useRevitStatus(); // Get Revit status
  const { isAuthenticated, user } = useAuth();

  const script = selectedScript;

  const isRunning = runningScriptPath === script?.id;

  const isCompatibleWithDocument = React.useMemo(() => {
    if (!script) return false; // No script selected, so not compatible

    if (revitStatus.document === null) {
      return false;
    }

    const scriptDocType = script.metadata.documentType?.trim().toLowerCase();
    const revitDocType = revitStatus.documentType?.trim().toLowerCase();

    // If script's documentType is not specified or is "Any", it's compatible with any open document.
    if (!scriptDocType || scriptDocType === 'any') {
      return true;
    }

    // If Revit document type is not available, but script requires a specific type, it's incompatible.
    if (!revitDocType) {
      return false;
    }

    // Otherwise, check for an exact match.
    return scriptDocType === revitDocType;
  }, [script, revitStatus.document, revitStatus.documentType]);

  const isActionable = isCompatibleWithDocument && isAuthenticated;

  const getTooltipMessage = () => {
    if (!isAuthenticated) {
      return "You must sign in to use RAP";
    }
    if (!isCompatibleWithDocument) {
        if (!script) return "";
        const scriptDocType = script.metadata.documentType?.trim().toLowerCase();

        if (revitStatus.document === null) {
          return "No document opened in Revit";
        }

        if (scriptDocType && scriptDocType !== 'any') {
          return `This script requires '${script.metadata.documentType}' document type, but the current is '${revitStatus.documentType || "None"}'`;
        }
    }
    return "";
  };

  const tooltipMessage = getTooltipMessage();

  return (
    <div className="static h-auto rounded-none shadow-none bg-white dark:bg-gray-800 p-4 overflow-y-auto">
      {!script ? (
        <div className="text-center py-10 text-gray-400 dark:text-gray-500">
          <i className="fas fa-mouse-pointer text-4xl mb-3"></i>
          <p>Select a script from the gallery to inspect and run it</p>
        </div>
      ) : (
        <>
          <div className={!isAuthenticated ? 'opacity-50 pointer-events-none' : ''}>
            <ScriptHeader script={script} onToggleFavorite={toggleFavoriteScript} />
          </div>
          <InspectorTabs
            script={script}
            isRunning={isRunning}
            onViewCodeClick={toggleFloatingCodeViewer}
            isActionable={isActionable}
            tooltipMessage={tooltipMessage}
          />
        </>
      )}
    </div>
  );
};
