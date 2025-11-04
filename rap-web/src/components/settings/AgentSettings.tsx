import React, { useState, useEffect, useCallback } from 'react';
import { open } from '@tauri-apps/api/dialog';

const AgentSettings: React.FC = () => {
  const [agentScriptsPath, setAgentScriptsPath] = useState<string>('');

  useEffect(() => {
    // Load the saved path from localStorage when the component mounts
    const savedPath = localStorage.getItem('agentScriptsPath');
    if (savedPath) {
      setAgentScriptsPath(savedPath);
    }
  }, []);

  const handleSelectDirectory = useCallback(async () => {
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: 'Select Agent Scripts Workspace',
      });

      if (typeof selectedPath === 'string') {
        setAgentScriptsPath(selectedPath);
        // Save the selected path to localStorage
        localStorage.setItem('agentScriptsPath', selectedPath);
      }
    } catch (error) {
      console.error("Error selecting directory:", error);
    }
  }, []);

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Agent Settings</h2>
      <div className="space-y-6">
        <div>
          <label htmlFor="agent-scripts-path" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Agent Scripts Workspace Path
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Select the root folder where the agent should look for its scripts. This should be the directory containing your categorized script folders (e.g., 01_Element_Creation).
          </p>
          <div className="flex items-center space-x-2">
            <input
              id="agent-scripts-path"
              type="text"
              readOnly
              value={agentScriptsPath}
              placeholder="No path selected"
              className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none"
            />
            <button
              onClick={handleSelectDirectory}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              Browse...
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentSettings;
