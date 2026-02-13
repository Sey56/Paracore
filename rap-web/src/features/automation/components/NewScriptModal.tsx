import { useState, useEffect } from 'react';
import { useScripts } from '@/features/automation';
import { useScriptExecution } from '@/features/automation';
import { Modal } from '@/components/common/Modal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileCode, faFolderOpen, faSync, faStethoscope, faSearch, faCube, faExchangeAlt, faChartPie, faCode, faExclamationTriangle } from '@fortawesome/free-solid-svg-icons';
import { VisualQueryBuilder } from './VisualQueryBuilder';
import { Script } from '@/types/scriptModel';

interface NewScriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedFolder: string;
  scriptToReplace?: Script | null;
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

export const NewScriptModal = ({ isOpen, onClose, selectedFolder, scriptToReplace }: NewScriptModalProps) => {
  const { createNewScript } = useScripts();
  const { setSelectedScript } = useScriptExecution();
  const [scriptType, setScriptType] = useState<ScriptType>('single');
  const [templateId, setTemplateId] = useState('blank');
  const [scriptName, setScriptName] = useState('');
  const [folderName, setFolderName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfirmReplace, setShowConfirmReplace] = useState(false);

  // Visual Query state
  const [generatedLogic, setGeneratedLogic] = useState<string | null>(null);
  const [generatedParams, setGeneratedParams] = useState<string | null>(null);

  const isReplacing = !!scriptToReplace;

  useEffect(() => {
    if (isOpen) {
      if (scriptToReplace) {
        setScriptType(scriptToReplace.type === 'single-file' ? 'single' : 'multi');
        const nameWithoutExt = scriptToReplace.name.replace(/\.cs$/, "");
        if (scriptToReplace.type === 'single-file') setScriptName(nameWithoutExt);
        else setFolderName(nameWithoutExt);
      } else {
        setScriptType('single');
        setScriptName('');
        setFolderName('');
      }
      setTemplateId('blank');
      setSearchTerm('');
      setGeneratedLogic(null);
      setGeneratedParams(null);
      setError(null);
      setIsLoading(false);
      setShowConfirmReplace(false);
    }
  }, [isOpen, scriptToReplace]);

  const filteredArchetypes = ARCHETYPES.filter(arch => 
    arch.label.toLowerCase().includes(searchTerm.toLowerCase()) || 
    arch.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleCreate = async (forceOverwrite: boolean = false) => {
    if (scriptType === 'single' && !scriptName.trim()) {
      setError('Script name cannot be empty.');
      return;
    }
    if (scriptType === 'multi' && !folderName.trim()) {
      setError('Folder name cannot be empty for a multi-script project.');
      return;
    }

    // Check if we need confirmation for replacement
    if (isReplacing && !forceOverwrite) {
      setShowConfirmReplace(true);
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
        generated_logic: generatedLogic || undefined,
        generated_params: generatedParams || undefined,
        overwrite: isReplacing || forceOverwrite
      });

      if (createdScript) {
        setSelectedScript(createdScript);
      }

      onClose();
    } catch (err: unknown) {
      if (err instanceof Error) {
        // If the backend says it exists, we could also trigger the confirm here
        if (err.message.includes("already exists")) {
          setShowConfirmReplace(true);
        } else {
          setError(err.message);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const showQueryBuilder = scriptType === 'single' && (templateId === 'selection-surgeon' || templateId === 'project-auditor');

  if (showConfirmReplace) {
    return (
      <Modal isOpen={isOpen} onClose={() => setShowConfirmReplace(false)} title="Confirm Replace" size="sm">
        <div className="space-y-4">
          <div className="flex items-center text-amber-500">
            <FontAwesomeIcon icon={faExclamationTriangle} className="text-2xl mr-3" />
            <h3 className="font-bold">Overwrite Existing Script?</h3>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            The script <span className="font-bold text-gray-900 dark:text-white">"{scriptType === 'multi' ? folderName : scriptName}"</span> already exists. 
            Replacing it will overwrite all current code with the new archetype/logic.
          </p>
          <div className="flex justify-end space-x-3 pt-4 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={() => setShowConfirmReplace(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => handleCreate(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-md transition-all active:scale-95"
            >
              Yes, Overwrite
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isReplacing ? "Replace Script Code" : "Create New Script"} size="4xl">
      <div className="flex flex-col max-h-[60vh]">
        <div className="flex-grow overflow-y-auto pr-4 custom-scrollbar space-y-6 pb-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Core Info */}
            <div className="space-y-6">
              {/* Location Info */}
              <div className="flex items-center text-[11px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-100 dark:border-gray-700 shrink-0">
                <FontAwesomeIcon icon={faFolderOpen} className="mr-2 text-blue-500" />
                <span className="mr-1">In:</span>
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
                <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Script Type</label>
                <div className={`grid grid-cols-2 gap-3 ${isReplacing ? 'opacity-50 pointer-events-none' : ''}`}>
                  <button
                    type="button"
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all duration-200 ${scriptType === 'single'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-700'
                      }`}
                    onClick={() => setScriptType('single')}
                  >
                    <FontAwesomeIcon icon={faFileCode} className={`text-xl mb-1 ${scriptType === 'single' ? 'text-blue-500' : 'text-gray-400'}`} />
                    <span className="font-bold text-xs">Single-File</span>
                  </button>
                  <button
                    type="button"
                    className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all duration-200 ${scriptType === 'multi'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-700'
                      }`}
                    onClick={() => setScriptType('multi')}
                  >
                    <div className="relative">
                      <FontAwesomeIcon icon={faFolderOpen} className={`text-xl mb-1 ${scriptType === 'multi' ? 'text-blue-500' : 'text-gray-400'}`} />
                    </div>
                    <span className="font-bold text-xs">Multi-File</span>
                  </button>
                </div>
              </div>

              {/* Name Input */}
              <div className="p-1">
                <label htmlFor="scriptName" className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                  {scriptType === 'multi' ? 'Folder Name' : 'Script Name (.cs)'}
                </label>
                <input
                  type="text"
                  id="scriptName"
                  value={scriptType === 'multi' ? folderName : scriptName}
                  onChange={(e) => scriptType === 'multi' ? setFolderName(e.target.value) : setScriptName(e.target.value)}
                  className={`block w-full px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all dark:text-white text-sm ${isReplacing ? 'bg-gray-100 dark:bg-gray-800/50 cursor-not-allowed text-gray-500' : ''}`}
                  placeholder={scriptType === 'multi' ? "e.g., MyProject" : "e.g., HelloWorld"}
                  autoFocus={!isReplacing}
                  readOnly={isReplacing}
                />
                {isReplacing && <p className="mt-2 text-[10px] text-blue-500 italic font-medium">Name is read-only during replacement.</p>}
              </div>
            </div>

            {/* Right Column: Patterns & Builder */}
            <div className="space-y-6">
              {scriptType === 'single' ? (
                <>
                  {/* Archetype Picker */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pattern Archetype</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Filter..."
                          className="text-[10px] px-2 py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md focus:ring-1 focus:ring-blue-500 outline-none w-28"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 p-1">
                      {filteredArchetypes.map((arch) => (
                        <button
                          key={arch.id}
                          type="button"
                          onClick={() => setTemplateId(arch.id)}
                          className={`flex items-center p-2 rounded-lg border text-left transition-all duration-200 ${templateId === arch.id
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 ring-1 ring-blue-500'
                              : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-200'
                            }`}
                        >
                          <div className={`mr-3 shrink-0 ${templateId === arch.id ? 'text-blue-500' : 'text-gray-400'}`}>
                            <FontAwesomeIcon icon={arch.icon} className="text-sm" />
                          </div>
                          <div>
                            <div className={`text-xs font-bold ${templateId === arch.id ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>
                              {arch.label}
                            </div>
                            <div className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
                              {arch.description}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 text-xs italic bg-gray-50 dark:bg-gray-800/30 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 p-8 text-center">
                  Multi-file scripts use the standard template with modular organization support.
                </div>
              )}
            </div>
          </div>

          {/* Full Width Bottom Section: Query Builder */}
          {showQueryBuilder && (
            <div className="animate-in slide-in-from-top-4 duration-300 border-t border-gray-100 dark:border-gray-800 pt-6">
              <VisualQueryBuilder
                onQueryGenerated={(logic, params) => {
                  setGeneratedLogic(logic);
                  setGeneratedParams(params);
                }}
              />
              {generatedLogic && (
                <div className="mt-2 flex items-center justify-center text-[10px] text-green-600 dark:text-green-400 font-bold bg-green-50 dark:bg-green-900/20 py-1 rounded-md border border-green-100 dark:border-green-900/30">
                  <FontAwesomeIcon icon={faSync} className="mr-2 animate-spin-slow" />
                  Logic generated! It will be injected into your script.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end space-x-3 pt-4 mt-auto border-t border-gray-100 dark:border-gray-800 shrink-0">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-gray-900 focus:z-10 focus:ring-2 focus:ring-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={() => handleCreate()}
            disabled={isLoading}
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 dark:focus:ring-blue-900 shadow-md hover:shadow-lg transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center"
          >
            {isLoading && <FontAwesomeIcon icon={faSync} className="animate-spin mr-2" />}
            {isLoading ? (isReplacing ? 'Replacing...' : 'Creating...') : (isReplacing ? 'Replace Code' : 'Create')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
