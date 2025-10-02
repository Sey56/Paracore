import { open } from '@tauri-apps/api/dialog';
import { useScripts } from '@/hooks/useScripts';
import { FolderIcon, TrashIcon } from '@heroicons/react/24/outline';

interface ScriptAutomationSettingsProps {
  isAuthenticated: boolean;
}

const ScriptAutomationSettings: React.FC<ScriptAutomationSettingsProps> = ({ isAuthenticated }) => {
  const { customScriptFolders, addCustomScriptFolder, removeCustomScriptFolder } = useScripts();

  const handleAddFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
    });
    if (typeof selected === 'string') {
      addCustomScriptFolder(selected);
    }
  };

  return (
    <fieldset disabled={!isAuthenticated} className="disabled:opacity-50">
      <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">Local Folders</h3>
      
      <div className="space-y-4 mb-8">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Add folders to scan for C# scripts. The application will find all `.cs` files in the root of the folder and treat subdirectories as multi-script execution units.
        </p>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={handleAddFolder}
            className="px-4 py-2 bg-blue-500 text-white text-sm font-semibold rounded-md shadow-sm hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
          >
            Add Folder
          </button>
        </div>
      </div>

      <div>
        <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-4">Managed Folders</h4>
        <ul className="space-y-3">
          {customScriptFolders.length > 0 ? (
            customScriptFolders.map((folder: string, index: number) => (
              <li key={index} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                <div className="flex items-center">
                  <FolderIcon className="h-6 w-6 text-blue-500 mr-4" />
                  <span className="text-sm font-mono text-gray-700 dark:text-gray-300">{folder}</span>
                </div>
                <button
                  onClick={() => removeCustomScriptFolder(folder)}
                  className="p-2 rounded-full text-gray-400 hover:bg-red-100 dark:hover:bg-red-900/50 hover:text-red-500 transition-colors"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </li>
            ))
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
              No custom script folders have been added yet.
            </p>
          )}
        </ul>
      </div>
    </fieldset>
  );
};

export default ScriptAutomationSettings;
