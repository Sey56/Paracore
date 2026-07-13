import { useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { Message, ToolCall, ThinkingStep, TokenUsage } from '../types/agentTypes';
import { Script, ScriptParameter } from '@/types/scriptModel';
import { useAuth } from '@/features/auth';
import { useNotifications } from '@/hooks/useNotifications';
import { useRapServerUrl } from '@/hooks/useRapServerUrl';

interface StreamingChatOptions {
  threadId: string | null;
  setThreadId: (tid: string | null) => void;
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  setCumulativeUsage: React.Dispatch<React.SetStateAction<TokenUsage>>;
  selectedScript: Script | null;
  userEditedScriptParameters: Record<string, ScriptParameter[]>;
  toolLibraryPath: string | null;
  scripts: Script[];
}

export function useStreamingChat({
  threadId,
  setThreadId,
  setMessages,
  setCumulativeUsage,
  selectedScript,
  userEditedScriptParameters,
  toolLibraryPath,
  scripts,
}: StreamingChatOptions) {
  const { cloudToken } = useAuth();
  const { showNotification } = useNotifications();
  const rapServerUrl = useRapServerUrl();
  const abortRef = useRef<AbortController | null>(null);

  const invokeAgent = useCallback(async (
    messagesParam: Message[],
    newMessages: Message[],
    options?: { isInternal?: boolean; summary?: string | null; raw_output?: Record<string, unknown> | null }
  ) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (!options?.isInternal && newMessages.some(m => m.type === 'human')) {
      setMessages(prev => [...prev, ...newMessages]);
    }

    try {
      const llmProvider = localStorage.getItem('llmProvider');
      const llmModel = localStorage.getItem('llmModel');
      const llmApiKeyName = localStorage.getItem('llmApiKeyName');
      const llmApiKeyValue = localStorage.getItem('llmApiKeyValue');

      if (!llmProvider || !llmModel || !llmApiKeyValue) {
        showNotification("LLM configuration is missing. Check your settings.", "error");
        return;
      }

      const lastHumanMessage = newMessages.findLast(m => m.type === 'human');
      const messageContent = lastHumanMessage ? lastHumanMessage.content : '';

      // Detect stale raw_history
      const lastRawHistoryMsg = [...messagesParam].reverse().find(m => m.raw_history);
      const lastRawHistoryIdx = lastRawHistoryMsg ? messagesParam.indexOf(lastRawHistoryMsg) : -1;
      const orphanedHumanMessages = lastRawHistoryIdx >= 0
        ? messagesParam.slice(lastRawHistoryIdx + 1).filter(
            m => m.type === 'human' && !(typeof m.content === 'string' && m.content.startsWith('System:'))
          )
        : [];
      const rawHistoryIsStale = orphanedHumanMessages.length > 0;
      const latestRawHistory = lastRawHistoryMsg?.raw_history;

      const currentParamsArray = selectedScript ? userEditedScriptParameters[selectedScript.id] : undefined;
      const currentParamsDict = currentParamsArray
        ? currentParamsArray.reduce((acc, param) => {
            if (param.name) acc[param.name] = param.value ?? '';
            return acc;
          }, {} as Record<string, string | number | boolean | string[] | number[]>)
        : undefined;

      const payload = {
        thread_id: threadId,
        message: messageContent,
        history: (latestRawHistory && !rawHistoryIsStale) ? undefined : messagesParam,
        raw_history: (latestRawHistory && !rawHistoryIsStale) ? latestRawHistory : undefined,
        agent_scripts_path: toolLibraryPath,
        token: cloudToken,
        llm_provider: llmProvider,
        llm_model: llmModel,
        llm_api_key_name: llmApiKeyName,
        llm_api_key_value: llmApiKeyValue,
        user_edited_parameters: currentParamsDict,
        raw_output_for_summary: options?.raw_output,
        tool_call_id: newMessages[0].type === 'tool' ? (newMessages[0] as { tool_call_id: string }).tool_call_id : undefined,
        tool_output: newMessages[0].type === 'tool' ? newMessages[0].content : undefined,
      };

      const baseUrl = rapServerUrl || '';
      const streamUrl = `${baseUrl}/agent/chat/stream`;

      const streamResponse = await fetch(streamUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!streamResponse.ok) {
        const errText = await streamResponse.text().catch(() => '');
        throw new Error(`Stream error ${streamResponse.status}: ${errText}`);
      }

      const reader = streamResponse.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const accumulatedSteps: ThinkingStep[] = [];
      let finalMessage = '';
      let finalRawHistory: string | undefined;
      let finalStatus: 'complete' | 'interrupted' | 'error' = 'complete';
      let finalToolCall: ToolCall | undefined;

      const placeholderId = `ai-${Date.now()}`;
      flushSync(() => {
        setMessages(prev => [...prev, {
          type: 'ai' as const,
          content: '',
          id: placeholderId,
          thinking_steps: [],
        }]);
      });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        let currentEvent = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            let data: Record<string, unknown> = {};
            try { data = JSON.parse(line.slice(6)); } catch { continue; }

            if (currentEvent === 'thinking_step') {
              const idx = (data.step_index as number) ?? accumulatedSteps.length;
              const newStatus = (data.status as ThinkingStep['status']) || 'running';
              if (newStatus === 'running') {
                const synthIdx = accumulatedSteps.findIndex(s => s.tool_name === '__pending__');
                if (synthIdx >= 0) accumulatedSteps.splice(synthIdx, 1);
              }
              accumulatedSteps[idx] = {
                tool_name: (data.tool_name as string) || '',
                justification: (data.justification as string) || '',
                status: newStatus,
                csharp_code: data.csharp_code as string | undefined,
                category_name: data.category_name as string | undefined,
                query: data.query as string | undefined,
                result_summary: data.result_summary as string | undefined,
              };
              if (newStatus === 'completed' || newStatus === 'error') {
                const hasRunning = accumulatedSteps.some(s => s.status === 'running');
                if (!hasRunning) {
                  accumulatedSteps.push({ tool_name: '__pending__', justification: '', status: 'running' });
                }
              }
              const snapshot = [...accumulatedSteps];
              flushSync(() => {
                setMessages(prev => prev.map(m =>
                  m.id === placeholderId ? { ...m, thinking_steps: snapshot } : m
                ));
              });
            } else if (currentEvent === 'interrupted') {
              finalStatus = 'interrupted';
              finalRawHistory = data.raw_history_json as string;
              const tc = data.tool_call as Record<string, unknown> | undefined;
              if (tc) {
                finalToolCall = {
                  id: (tc.id as string) || `tool-call-${Date.now()}`,
                  name: tc.name as string,
                  args: (tc.arguments as ToolCall['args']) || {},
                };
              }
              if (data.thread_id) setThreadId(data.thread_id as string);
              if (data.thinking_steps) { accumulatedSteps.length = 0; accumulatedSteps.push(...(data.thinking_steps as ThinkingStep[])); }
              if (data.usage) {
                const tu = data.usage as TokenUsage;
                setCumulativeUsage(prev => ({
                  input_tokens: prev.input_tokens + tu.input_tokens,
                  output_tokens: prev.output_tokens + tu.output_tokens,
                  total_tokens: prev.total_tokens + tu.total_tokens,
                  requests: prev.requests + tu.requests,
                }));
              }
            } else if (currentEvent === 'complete') {
              finalStatus = 'complete';
              finalMessage = (data.message as string) || '';
              finalRawHistory = data.raw_history_json as string;
              if (data.thread_id) setThreadId(data.thread_id as string);
              if (data.thinking_steps) { accumulatedSteps.length = 0; accumulatedSteps.push(...(data.thinking_steps as ThinkingStep[])); }
              if (data.usage) {
                const tu = data.usage as TokenUsage;
                setCumulativeUsage(prev => ({
                  input_tokens: prev.input_tokens + tu.input_tokens,
                  output_tokens: prev.output_tokens + tu.output_tokens,
                  total_tokens: prev.total_tokens + tu.total_tokens,
                  requests: prev.requests + tu.requests,
                }));
              }
            } else if (currentEvent === 'error') {
              finalStatus = 'error';
              finalMessage = (data.message as string) || 'An error occurred.';
              if (data.thinking_steps) { accumulatedSteps.length = 0; accumulatedSteps.push(...(data.thinking_steps as ThinkingStep[])); }
            }
          }
        }
      }

      const finalSteps = accumulatedSteps.filter(s => s.tool_name !== '__pending__');

      if (finalStatus === 'interrupted' && finalToolCall) {
        setMessages(prev => {
          const filtered = prev.filter(m => m.id !== placeholderId);
          filtered.push({
            type: 'ai', content: `Agent requested tool: ${finalToolCall!.name}`,
            id: `ai-tool-${Date.now()}`, tool_calls: [finalToolCall!],
            raw_history: finalRawHistory, thinking_steps: finalSteps,
          });
          return filtered;
        });
      } else {
        setMessages(prev => prev.map(m =>
          m.id === placeholderId ? { ...m, content: finalMessage, thinking_steps: finalSteps, raw_history: finalRawHistory } : m
        ));
        setMessages(prev => prev.filter(m => {
          if (m.id !== placeholderId) return true;
          return (typeof m.content === 'string' && m.content.trim().length > 0) || (m.thinking_steps?.length || 0) > 0;
        }));
      }
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'AbortError') { /* intentional */ }
      else {
        console.error("Agent invoke error:", error);
        showNotification("Failed to communicate with the agent.", "error");
      }
    }
  }, [threadId, cloudToken, rapServerUrl, toolLibraryPath, selectedScript, userEditedScriptParameters, scripts, setMessages, setThreadId, setCumulativeUsage, showNotification]);

  return { invokeAgent, abortRef };
}
