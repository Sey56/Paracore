import React, { useEffect } from 'react';
import { InspectorTabs } from './InspectorTabs';
import { useScriptExecution } from '../../hooks/useScriptExecution';
import { useScripts } from '../../hooks/useScripts';
import { useUI } from '@/hooks/useUI';

import { useRevitStatus } from '@/hooks/useRevitStatus'; // Import useRevitStatus
import { useAuth } from '@/features/auth';

export const ScriptInspector: React.FC = () => {
  const { selectedScript, runningScriptPath, setSelectedScript } = useScriptExecution();
  const { scripts } = useScripts();
  const { toggleFloatingCodeViewer, agentSelectedScriptPath } = useUI();
  const { revitStatus, ParacoreConnected } = useRevitStatus(); // Get Revit status and ParacoreConnected
  const { isAuthenticated, user } = useAuth();

  useEffect(() => {
    if (agentSelectedScriptPath && scripts.length > 0) {
      const script = scripts.find(s => s.absolutePath === agentSelectedScriptPath || s.id === agentSelectedScriptPath);
      if (script) {
        setSelectedScript(script, 'agent');
      }
    }
  }, [agentSelectedScriptPath, scripts, setSelectedScript]);

  const script = selectedScript;

  const isRunning = runningScriptPath === script?.id;

  const isCompatibleWithDocument = React.useMemo(() => {
    if (!script) return false; // No script selected, so not compatible

    if (revitStatus.document === null) {
      return false;
    }

    const scriptDocType = script.metadata?.documentType?.trim().toLowerCase();
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

  const isActionable = ParacoreConnected && isCompatibleWithDocument && isAuthenticated;

  const getTooltipMessage = () => {
    if (!isAuthenticated) {
      return "You must sign in to use Paracore";
    }
    if (!ParacoreConnected) {
      return "Paracore server disconnected";
    }
    if (!isCompatibleWithDocument) {
      if (!script) return "";
      const scriptDocType = script.metadata?.documentType?.trim().toLowerCase();

      if (revitStatus.document === null) {
        return "No document opened in Revit";
      }

      if (scriptDocType && scriptDocType !== 'any') {
        return `This script requires '${script.metadata?.documentType || "specified"}' document type, but the current is '${revitStatus.documentType || "None"}'`;
      }
    }
    return "";
  };

  const tooltipMessage = getTooltipMessage();



  return (
    <div className="flex flex-col h-full rounded-none shadow-none bg-white/80 dark:bg-slate-900/60 overflow-hidden min-w-0">
      <InspectorTabs
        script={script}
        isRunning={isRunning}
        onViewCodeClick={toggleFloatingCodeViewer}
        isActionable={isActionable}
        tooltipMessage={tooltipMessage}
      />
    </div>
  );
};
