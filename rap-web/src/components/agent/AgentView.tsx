import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useUI } from '@/hooks/useUI';
import { useAuth } from '@/hooks/useAuth';
import api from '@/api/axios';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane, faRobot, faUser, faCheckCircle, faTimesCircle, faSpinner, faTrash } from '@fortawesome/free-solid-svg-icons';
import { useNotifications } from '@/hooks/useNotifications';
import { useScriptExecution } from '@/hooks/useScriptExecution';

import type { Message, ToolCall } from '@/context/providers/UIContext'; // Import Message and ToolCall types
import { Modal } from '@/components/common/Modal';

type AgentResponse = {
  thread_id: string;
  status: "interrupted" | "complete" | "processing_internal";
  message?: string;
  tool_call?: ToolCall;
};

type ChatPayload = {
  thread_id: string | null;
  workspace_path: string;
  token: string | undefined;
  message?: string;
  llm_provider?: string | null;
  llm_model?: string | null;
  llm_api_key_name?: string | null;
  llm_api_key_value?: string | null;
};

export const AgentView: React.FC = () => {
  const {
    activeScriptSource,
    messages,
    setMessages,
    threadId,
    setThreadId,
    isAwaitingApproval,
    setIsAwaitingApproval,
    pendingToolCall,
    setPendingToolCall,
    setAgentSelectedScriptPath,
  } = useUI();
  const { user, cloudToken } = useAuth();
  const { showNotification } = useNotifications();
  const { selectedScript, userEditedScriptParameters } = useScriptExecution();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isClearChatModalOpen, setIsClearChatModalOpen] = useState(false);

  // Declare token and currentWorkspacePath here to make them accessible to handleApproveToolCall
  const token = cloudToken;
  const currentWorkspacePath = activeScriptSource?.type === 'workspace' || activeScriptSource?.type === 'local'
    ? activeScriptSource.path
    : ""; // Ensure it's always a string

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const processAgentResponse = useCallback(async (data: AgentResponse, originalMessageText: string, approvedToolCall: boolean) => {
    console.log('Agent Response:', data);
    setThreadId(data.thread_id);

    if (data.tool_call && data.tool_call.name === 'set_active_script_source_tool') {
      const scriptInfo = data.tool_call.arguments;
      setAgentSelectedScriptPath(scriptInfo.absolutePath);
    }

    if (data.status === "interrupted" && data.tool_call) {
      if (data.tool_call.name === 'get_ui_parameters_tool') {
        console.log("Agent is requesting UI parameters. selectedScript:", selectedScript, "userEditedScriptParameters:", userEditedScriptParameters);
        // Automatically handle this tool call without user approval
        const currentParams = (selectedScript && userEditedScriptParameters[selectedScript.id]) || [];
        try {
          const llmProvider = localStorage.getItem('llmProvider');
          const llmModel = localStorage.getItem('llmModel');
          const llmApiKeyName = localStorage.getItem('llmApiKeyName');
          const llmApiKeyValue = localStorage.getItem('llmApiKeyValue');

          const resumeResponse = await api.post("/agent/resume", {
            thread_id: data.thread_id,
            token: token,
            tool_result: JSON.stringify(currentParams),
            llm_provider: llmProvider,
            llm_model: llmModel,
            llm_api_key_name: llmApiKeyName,
            llm_api_key_value: llmApiKeyValue,
          });
          processAgentResponse(resumeResponse.data, "UI parameters sent.", true);
        } catch (error) {
          console.error("Agent resume error after getting UI params:", error);
          showNotification("Failed to send UI parameters to the agent.", "error");
        }
        return; // Stop further processing for this response
      }

      if (data.tool_call.name !== 'set_active_script_source_tool') { // Already handled
        setPendingToolCall(data.tool_call);
        setIsAwaitingApproval(true);
        setMessages((prev: Message[]) => [...prev, {
          sender: 'agent',
          text: `Agent wants to call tool: ${data.tool_call?.name} with arguments: ${JSON.stringify(data.tool_call?.arguments)}`,
          toolCall: data.tool_call,
        }]);
      }
      setIsLoading(false);
    } else if (data.status === "complete") {
      if (data.message) {
        setMessages((prev: Message[]) => [...prev, { sender: 'agent', text: data.message }]);
      }
      setIsLoading(false);
    } else if (data.status === "processing_internal") {
      setIsLoading(true); // Keep loading true while processing internally
      setTimeout(async () => {
        try {
          const llmProvider = localStorage.getItem('llmProvider');
          const llmModel = localStorage.getItem('llmModel');
          const llmApiKeyName = localStorage.getItem('llmApiKeyName');
          const llmApiKeyValue = localStorage.getItem('llmApiKeyValue');
          // Send an internal message to continue processing
          const internalResponse = await api.post("/agent/chat", {
            thread_id: data.thread_id,
            message: "INTERNAL_CONTINUE_PROCESSING", // Special internal message
            workspace_path: currentWorkspacePath,
            token: token,
            llm_provider: llmProvider,
            llm_model: llmModel,
            llm_api_key_name: llmApiKeyName,
            llm_api_key_value: llmApiKeyValue,
          });
          // Process the internal response recursively
          processAgentResponse(internalResponse.data, originalMessageText, approvedToolCall);
        } catch (internalError: any) {
          console.error("Agent internal processing error:", internalError);
          showNotification("Failed to continue agent processing.", "error");
          setMessages((prev: Message[]) => [...prev, { sender: 'agent', text: "Sorry, I couldn't continue processing." }]);
          setIsLoading(false);
        }
      }, 500); // Re-send after 500ms
    } else {
      showNotification(data.message || "An unknown error occurred with the agent.", "error");
      setMessages((prev: Message[]) => [...prev, { sender: 'agent', text: "Sorry, I encountered an error." }]);
      setIsLoading(false);
    }
  }, [setMessages, setThreadId, setIsAwaitingApproval, setPendingToolCall, showNotification, currentWorkspacePath, token, setAgentSelectedScriptPath, selectedScript, userEditedScriptParameters]); // Add selectedScript and userEditedScriptParameters to dependencies

  const sendMessage = useCallback(async (messageText: string, approvedToolCall: boolean = false) => {
    if (!messageText.trim() && !approvedToolCall) return;

    if (!token) {
      showNotification("You must be logged in to chat with the agent.", "error");
      return;
    }

    if (!approvedToolCall) { // Only add user message if it's not an internal approval message
      setMessages((prev: Message[]) => [...prev, { sender: 'user', text: messageText }]);
    }
    setInput('');
    setIsLoading(true);

    try {
      const llmProvider = localStorage.getItem('llmProvider');
      const llmModel = localStorage.getItem('llmModel');
      const llmApiKeyName = localStorage.getItem('llmApiKeyName');
      const llmApiKeyValue = localStorage.getItem('llmApiKeyValue');

      const chatPayload: ChatPayload = {
        thread_id: threadId,
        workspace_path: currentWorkspacePath,
        token: token,
        llm_provider: llmProvider,
        llm_model: llmModel,
        llm_api_key_name: llmApiKeyName,
        llm_api_key_value: llmApiKeyValue,
      };

      if (!approvedToolCall) {
        chatPayload.message = messageText;
      }
      
      const response = await api.post("/agent/chat", chatPayload);
      processAgentResponse(response.data, messageText, approvedToolCall);
    } catch (error) {
      console.error("Agent chat error:", error);
      showNotification("Failed to communicate with the agent.", "error");
      setMessages((prev: Message[]) => [...prev, { sender: 'agent', text: "Sorry, I couldn't connect to the agent." }]);
      setIsLoading(false);
    }
  }, [token, currentWorkspacePath, threadId, setMessages, showNotification, processAgentResponse]); // Add dependencies

  const handleApproveToolCall = useCallback(async () => {
    if (threadId && pendingToolCall) {
      setIsAwaitingApproval(false);
      setPendingToolCall(null);
      
      if (!token) {
        showNotification("You must be logged in to chat with the agent.", "error");
        return;
      }

      try {
        const llmProvider = localStorage.getItem('llmProvider');
        const llmModel = localStorage.getItem('llmModel');
        const llmApiKeyName = localStorage.getItem('llmApiKeyName');
        const llmApiKeyValue = localStorage.getItem('llmApiKeyValue');

        const resumeResponse = await api.post("/agent/resume", {
          thread_id: threadId,
          token: token,
          workspace_path: currentWorkspacePath, // Add this
          llm_provider: llmProvider,
          llm_model: llmModel,
          llm_api_key_name: llmApiKeyName,
          llm_api_key_value: llmApiKeyValue,
        });
        processAgentResponse(resumeResponse.data, "Tool call approved.", true);
      } catch (error) {
        console.error("Agent resume error:", error);
        showNotification("Failed to resume agent execution.", "error");
        setMessages((prev: Message[]) => [...prev, { sender: 'agent', text: "Sorry, I couldn't resume processing." }]);
        setIsLoading(false);
      }
    }
  }, [threadId, pendingToolCall, token, setMessages, setIsAwaitingApproval, setPendingToolCall, showNotification, processAgentResponse, currentWorkspacePath]); // Add dependencies

  const handleRejectToolCall = useCallback(() => {
    setIsAwaitingApproval(false);
    setPendingToolCall(null);
    setMessages((prev: Message[]) => [...prev, { sender: 'agent', text: "Tool call rejected by user." }]);
    showNotification("Tool call rejected.", "info");
  }, [setMessages, setIsAwaitingApproval, setPendingToolCall, showNotification]); // Add dependencies

  const handleClearChat = useCallback(() => {
    setMessages([{ sender: 'agent', text: 'Hello, How can I help you today?' }]);
    setThreadId(null);
    setIsAwaitingApproval(false);
    setPendingToolCall(null);
    setInput('');
    setIsClearChatModalOpen(false);
    showNotification('Chat history cleared.', 'info');
  }, [
    setMessages,
    setThreadId,
    setIsAwaitingApproval,
    setPendingToolCall,
    setInput,
    setIsClearChatModalOpen,
    showNotification,
  ]);

  const formatAgentMessage = (text: string | undefined) => {
    if (!text) return "";
    let processedText = text;
    // Remove trailing asterisks from words
    processedText = processedText.replace(/(\w+)\*\s*/g, '$1 ');
    // Replace leading asterisk or dash list items with bullet points
    processedText = processedText.replace(/^[\*\- ]+/gm, '• ');
    // Remove apostrophes
    processedText = processedText.replace(/'/g, '');
    // Remove tilde marks
    processedText = processedText.replace(/~/g, '');
    return processedText;
  };

  return (
    <div className="flex flex-col h-full"> {/* Use h-full here for chat scrolling */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 relative">
        <button
          onClick={() => setIsClearChatModalOpen(true)}
          className="absolute top-4 right-4 p-2 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
          title="Clear Chat History"
          disabled={isLoading || isAwaitingApproval}
        >
          <FontAwesomeIcon icon={faTrash} />
        </button>

        {messages.map((msg: Message, index: number) => (
          <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex items-start max-w-xs lg:max-w-md ${msg.sender === 'user' ? 'flex-row-reverse space-x-2 space-x-reverse' : 'space-x-2'}`}>
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${msg.sender === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-300 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}>
                <FontAwesomeIcon icon={msg.sender === 'user' ? faUser : faRobot} />
              </div>
              <div className={`p-3 rounded-lg shadow-md ${msg.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}>
                {msg.toolCall ? (
                  <div>
                    <p className="font-semibold">Tool Call Request:</p>
                    <p><strong>Name:</strong> {msg.toolCall?.name}</p>
                    <p><strong>Arguments:</strong> {JSON.stringify(msg.toolCall?.arguments, null, 2)}</p>
                    {isAwaitingApproval && pendingToolCall?.name === msg.toolCall.name && (
                      <div className="flex space-x-2 mt-2">
                        <button
                          onClick={handleApproveToolCall}
                          className="px-3 py-1 bg-green-500 text-white rounded-md hover:bg-green-600 text-sm"
                          disabled={isLoading}
                        >
                          <FontAwesomeIcon icon={faCheckCircle} className="mr-1" /> Approve
                        </button>
                        <button
                          onClick={handleRejectToolCall}
                          className="px-3 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 text-sm"
                          disabled={isLoading}
                        >
                          <FontAwesomeIcon icon={faTimesCircle} className="mr-1" /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap leading-tight">{formatAgentMessage(msg.text)}</p>
                )}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className={`flex items-start space-x-2`}>
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-gray-300 dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                <FontAwesomeIcon icon={faRobot} />
              </div>
              <div className="p-3 rounded-lg shadow-md bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200">
                <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />Thinking...
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={isLoading || isAwaitingApproval}
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isLoading || isAwaitingApproval}
          >
            <FontAwesomeIcon icon={faPaperPlane} />
          </button>
        </form>
      </div>
      <Modal
        isOpen={isClearChatModalOpen}
        onClose={() => setIsClearChatModalOpen(false)}
        title="Clear Chat History"
        size="sm"
      >
        <div className="p-4 text-center">
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Are you sure you want to clear the entire chat history?
          </p>
          <div className="flex justify-center space-x-4">
            <button
              onClick={() => setIsClearChatModalOpen(false)}
              className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-100 rounded-md hover:bg-gray-400 dark:hover:bg-gray-500"
            >
              Cancel
            </button>
            <button
              onClick={handleClearChat}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Clear Chat
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};