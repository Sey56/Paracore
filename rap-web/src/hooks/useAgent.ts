import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

// Define the structure of a message in our chat
export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

// Define the structure of a pending tool call that needs approval
export interface PendingToolCall {
  name: string;
  arguments: any;
}

const API_BASE_URL = 'http://127.0.0.1:8000';

export const useAgent = () => {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [pendingToolCall, setPendingToolCall] = useState<PendingToolCall | null>(null);

  // Function to send a message to the agent
  const sendMessage = async (message: string) => {
    setIsThinking(true);
    const currentThreadId = threadId || uuidv4();
    if (!threadId) {
      setThreadId(currentThreadId);
    }

    // Add user message to the UI immediately
    setMessages(prev => [...prev, { id: uuidv4(), role: 'user', content: message }]);

    try {
      const response = await fetch(`${API_BASE_URL}/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: currentThreadId, message }),
      });

      const data = await response.json();

      if (data.status === 'interrupted') {
        // Agent wants to call a tool, requires user approval
        setPendingToolCall(data.tool_call);
      } else if (data.status === 'complete') {
        // Agent gave a final answer
        setMessages(prev => [...prev, { id: uuidv4(), role: 'assistant', content: data.message }]);
      }
    } catch (error) {
      console.error('Error communicating with agent:', error);
      setMessages(prev => [...prev, { id: uuidv4(), role: 'assistant', content: 'Sorry, I encountered an error.' }]);
    } finally {
      setIsThinking(false);
    }
  };

  // Function to approve a tool call and resume the agent
  const approveToolCall = async () => {
    if (!pendingToolCall || !threadId) return;

    setIsThinking(true);
    setPendingToolCall(null); // Clear the pending tool call

    try {
      const response = await fetch(`${API_BASE_URL}/agent/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thread_id: threadId }),
      });

      const data = await response.json();

      if (data.status === 'complete') {
        // Agent gave a final answer after running the tool
        setMessages(prev => [...prev, { id: uuidv4(), role: 'assistant', content: data.message }]);
      } else {
        // Handle cases where resuming doesn't complete
        setMessages(prev => [...prev, { id: uuidv4(), role: 'assistant', content: 'Sorry, something went wrong after the tool execution.' }]);
      }
    } catch (error) {
      console.error('Error resuming agent:', error);
      setMessages(prev => [...prev, { id: uuidv4(), role: 'assistant', content: 'Sorry, I encountered an error while resuming.' }]);
    } finally {
      setIsThinking(false);
    }
  };

  // Function to deny a tool call
  const denyToolCall = () => {
    setPendingToolCall(null);
    setMessages(prev => [...prev, { id: uuidv4(), role: 'assistant', content: 'Okay, I will not run the tool.' }]);
  };

  return {
    messages,
    isThinking,
    pendingToolCall,
    sendMessage,
    approveToolCall,
    denyToolCall,
  };
};
