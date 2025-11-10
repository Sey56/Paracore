import React, { useCallback } from 'react';
import { open } from '@tauri-apps/api/dialog';
import { useScripts } from '@/hooks/useScripts'; // Import the useScripts hook

const AgentSettings: React.FC = () => {
  // Consume state from the central provider
  const { toolLibraryPath, setToolLibraryPath } = useScripts();

  const handleSelectDirectory = useCallback(async () => {
    try {
      const selectedPath = await open({
        directory: true,
        multiple: false,
        title: 'Select Agent Tool Library',
      });

      if (typeof selectedPath === 'string') {
        setToolLibraryPath(selectedPath); // Update the central state
      }
    } catch (error) {
      console.error("Error selecting directory:", error);
    }
  }, [setToolLibraryPath]);

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Agent Settings</h2>
      <div className="space-y-6">
        <div>
          <label htmlFor="agent-scripts-path" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Agent Tool Library Path
          </label>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Select the root folder where the agent should look for its tools. This should be the directory containing your categorized tool folders (e.g., 01_Element_Creation).
          </p>
          <div className="flex items-center space-x-2">
            <input
              id="agent-scripts-path"
              type="text"
              readOnly
              value={toolLibraryPath || ''}
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
