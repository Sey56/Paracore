import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/api/axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'; // not needed here, removing
import { Message, ToolCall, OrchestrationPlan } from '../types/agentTypes';
import { Script, ScriptParameter } from '@/types/scriptModel';
import { useAuth } from '@/features/auth';
import { useNotifications } from '@/hooks/useNotifications';
import { useRevitStatus } from '@/hooks/useRevitStatus';
import { useScriptExecution } from '@/features/automation';
import { useScripts } from '@/features/automation';
import { useConsole, ConsoleItemType } from '@/features/automation/store/ConsoleContext';
import { useUI } from '@/hooks/useUI';
import { useRapServerUrl } from '@/hooks/useRapServerUrl';
import { buildReplPreview } from '../components/ReplPreview';

interface ToolExecutionOptions {
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  threadId: string | null;
  invokeAgent: (msgs: Message[], newMsgs: Message[], opts?: any) => Promise<void>;
}

export function useToolExecution({ messages, setMessages, threadId, invokeAgent }: ToolExecutionOptions) {
  const { isEnterprise } = useAuth();
  const { showNotification } = useNotifications();
  const { revitStatus } = useRevitStatus();
  const { selectedScript, setSelectedScript, runScript, executionResult, userEditedScriptParameters } = useScriptExecution();
  const { scripts } = useScripts();
  const { setLocalHistory } = useConsole();
  const { setActiveInspectorTab, setAgentReplResults, setAgentCapturedDocTitle } = useUI();
  const rapServerUrl = useRapServerUrl();

  const agentRunTriggeredRef = useRef<boolean>(false);

  const [activePlan, setActivePlan] = useState<OrchestrationPlan | null>(null);
  const [currentPlanStepIndex, setCurrentPlanStepIndex] = useState(-1);

  const executePlanStep = useCallback((plan: OrchestrationPlan, stepIndex: number) => {
    let steps = plan.steps;
    if (typeof steps === 'string') {
      try { steps = JSON.parse(steps); } catch (e) { console.error("Failed to parse plan steps:", e); }
    }
    if (!Array.isArray(steps)) { showNotification("Error: Invalid plan steps format.", "error"); return; }
    const step = steps[stepIndex];
    if (!step) return;

    const localScript = scripts.find((s: Script) => {
      const ms = s.id.toLowerCase().replace(/\\/g, '/').replace('.cs', '').split('/').join('_').replace(/ /g, '_').replace(/\./g, '_');
      const ts = step.script_id.toLowerCase().replace(/\\/g, '_').replace('.cs', '');
      return ms.endsWith(ts);
    });

    if (localScript) {
      agentRunTriggeredRef.current = true;
      const finalParams = localScript.parameters.map((p: ScriptParameter) => ({
        ...p, value: step.deduced_parameters[p.name] !== undefined ? step.deduced_parameters[p.name] : p.value
      }));
      setSelectedScript({ ...localScript, parameters: finalParams }, 'agent');
      setActiveInspectorTab('parameters');
      setTimeout(() => { runScript(localScript, finalParams); }, 100);
    } else {
      showNotification(`Error: Script ${step.script_id} not found for plan step.`, "error");
      setActivePlan(null);
      setCurrentPlanStepIndex(-1);
    }
  }, [scripts, setSelectedScript, setActiveInspectorTab, runScript, showNotification]);

  // Plan progression when executionResult changes
  useEffect(() => {
    if (executionResult && agentRunTriggeredRef.current) {
      const hasTableOutput = executionResult.structuredOutput?.some(item => item.type === 'table');
      setActiveInspectorTab(hasTableOutput ? 'table' : 'console');
      const rawOutputPayload = {
        structuredOutput: executionResult.structuredOutput,
        output: executionResult.output,
        internal_data: executionResult.internalData,
      };
      if (activePlan) {
        const nextIndex = currentPlanStepIndex + 1;
        if (nextIndex < activePlan.steps.length) {
          setCurrentPlanStepIndex(nextIndex);
          executePlanStep(activePlan, nextIndex);
        } else {
          invokeAgent(messages, [{ type: 'human', content: `System: Automation plan "${activePlan.action}" finished successfully. summarize results.`, id: `system-${Date.now()}` }],
            { isInternal: true, summary: null, raw_output: rawOutputPayload });
          setActivePlan(null);
          setCurrentPlanStepIndex(-1);
        }
      } else {
        invokeAgent(messages, [{ type: 'human', content: "System: Script execution was successful.", id: `system-${Date.now()}` }],
          { isInternal: true, summary: null, raw_output: rawOutputPayload });
      }
      agentRunTriggeredRef.current = false;
    }
  }, [executionResult]);

  const handleToolResponse = useCallback(async (toolCall: ToolCall, userDecision: 'approve' | 'reject') => {
    const isDynamicQuery = toolCall.name === 'execute_dynamic_query';
    const isScriptRun = toolCall.name.startsWith('run_');

    setMessages(prev => [...prev, {
      type: 'tool', content: JSON.stringify({ user_decision: userDecision }), tool_call_id: toolCall.id,
    }]);

    if (userDecision === 'reject') {
      setMessages(prev => [...prev, {
        type: 'tool', content: 'REJECTED: User declined the action.', tool_call_id: toolCall.id,
      }]);
      return;
    }

    if (isDynamicQuery) {
      try {
        const effectiveUrl = rapServerUrl ? `${rapServerUrl}/api/repl` : "/api/repl";
        const res = await api.post(effectiveUrl, {
          code: toolCall.args.csharp_code,
          session_id: threadId || "temp_session",
          license_tier: isEnterprise ? "enterprise" : "free",
          source: "paracore_agent"
        });

        if (!res.data.is_success) {
          let retryCount = 1;
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].type === 'tool' && typeof messages[i].content === 'string' && (messages[i].content as string).startsWith('ERROR:')) retryCount++;
            else if (messages[i].type === 'human') break;
          }
          const errorMsg = res.data.error_message || res.data.output || 'Unknown REPL execution error';
          const errorContent = `**Execution Failed** (retry ${retryCount}/3)\n\`\`\`\n${errorMsg}\n\`\`\``;
          setMessages(prev => [...prev, { type: 'tool', content: errorContent, tool_call_id: toolCall.id }]);
          const systemMsg = retryCount >= 3
            ? `System: REPL execution failed 3 times. Last error: ${errorMsg}. Do NOT retry. Explain the issue to the user.`
            : `System: REPL execution FAILED (retry ${retryCount}/3). Error: ${errorMsg}. Please correct the C# code and retry.`;
          await invokeAgent(messages, [{ type: 'human', content: systemMsg, id: `system-${Date.now()}` }]);
          return;
        }

        const rawOutputPayload = { structuredOutput: res.data.structured_output, output: res.data.output, internal_data: res.data.internal_data };
        const hasVisual = res.data.structured_output?.some((item: Record<string, unknown>) =>
          ['table', 'chart-bar', 'chart-pie', 'chart-line'].includes(String(item.type)));
        const capturedDoc = revitStatus.document ? revitStatus.document.split(/[\\/]/).pop() || null : null;
        if (hasVisual) { setAgentReplResults(res.data.structured_output); setAgentCapturedDocTitle(capturedDoc); setActiveInspectorTab('table'); }
        else { setAgentReplResults([]); setAgentCapturedDocTitle(null); }

        const textOutput = (res.data.output || '').trim();
        if (textOutput) {
          setLocalHistory(prev => [...prev, { type: 'status' as ConsoleItemType, text: '> Agent', timestamp: new Date() },
            { type: 'output' as ConsoleItemType, text: textOutput, timestamp: new Date() }].slice(-100));
        }

        const previewContent = buildReplPreview(res.data.structured_output, res.data.output);
        if (previewContent) {
          setMessages(prev => [...prev, { type: 'tool', content: previewContent, tool_call_id: toolCall.id }]);
        }

        await invokeAgent(messages, [{ type: 'human', content: `System: REPL execution completed. Do NOT call execute_dynamic_query again. Summarize the results.`, id: `system-${Date.now()}` }],
          { isInternal: true, summary: null, raw_output: rawOutputPayload });
      } catch (err) {
        console.error("Failed to run REPL snippet:", err);
        showNotification("Failed to run snippet in Revit", "error");
        await invokeAgent(messages, [{ type: 'human', content: `System: Execution failed due to server error.`, id: `system-${Date.now()}` }]);
      }
      return;
    }

    if (isScriptRun && selectedScript) {
      agentRunTriggeredRef.current = true;
      const currentParamsArray = userEditedScriptParameters[selectedScript.id] || [];
      const parameters = toolCall.name === 'run_script_by_name' ? toolCall.args.parameters : toolCall.args;
      const finalParams = selectedScript.parameters.map(p => {
        const uiMatch = currentParamsArray.find(up => up.name === p.name);
        const toolArgs = parameters as Record<string, string | number | boolean>;
        return { ...p, value: uiMatch ? uiMatch.value : (toolArgs[p.name] ?? p.value) };
      });
      runScript(selectedScript, finalParams);
    } else if (isScriptRun) {
      showNotification("Error: No script is selected.", "error");
    }
  }, [messages, setMessages, threadId, isEnterprise, rapServerUrl, revitStatus, selectedScript, userEditedScriptParameters, runScript, showNotification, setActiveInspectorTab, setAgentReplResults, setAgentCapturedDocTitle, setLocalHistory, invokeAgent]);

  return { handleToolResponse, executePlanStep, activePlan, setActivePlan, currentPlanStepIndex, setCurrentPlanStepIndex, agentRunTriggeredRef };
}
