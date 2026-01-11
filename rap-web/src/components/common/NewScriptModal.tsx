import { useState, useEffect } from 'react';
import { useScripts } from '@/hooks/useScripts';
import { useScriptExecution } from '@/hooks/useScriptExecution';
import { Modal } from './Modal';

interface NewScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedFolder: string;
}

type ScriptType = 'single' | 'multi';

export const NewScriptModal = ({ isOpen, onClose, selectedFolder }: NewScriptModalProps) => {
  const { createNewScript } = useScripts();
  const { setSelectedScript } = useScriptExecution();
  const [scriptType, setScriptType] = useState<ScriptType>('single');
  const [scriptName, setScriptName] = useState('');
  const [folderName, setFolderName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setScriptType('single');
      setScriptName('');
      setFolderName('');
      setError(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  const handleCreate = async () => {
    if (scriptType === 'single' && !scriptName.trim()) {
      setError('Script name cannot be empty.');
      return;
    }
    if (scriptType === 'multi' && !folderName.trim()) {
      setError('Folder name cannot be empty for a multi-script project.');
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const createdScript = await createNewScript({
        parent_folder: selectedFolder,
        script_type: scriptType,
        script_name: scriptType === 'multi' ? 'Main' : scriptName,
        folder_name: scriptType === 'multi' ? folderName : undefined,
      });

      if (createdScript) {
        setSelectedScript(createdScript);
      }

      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Script" size="md">
      <div className="mb-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">Creating in: <span className="font-mono bg-gray-100 dark:bg-gray-700 p-1 rounded">{selectedFolder}</span></p>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
          <span className="block sm:inline">{error}</span>
        </div>
      )}

      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Script Type</label>
        <div className="flex rounded-md shadow-sm">
          <button
            type="button"
            className={`relative inline-flex items-center rounded-l-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium ${scriptType === 'single'
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
              } focus:z-10 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500`}
            onClick={() => setScriptType('single')}
          >
            Single Script
          </button>
          <button
            type="button"
            className={`relative -ml-px inline-flex items-center rounded-r-md border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium ${scriptType === 'multi'
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
              } focus:z-10 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500`}
            onClick={() => setScriptType('multi')}
          >
            Multi-script Folder
          </button>
        </div>
      </div>

      {scriptType === 'multi' && (
        <div className="mb-4">
          <label htmlFor="folderName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Folder Name</label>
          <input type="text" id="folderName" value={folderName} onChange={(e) => setFolderName(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" placeholder="e.g., MyNewProject" />
        </div>
      )}

      {scriptType === 'single' && (
        <div className="mb-6">
          <label htmlFor="scriptName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Script Name (.cs)
          </label>
          <input type="text" id="scriptName" value={scriptName} onChange={(e) => setScriptName(e.target.value)} className="mt-1 block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" placeholder="e.g., HelloWorld" />
        </div>
      )}

      {scriptType === 'multi' && (
        <div className="mb-6">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            A <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">Main.cs</span> entry point will be created automatically.
          </p>
        </div>
      )}

      <div className="flex justify-end space-x-3">
        <button onClick={onClose} disabled={isLoading} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-gray-500">Cancel</button>
        <button onClick={handleCreate} disabled={isLoading} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-400">
          {isLoading ? 'Creating...' : 'Create'}
        </button>
      </div>
    </Modal>
  );
};
