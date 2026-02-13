import { useState, useEffect } from 'react';
import { useScripts } from '@/features/automation';
import { useScriptExecution } from '@/features/automation';
import { Modal } from '@/components/common/Modal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileCode, faFolderOpen, faSync, faStethoscope, faSearch, faCube, faExchangeAlt, faChartPie, faCode } from '@fortawesome/free-solid-svg-icons';

interface NewScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedFolder: string;
}

type ScriptType = 'single' | 'multi';

const ARCHETYPES = [
  { id: 'blank', label: 'Blank Canvas', icon: faCode, description: 'Standard Hello World template.' },
  { id: 'selection-surgeon', label: 'Selection Surgeon', icon: faStethoscope, description: 'Modify currently selected elements.' },
  { id: 'project-auditor', label: 'Project Auditor', icon: faSearch, description: 'Scan project for rule violations.' },
  { id: 'batch-creator', label: 'Batch Creator', icon: faCube, description: 'Iterative creation of elements.' },
  { id: 'parameter-porter', label: 'Parameter Porter', icon: faExchangeAlt, description: 'Copy data between Revit parameters.' },
  { id: 'visualizer', label: 'Visualizer', icon: faChartPie, description: 'Analysis with charts and tables.' },
];

export const NewScriptModal = ({ isOpen, onClose, selectedFolder }: NewScriptModalProps) => {
  const { createNewScript } = useScripts();
  const { setSelectedScript } = useScriptExecution();
  const [scriptType, setScriptType] = useState<ScriptType>('single');
  const [templateId, setTemplateId] = useState('blank');
  const [scriptName, setScriptName] = useState('');
  const [folderName, setFolderName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setScriptType('single');
      setTemplateId('blank');
      setScriptName('');
      setFolderName('');
      setSearchTerm('');
      setError(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  const filteredArchetypes = ARCHETYPES.filter(arch => 
    arch.label.toLowerCase().includes(searchTerm.toLowerCase()) || 
    arch.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        template_id: scriptType === 'single' ? templateId : undefined,
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
      <div className="flex flex-col max-h-[75vh]">
        <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar space-y-6">
          {/* Location Info */}
          <div className="flex items-center text-sm text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700 shrink-0">
            <FontAwesomeIcon icon={faFolderOpen} className="mr-2 text-blue-500" />
            <span className="mr-1">Creating in:</span>
            <span className="font-mono font-medium text-gray-700 dark:text-gray-300 truncate" title={selectedFolder}>
              {selectedFolder}
            </span>
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-300 px-4 py-3 rounded-lg text-sm" role="alert">
              {error}
            </div>
          )}

          {/* Script Type Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Script Type</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all duration-200 ${scriptType === 'single'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                onClick={() => setScriptType('single')}
              >
                <FontAwesomeIcon icon={faFileCode} className={`text-2xl mb-2 ${scriptType === 'single' ? 'text-blue-500' : 'text-gray-400'}`} />
                <span className="font-medium text-sm">Single-File</span>
              </button>
              <button
                type="button"
                className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all duration-200 ${scriptType === 'multi'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                onClick={() => setScriptType('multi')}
              >
                <div className="relative">
                  <FontAwesomeIcon icon={faFolderOpen} className={`text-2xl mb-2 ${scriptType === 'multi' ? 'text-blue-500' : 'text-gray-400'}`} />
                  <FontAwesomeIcon icon={faFileCode} className={`absolute -right-2 -bottom-1 text-xs bg-white dark:bg-gray-800 rounded-full p-0.5 border border-white dark:border-gray-800 ${scriptType === 'multi' ? 'text-blue-500' : 'text-gray-400'}`} />
                </div>
                <span className="font-medium text-sm">Multi-File</span>
              </button>
            </div>
          </div>

          {/* Dynamic Inputs */}
          <div className="space-y-4">
            {scriptType === 'multi' ? (
              <div>
                <label htmlFor="folderName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Folder Name</label>
                <input
                  type="text"
                  id="folderName"
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  className="block w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all dark:text-white"
                  placeholder="e.g., MyNewProject"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleCreate();
                    }
                  }}
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  A <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1 rounded">Main.cs</span> entry point will be created automatically.
                </p>
              </div>
            ) : (
              <>
                              <div className="p-1">
                                <label htmlFor="scriptName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Script Name (.cs)
                                </label>
                                <div className="relative">
                                  <input
                                    type="text"
                                    id="scriptName"
                                    value={scriptName}
                                    onChange={(e) => setScriptName(e.target.value)}
                                    className="block w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all dark:text-white"
                                    placeholder="e.g., HelloWorld"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        handleCreate();
                                      }
                                    }}
                                  />
                                </div>
                              </div>
                                {/* Archetype Picker */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Pattern Archetype</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search patterns..."
                        className="text-xs px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md focus:ring-1 focus:ring-blue-500 outline-none w-40"
                      />
                      <FontAwesomeIcon icon={faSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 p-1">
                    {filteredArchetypes.map((arch) => (
                      <button
                        key={arch.id}
                        type="button"
                        onClick={() => setTemplateId(arch.id)}
                        className={`flex items-start p-3 rounded-lg border text-left transition-all duration-200 ${templateId === arch.id
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-500'
                            : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-200 dark:hover:border-blue-800'
                          }`}
                      >
                        <div className={`mt-1 mr-3 shrink-0 ${templateId === arch.id ? 'text-blue-500' : 'text-gray-400'}`}>
                          <FontAwesomeIcon icon={arch.icon} />
                        </div>
                        <div>
                          <div className={`text-xs font-bold ${templateId === arch.id ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                            {arch.label}
                          </div>
                          <div className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5">
                            {arch.description}
                          </div>
                        </div>
                      </button>
                    ))}
                    {filteredArchetypes.length === 0 && (
                      <div className="col-span-2 py-8 text-center text-gray-500 dark:text-gray-400 text-xs italic">
                        No patterns found matching "{searchTerm}"
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end space-x-3 pt-4 mt-4 border-t border-gray-100 dark:border-gray-800 shrink-0">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-900 focus:z-10 focus:ring-2 focus:ring-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={isLoading}
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-900 shadow-md hover:shadow-lg transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center"
          >
            {isLoading && <FontAwesomeIcon icon={faSync} className="animate-spin mr-2" />}
            {isLoading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </Modal>
  );
};
