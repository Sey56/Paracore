import React, { useState } from 'react';
import { useAgent, AgentMessage, PendingToolCall } from '@/hooks/useAgent';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane, faSpinner } from '@fortawesome/free-solid-svg-icons';

interface AgentApprovalModalProps {
  toolCall: PendingToolCall;
  onApprove: () => void;
  onDeny: () => void;
}

// Simple modal for the HITL approval
const AgentApprovalModal: React.FC<AgentApprovalModalProps> = ({ toolCall, onApprove, onDeny }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl max-w-lg w-full">
      <h3 className="text-lg font-bold mb-4">Agent Action Required</h3>
      <p className="mb-2">The agent wants to run the following script:</p>
      <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded-md text-sm whitespace-pre-wrap">
        <code>
          <strong>Script:</strong> {toolCall.name}\n\n<strong>Parameters:</strong>\n{JSON.stringify(toolCall.arguments, null, 2)}
        </code>
      </pre>
      <div className="flex justify-end space-x-4 mt-6">
        <button onClick={onDeny} className="px-4 py-2 rounded-lg bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500">Deny</button>
        <button onClick={onApprove} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white">Approve</button>
      </div>
    </div>
  </div>
);

export const AgentTabContent: React.FC = () => {
  const { messages, isThinking, pendingToolCall, sendMessage, approveToolCall, denyToolCall } = useAgent();
  const [input, setInput] = useState('');

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="tab-content p-4 flex flex-col h-full" style={{ height: 'calc(100vh - 250px)' }}>
      {pendingToolCall && (
        <AgentApprovalModal toolCall={pendingToolCall} onApprove={approveToolCall} onDeny={denyToolCall} />
      )}
      <div className="flex-grow overflow-y-auto pr-4">
        <div className="space-y-4">
          {messages.map((msg: AgentMessage) => (
            <div key={msg.id} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              <div className={`px-4 py-2 rounded-lg max-w-lg ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700'}`}>
                <p className="text-sm">{msg.content}</p>
              </div>
            </div>
          ))}
          {isThinking && (
            <div className="flex items-end gap-2">
              <div className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700">
                <FontAwesomeIcon icon={faSpinner} spin className="text-sm" />
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the agent to do something..."
            className="flex-grow p-2 rounded-lg border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            disabled={isThinking}
          />
          <button type="submit" className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400" disabled={isThinking}>
            <FontAwesomeIcon icon={faPaperPlane} />
          </button>
        </form>
      </div>
    </div>
  );
};
