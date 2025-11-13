import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useUI } from '@/hooks/useUI';
import { useAuth } from '@/hooks/useAuth';
import api from '@/api/axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane, faRobot, faUser, faCheckCircle, faTimesCircle, faSpinner, faTrash, faSyncAlt } from '@fortawesome/free-solid-svg-icons';
import { useNotifications } from '@/hooks/useNotifications';
import { useScriptExecution } from '@/hooks/useScriptExecution';
import { useScripts } from '@/hooks/useScripts';

import type { Message, ToolCall } from '@/context/providers/UIContext';
import { Modal } from '@/components/common/Modal';

// This component will be responsible for rendering the new HITL modal
// It will be created in a subsequent step. For now, we define the props.
interface HITLModalProps {
  toolCall: ToolCall;
  onApprove: (parameters: any) => void;
  onReject: () => void;
}

const LOCAL_STORAGE_KEY_MESSAGES = 'agent_chat_messages';
const LOCAL_STORAGE_KEY_THREAD_ID = 'agent_chat_thread_id';

export const AgentView: React.FC = () => {
  const {
    activeScriptSource,
    messages,
    setMessages,
    threadId,
    setThreadId,
    setActiveInspectorTab, // Correctly get from useUI
  } = useUI();
  const { cloudToken } = useAuth();
  const { showNotification } = useNotifications();
  // Correctly get execution-related functions and state from their respective hooks
  const { selectedScript, setSelectedScript, setExecutionResult, userEditedScriptParameters } = useScriptExecution();
  const { fetchScriptManifest, toolLibraryPath, scripts: allScriptsFromScriptProvider } = useScripts();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isClearChatModalOpen, setIsClearChatModalOpen] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const storedMessages = localStorage.getItem(LOCAL_STORAGE_KEY_MESSAGES);
      if (storedMessages) {
        setMessages(JSON.parse(storedMessages));
      }
      const storedThreadId = localStorage.getItem(LOCAL_STORAGE_KEY_THREAD_ID);
      if (storedThreadId) {
        setThreadId(storedThreadId);
      }
    } catch (error) {
      console.error("Failed to load chat history from localStorage:", error);
      // Optionally clear corrupted data
      localStorage.removeItem(LOCAL_STORAGE_KEY_MESSAGES);
      localStorage.removeItem(LOCAL_STORAGE_KEY_THREAD_ID);
    }
  }, [setMessages, setThreadId]);

  // Save to localStorage on messages or threadId change
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_MESSAGES, JSON.stringify(messages));
    } catch (error) {
      console.error("Failed to save messages to localStorage:", error);
    }
  }, [messages]);

  useEffect(() => {
    try {
      if (threadId) {
        localStorage.setItem(LOCAL_STORAGE_KEY_THREAD_ID, threadId);
      } else {
        localStorage.removeItem(LOCAL_STORAGE_KEY_THREAD_ID);
      }
    } catch (error) {
      console.error("Failed to save threadId to localStorage:", error);
    }
  }, [threadId]);


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages, isLoading]);

  const invokeAgent = useCallback(async (newMessages: Message[]) => {
    setIsLoading(true);
    
    // Optimistically add the user's message to the UI for responsiveness
    if (newMessages.some(m => m.type === 'human')) {
        setMessages(prev => [...prev, ...newMessages]);
        setInput('');
    }

    try {
      const llmProvider = localStorage.getItem('llmProvider');
      const llmModel = localStorage.getItem('llmModel');
      const llmApiKeyName = localStorage.getItem('llmApiKeyName');
      const llmApiKeyValue = localStorage.getItem('llmApiKeyValue');

      // Extract the last human message content
      const lastHumanMessage = newMessages.findLast(m => m.type === 'human');
      const messageContent = lastHumanMessage ? lastHumanMessage.content : '';

      const response = await api.post("/agent/chat", {
        thread_id: threadId,
        message: messageContent, // Send a single string message
        workspace_path: activeScriptSource?.type !== 'published' ? activeScriptSource?.path || "" : "",
        agent_scripts_path: toolLibraryPath,
        token: cloudToken,
        llm_provider: llmProvider,
        llm_model: llmModel,
        llm_api_key_name: llmApiKeyName,
        llm_api_key_value: llmApiKeyValue,
      });

      // IMPORTANT: Add a check here to ensure response.data is not null/undefined
      if (!response.data) {
        console.error("AgentView: Received empty or null response data from backend.");
        showNotification("Received an empty response from the agent.", "error");
        setMessages(prev => [...prev, { type: 'ai', content: "Sorry, I received an empty response from the agent.", id: `error-${Date.now()}` }]);
        return; // Stop further processing
      }

      // After any response, update the threadId if the backend provides one
      if (response.data && response.data.thread_id) {
        setThreadId(response.data.thread_id);
      }

      // The API now returns only the new, user-facing messages. We append them.
      if (response.data.status === 'complete' && response.data.message) {
        console.log("AgentView: Received complete message from backend:", response.data.message);
        const agentMessage: Message = { type: 'ai', content: response.data.message, id: `ai-${Date.now()}` };
        setMessages(prev => [...prev, agentMessage]);

        // --- Handle active_script if present ---
        if (response.data.active_script) {
            const scriptInfo = response.data.active_script;
            console.log("AgentView: Detected active_script in response:", scriptInfo);
            const selected = {
                id: scriptInfo.id,
                name: scriptInfo.name,
                type: scriptInfo.type,
                absolutePath: scriptInfo.absolutePath,
                sourcePath: scriptInfo.sourcePath,
                metadata: scriptInfo.metadata,
                parameters: [],
            };
            setSelectedScript(selected, 'agent');
            setActiveInspectorTab('parameters'); // Switch to parameters tab
            showNotification(`Agent selected script: ${selected.name}.`, 'info');
        }
        // --- Handle tool_call for set_active_script_source_tool if present ---
        else if (response.data.tool_call && response.data.tool_call.name === 'set_active_script_source_tool') {
            const scriptInfo = response.data.tool_call.arguments;
            console.log("AgentView: Detected set_active_script_source_tool call:", scriptInfo);
            // Simulate a script object for setSelectedScript
            const selected = {
                id: scriptInfo.absolutePath, // Use absolutePath as ID
                name: scriptInfo.absolutePath.split('/').pop(), // Extract name from path
                type: scriptInfo.type,
                absolutePath: scriptInfo.absolutePath,
                sourcePath: scriptInfo.absolutePath,
                metadata: {
                    displayName: scriptInfo.absolutePath.split('/').pop() || 'Unknown',
                    lastRun: null,
                    dependencies: [],
                    description: 'Metadata will be fetched...',
                    categories: [],
                }, // Metadata will be fetched by ScriptExecutionProvider
                parameters: [], // Add empty parameters to satisfy the type
            };
            setSelectedScript(selected, 'agent');
            setActiveInspectorTab('metadata'); // Switch to metadata tab
            showNotification(`Agent selected script: ${selected.name}.`, 'info');
        }
      } else if (response.data.status === 'interrupted' && response.data.tool_call) {
        console.log("AgentView: Received interrupted status with tool_call:", response.data.tool_call);
        const toolCallMessage: Message = {
            type: 'ai',
            content: `Agent requested tool: ${response.data.tool_call.name}`,
            id: `ai-tool-${Date.now()}`,
            tool_calls: [{
                id: `tool-call-${Date.now()}`, // Generate a unique ID for the frontend
                name: response.data.tool_call.name,
                args: response.data.tool_call.arguments
            }]
        };
        setMessages(prev => [...prev, toolCallMessage]);
      } else if (response.data.status === 'processing_internal') {
        console.log("AgentView: Backend is processing internally. No new user-facing message.");
        // Do nothing, the agent will send a new message when it's ready for user interaction
      } else {
        console.warn("AgentView: Received unexpected response data:", response.data);
        showNotification("Received unexpected response from agent.", "warning");
      }

    } catch (error: any) { // Explicitly type error as any for easier access to properties
      console.error("Agent invoke error:", error);
      // Add detailed logging for the error object
      if (error.response) {
        console.error("Agent invoke error - Server Response Data:", error.response.data);
        console.error("Agent invoke error - Server Response Status:", error.response.status);
        console.error("Agent invoke error - Server Response Headers:", error.response.headers);
      } else if (error.request) {
        console.error("Agent invoke error - No Response Received:", error.request);
      } else {
        console.error("Agent invoke error - Request Setup Error:", error.message);
      }

      showNotification("Failed to communicate with the agent.", "error");
      setMessages(prev => [...prev, { type: 'ai', content: "Sorry, I couldn't connect to the agent.", id: `error-${Date.now()}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [threadId, activeScriptSource, toolLibraryPath, cloudToken, setMessages, setThreadId, showNotification, selectedScript, userEditedScriptParameters, allScriptsFromScriptProvider, setSelectedScript]);

  const sendMessage = (messageText: string) => {
    if (!messageText.trim()) return;
    const newMessage: Message = { type: 'human', content: messageText, id: `user-${Date.now()}` };
    invokeAgent([newMessage]);
  };

  const handleToolResponse = (toolCallId: string, userDecision: 'approve' | 'reject', parameters?: any) => {
    const toolMessageContent = {
      user_decision: userDecision,
      parameters: parameters || {},
    };
    const newMessage: Message = {
      type: 'tool',
      content: JSON.stringify(toolMessageContent),
      tool_call_id: toolCallId,
    };
    invokeAgent([newMessage]);
  };


  const handleClearChat = useCallback(() => {
    setMessages([]); // Set to an empty array
    setThreadId(null);
    setInput('');
    setIsClearChatModalOpen(false);
    localStorage.removeItem(LOCAL_STORAGE_KEY_MESSAGES);
    localStorage.removeItem(LOCAL_STORAGE_KEY_THREAD_ID);
    showNotification('Chat history cleared.', 'info');
  }, [setMessages, setThreadId]);

  // --- Derived State for Rendering ---

  const { activePendingToolCall, resolvedToolCallIds } = useMemo<{ activePendingToolCall: ToolCall | null; resolvedToolCallIds: Set<string> }>(() => {
    const resolvedIds = new Set<string>();
    messages.forEach(msg => {
      if (msg.type === 'tool' && msg.tool_call_id) {
        resolvedIds.add(msg.tool_call_id);
      }
    });

    let activeCall: ToolCall | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.type === 'ai' && msg.tool_calls && msg.tool_calls.length > 0) {
        const unresolvedCall = msg.tool_calls.find((tc: ToolCall) => !resolvedIds.has(tc.id));
        if (unresolvedCall) {
          activeCall = unresolvedCall;
          break;
        }
      }
    }
    return { activePendingToolCall: activeCall, resolvedToolCallIds: resolvedIds };
  }, [messages]);

  // --- Rendering ---

  const renderMessageContent = (msg: any) => {
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      const toolCall = msg.tool_calls[0];
      const isPending = activePendingToolCall?.id === toolCall.id;
      return (
        <div>
          <p className="font-semibold">Tool Call Request:</p>
          <p><strong>Name:</strong> {toolCall.name}</p>
          <p><strong>Arguments:</strong> {JSON.stringify(toolCall.args, null, 2)}</p>
          {isPending && (
            <div className="flex space-x-2 mt-2">
              <button
                onClick={() => handleToolResponse(toolCall.id, 'approve')}
                className="px-3 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 text-sm"
                disabled={isLoading}
              >
                <FontAwesomeIcon icon={faCheckCircle} className="mr-1" /> Approve
              </button>
              <button
                onClick={() => handleToolResponse(toolCall.id, 'reject')}
                className="px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 text-sm"
                disabled={isLoading}
              >
                <FontAwesomeIcon icon={faTimesCircle} className="mr-1" /> Reject
              </button>
            </div>
          )}
        </div>
      );
    }

    // Handle complex content structures from LangChain
    let contentToRender = '';
    if (typeof msg.content === 'string') {
      contentToRender = msg.content;
    } else if (Array.isArray(msg.content)) {
      // It's an array of content blocks
      contentToRender = msg.content
        .map((item: any) => (typeof item === 'object' && item.text ? item.text : ''))
        .join('\n');
    } else if (typeof msg.content === 'object' && msg.content !== null) {
      // It's a single content block object
      contentToRender = msg.content.text || '';
    }

    return <p className="whitespace-pre-wrap leading-tight">{contentToRender}</p>;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Static Header */}
      <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-500 dark:text-gray-400">Hello, How can I help you today?</p>
        <div className="flex space-x-2">
          <button
            onClick={fetchScriptManifest}
            className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Refresh Agent Script Manifest"
            disabled={isLoading}
          >
            <FontAwesomeIcon icon={faSyncAlt} />
          </button>
          <button
            onClick={() => setIsClearChatModalOpen(true)}
            className="p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Clear Chat History"
            disabled={isLoading}
          >
            <FontAwesomeIcon icon={faTrash} />
          </button>
        </div>
      </div>

      {/* Scrollable Chat History */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Messages */}
        {messages.map((msg: any, index: number) => {
          const sender = msg.type === 'human' ? 'user' : 'agent';
          // We don't render tool messages directly
          if (msg.type === 'tool') return null;

          return (
            <div key={index} className={`flex ${sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex items-start max-w-xs lg:max-w-md ${sender === 'user' ? 'flex-row-reverse space-x-2 space-x-reverse' : 'space-x-2'}`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${sender === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-300 dark:bg-gray-700'}`}>
                  <FontAwesomeIcon icon={sender === 'user' ? faUser : faRobot} />
                </div>
                <div className={`p-3 rounded-lg shadow-md ${sender === 'user' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-700'}`}>
                  {renderMessageContent(msg)}
                </div>
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex justify-start">
            <div className="flex items-start space-x-2">
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gray-300 dark:bg-gray-700">
                <FontAwesomeIcon icon={faRobot} />
              </div>
              <div className="p-3 rounded-lg shadow-md bg-white dark:bg-gray-700">
                <FontAwesomeIcon icon={faSpinner} spin /> Thinking...
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading}
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            disabled={isLoading}
          >
            <FontAwesomeIcon icon={faPaperPlane} />
          </button>
        </form>
      </div>

      {/* Clear Chat Modal */}
      <Modal isOpen={isClearChatModalOpen} onClose={() => setIsClearChatModalOpen(false)} title="Clear Chat History">
        <div className="p-4 text-center">
          <p className="mb-4">Are you sure you want to clear the entire chat history?</p>
          <div className="flex justify-center space-x-4">
            <button onClick={() => setIsClearChatModalOpen(false)} className="px-4 py-2 bg-gray-300 rounded-md hover:bg-gray-400">Cancel</button>
            <button onClick={handleClearChat} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">Clear Chat</button>
          </div>
        </div>
      </Modal>
    </div>
  );
};