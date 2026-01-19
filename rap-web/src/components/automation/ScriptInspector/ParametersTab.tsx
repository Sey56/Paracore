import React, { useState, useEffect, useMemo } from "react";
import { filterVisibleParameters, validateParameters } from '@/utils/parameterVisibility';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCheckCircle,
  faTimesCircle,
  faPlay,
  faSpinner,
  faPlus,
  faEdit,
  faSync,
  faTrash,
  faExternalLinkAlt,
  faChevronDown,
  faChevronRight,
  faUndo,
} from "@fortawesome/free-solid-svg-icons";
import type { Script, ScriptParameter } from "@/types/scriptModel";
import { useUI } from "@/hooks/useUI";
import { useScriptExecution } from "@/hooks/useScriptExecution";
import { ParameterInput } from "./ParameterInput";
import { ParameterGroupSection } from "./ParameterGroupSection";
import { NewPresetNameModal } from './NewPresetNameModal';
import { ConfirmActionModal } from './ConfirmActionModal';
import { InfoModal } from './InfoModal';
import { useAuth } from '@/hooks/useAuth';
import { Role } from '@/context/authTypes';

interface ParametersTabProps {
  script: Script;
  onViewCodeClick: () => void;
  isActionable: boolean;
  tooltipMessage: string;
}

const initializeParameters = (params: ScriptParameter[]): ScriptParameter[] => {
  return params.map(p => ({ ...p, value: p.value }));
};



export const ParametersTab: React.FC<ParametersTabProps> = ({ script, onViewCodeClick, isActionable, tooltipMessage }) => {
  const { activeInspectorTab, setActiveInspectorTab, activeMainView } = useUI();
  const { activeRole } = useAuth();
  const {
    runScript,
    runningScriptPath,
    executionResult,
    presets,
    addPreset,
    updatePreset,
    deletePreset,
    renamePreset,
    updateUserEditedParameters,
    setSelectedScript,
    computeParameterOptions,
    isComputingOptions,
    userEditedScriptParameters,
    defaultDraftParameters,
    activePresets,
    setActivePreset,
    pickObject,
    resetScriptParameters,
  } = useScriptExecution();

  const [editedParameters, setEditedParameters] = useState<ScriptParameter[]>([]);

  useEffect(() => {
    // Use cached user-edited parameters if available, otherwise fall back to script defaults
    const cachedParams = userEditedScriptParameters[script.id];
    setEditedParameters(cachedParams || script.parameters || []);
  }, [script.id, userEditedScriptParameters, script.parameters]);

  // Memoize visible parameters to prevent unnecessary re-renders
  const visibleParameters = useMemo(() => {
    return filterVisibleParameters(editedParameters);
  }, [editedParameters]);

  const selectedPreset = activePresets[script.id] || "<Default Parameters>";

  const [isNewPresetModalOpen, setIsNewPresetModalOpen] = useState(false);
  const [isRenamePresetModalOpen, setIsRenamePresetModalOpen] = useState(false);
  const [isDeletePresetModalOpen, setIsDeletePresetModalOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState('');
  const [isUpdatePresetModalOpen, setIsUpdatePresetModalOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [infoModalMessage, setInfoModalMessage] = useState('');
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);


  const isRunning = runningScriptPath === script.id;

  const handleParameterChange = (
    index: number,
    value: string | boolean | number
  ) => {
    const newParameters = [...editedParameters];
    newParameters[index] = { ...newParameters[index], value: value };
    setEditedParameters(newParameters);
    updateUserEditedParameters(script.id, newParameters);
  };

  const handleNewPreset = () => {
    setIsNewPresetModalOpen(true);
  };

  const handleNewPresetConfirm = (presetName: string) => {
    const result = addPreset({ name: presetName, parameters: editedParameters });
    if (result.success) setActivePreset(script.id, presetName);
    else {
      setInfoModalMessage(result.message);
      setIsInfoModalOpen(true);
    }
  };

  const handleRenamePreset = () => {
    setIsRenamePresetModalOpen(true);
  };

  const handleRenamePresetConfirm = (newName: string) => {
    const result = renamePreset(selectedPreset, newName);
    if (result.success) setActivePreset(script.id, newName);
    else {
      setInfoModalMessage(result.message);
      setIsInfoModalOpen(true);
    }
  };

  const handleUpdatePreset = () => {
    setIsUpdatePresetModalOpen(true);
  };

  const handleUpdatePresetConfirm = () => {
    const result = updatePreset(selectedPreset, { name: selectedPreset, parameters: editedParameters });
    if (result.success) {
      // No need to open InfoModal
    } else {
      setInfoModalMessage(result.message);
      setIsInfoModalOpen(true);

      const currentPresetName = selectedPreset;
      internalSetSelectedPreset("<Default Parameters>");
      setTimeout(() => {
        internalSetSelectedPreset(currentPresetName);
      }, 0);
    }
    setIsUpdatePresetModalOpen(false);
  };

  const handleDeletePreset = () => {
    setPresetToDelete(selectedPreset);
    setIsDeletePresetModalOpen(true);
  };

  const handleDeletePresetConfirm = () => {
    const result = deletePreset(presetToDelete);
    if (result.success) {
      // No need to open InfoModal
    } else {
      setInfoModalMessage(result.message);
      setIsInfoModalOpen(true);
    }
    internalSetSelectedPreset("<Default Parameters>");
    setPresetToDelete('');
  };



  const internalSetSelectedPreset = (name: string) => {
    setActivePreset(script.id, name);
  };

  const handlePickObject = (selectionType: string, index: number) => {
    const param = editedParameters[index];
    if (param) {
      pickObject(script, param.name, selectionType);
    }
  };

  const handleRunScript = async () => {
    // Validation using shared utility
    const validationErrors = validateParameters(visibleParameters);

    if (validationErrors.length > 0) {
      setInfoModalMessage(`Please correct the following issues:\n${validationErrors.join('\n')}`);
      setIsInfoModalOpen(true);
      return;
    }

    if (script) {
      await setSelectedScript(script);
      runScript(script, editedParameters);
    }
  };

  const handleStatusIconClick = () => {
    if (activeInspectorTab === 'console') {
      setActiveInspectorTab('parameters');
    } else {
      setActiveInspectorTab('console');
    }
  };

  const isDefaultPreset = selectedPreset === "<Default Parameters>";
  const showStatusIcon = !isRunning && executionResult;
  const runSucceeded = showStatusIcon && !executionResult?.error;

  const isRunDisabled = !!runningScriptPath || !isActionable;

  const finalTooltipMessage = tooltipMessage;

  return (
    <div className={`tab-content p-4`}>
      <div className="space-y-3">
        {/* Preset Selector + Actions */}
        {activeMainView === 'scripts' && (editedParameters.length > 0 || (script.parameters && script.parameters.length > 0)) && (
          <div className="relative flex items-center justify-end">
            <select
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 mr-auto"
              value={selectedPreset}
              onChange={(e) => {
                const presetName = e.target.value;
                internalSetSelectedPreset(presetName);
                if (presetName === "<Default Parameters>") {
                  // Load from the isolated "Default" draft cache if it exists, otherwise fall back to script defaults
                  const draftParams = defaultDraftParameters[script.id];
                  const finalDefaultParams = draftParams || initializeParameters(script.parameters ?? []);
                  updateUserEditedParameters(script.id, finalDefaultParams, true); // isPresetLoad = true
                  setEditedParameters(finalDefaultParams);
                } else {
                  const preset = presets.find((p) => p.name === presetName);
                  if (preset) {
                    // ... (merge logic)
                    const mergedParams = (script.parameters ?? []).map(scriptParam => {
                      const presetParam = preset.parameters.find(p => p.name === scriptParam.name);

                      if (presetParam) {
                        let newValue = presetParam.value;

                        // Handle Multi-Select deserialization if necessary (though state isolation usually handles this)
                        if (scriptParam.multiSelect && typeof newValue === 'string') {
                          try {
                            const parsed = JSON.parse(newValue);
                            if (Array.isArray(parsed)) newValue = JSON.stringify(parsed);
                          } catch {
                            const arrayValue = newValue.split(',').map(v => v.trim()).filter(v => v.length > 0);
                            newValue = JSON.stringify(arrayValue);
                          }
                        }

                        // Also restore 'options' from the preset if they exist, 
                        // as they might represent a previous "Fetch" state.
                        const finalOptions = presetParam.options && presetParam.options.length > 0
                          ? presetParam.options
                          : scriptParam.options;

                        return { ...scriptParam, value: newValue, options: finalOptions };
                      }

                      return { ...scriptParam };
                    });

                    updateUserEditedParameters(script.id, mergedParams, true); // isPresetLoad = true
                    setEditedParameters(mergedParams);
                  }
                }
              }}
            >
              <option value="<Default Parameters>">&lt;Default Parameters&gt;</option>
              {presets.map((preset, i) => (
                <option key={i} value={preset.name}>{preset.name}</option>
              ))}
            </select>

            <div className="flex space-x-2 pl-4">
              {isDefaultPreset && (
                <button
                  className="text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 text-xs flex items-center px-2 py-1 rounded transition-colors"
                  onClick={() => setIsResetModalOpen(true)}
                  disabled={!isActionable || isRunning}
                  title="Hard Reset: Clear local cache and reload defaults from engine"
                >
                  <FontAwesomeIcon icon={faUndo} />
                </button>
              )}
              <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 self-center mx-2"></div>
              <button title="New Preset" className="text-gray-600 dark:text-gray-300 hover:text-blue-600" onClick={handleNewPreset}>
                <FontAwesomeIcon icon={faPlus} />
              </button>
              <button key="rename-preset-button" title="Rename Preset" className={`hover:text-blue-600 ${isDefaultPreset || !isActionable ? "text-gray-400 dark:text-gray-500 cursor-not-allowed" : "text-gray-600 dark:text-gray-300"}`} disabled={isDefaultPreset || !isActionable} onClick={handleRenamePreset}>
                <FontAwesomeIcon icon={faEdit} />
              </button>
              <button key="update-preset-button" title="Update Preset" className={`hover:text-blue-600 ${isDefaultPreset ? "text-gray-400 dark:text-gray-500 cursor-not-allowed" : "text-gray-600 dark:text-gray-300"}`} disabled={isDefaultPreset} onClick={handleUpdatePreset}>
                <FontAwesomeIcon icon={faSync} />
              </button>
              <button key="delete-preset-button" title="Delete Preset" className={`hover:text-red-600 ${isDefaultPreset ? "text-gray-400 dark:text-gray-500 cursor-not-allowed" : "text-gray-600 dark:text-gray-300"}`} disabled={isDefaultPreset} onClick={handleDeletePreset}>
                <FontAwesomeIcon icon={faTrash} />
              </button>
            </div>
          </div>
        )}

        {/* Parameter Inputs - Grouped */}
        {(() => {
          // 1. Group parameters
          const groupedParams: { name: string; params: ScriptParameter[] }[] = [];
          const ungroupedParams: ScriptParameter[] = [];
          const groups: Record<string, ScriptParameter[]> = {};

          visibleParameters.forEach(p => {
            if (p.group && p.group.trim().length > 0) {
              if (!groups[p.group]) groups[p.group] = [];
              groups[p.group].push(p);
            } else {
              ungroupedParams.push(p);
            }
          });

          // Sort groups alphabetically or keep insertion order? 
          // Let's keep insertion order of the FIRST appearance of the group in the script to determine group order?
          // Or just standard alphabetical? Let's do alphabetical for stability.
          Object.keys(groups).sort().forEach(groupName => {
            groupedParams.push({ name: groupName, params: groups[groupName] });
          });

          return (
            <>
              {/* Render Ungrouped Parameters First */}
              {ungroupedParams.map((param) => {
                const originalIndex = editedParameters.findIndex(p => p.name === param.name);
                return (
                  <ParameterInput
                    key={originalIndex}
                    param={param}
                    index={originalIndex}
                    onChange={handleParameterChange}
                    onCompute={(paramName) => computeParameterOptions(script, paramName)}
                    onPickObject={handlePickObject}
                    isComputing={isComputingOptions[param.name]}
                    disabled={!isActionable}
                  />
                );
              })}

              {/* Render Groups */}
              {groupedParams.map((group) => (
                <ParameterGroupSection
                  key={group.name}
                  groupName={group.name}
                  parameters={group.params}
                  allParameters={editedParameters}
                  handleParameterChange={handleParameterChange}
                  script={script}
                  computeParameterOptions={computeParameterOptions}
                  onPickObject={handlePickObject}
                  isComputingOptions={isComputingOptions}
                  isActionable={isActionable}
                />
              ))}
            </>
          );
        })()}

        {/* Run Script Button */}
        {activeMainView === 'scripts' && (
          <div className="pt-6 mt-6 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">

            <div className="flex items-center space-x-4">
              <div className="relative flex items-center" title={finalTooltipMessage}>
                <button
                  className="bg-blue-50 hover:bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 dark:text-blue-400 py-1 px-3 rounded-md font-bold flex items-center border border-blue-200 dark:border-blue-800 transition-all active:scale-95 text-sm shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={handleRunScript}
                  disabled={isRunDisabled}
                >
                  <FontAwesomeIcon icon={isRunning ? faSpinner : faPlay} className={`mr-2 ${isRunning ? "animate-spin" : ""}`} />
                  {isRunning ? "Running..." : "Run Script"}
                </button>
                {showStatusIcon && (
                  <div
                    className="absolute -right-12 cursor-pointer p-1"
                    onClick={handleStatusIconClick}
                    title={activeInspectorTab === 'console' ? "Go to Parameters" : "Go to Console"}
                  >
                    <FontAwesomeIcon
                      icon={runSucceeded ? faCheckCircle : faTimesCircle}
                      className={`${runSucceeded ? 'text-green-500' : 'text-red-500'} text-2xl`}
                    />
                  </div>
                )}
              </div>
            </div>
            {activeRole !== Role.User && (
              <button
                title="View Code in New Window"
                className="text-gray-600 dark:text-gray-300 hover:text-blue-600"
                onClick={onViewCodeClick}
              >
                <FontAwesomeIcon icon={faExternalLinkAlt} />
              </button>
            )}
          </div>
        )}
      </div>

      <NewPresetNameModal
        isOpen={isNewPresetModalOpen}
        onClose={() => setIsNewPresetModalOpen(false)}
        onConfirm={handleNewPresetConfirm}
        title="New Preset Name"
      />

      <NewPresetNameModal
        isOpen={isRenamePresetModalOpen}
        onClose={() => setIsRenamePresetModalOpen(false)}
        onConfirm={handleRenamePresetConfirm}
        title="Rename Preset"
        initialValue={selectedPreset !== "<Default Parameters>" ? selectedPreset : ''}
      />

      <ConfirmActionModal
        isOpen={isDeletePresetModalOpen}
        onClose={() => setIsDeletePresetModalOpen(false)}
        onConfirm={handleDeletePresetConfirm}
        title="Delete Preset"
        message={`Are you sure you want to delete the preset "${presetToDelete}"?`}
        confirmButtonText="Delete"
        confirmButtonColor="red"
      />

      <ConfirmActionModal
        isOpen={isUpdatePresetModalOpen}
        onClose={() => setIsUpdatePresetModalOpen(false)}
        onConfirm={handleUpdatePresetConfirm}
        title="Update Preset"
        message={`Are you sure you want to update the preset "${selectedPreset}" with the current parameters?`}
        confirmButtonText="Update"
        confirmButtonColor="blue"
      />

      <ConfirmActionModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={() => {
          resetScriptParameters(script.id);
          setIsResetModalOpen(false);
        }}
        title="Reset Parameters"
        message="Are you sure you want to reset all parameters to their original defaults? This will clear your local changes."
        confirmButtonText="Reset"
        confirmButtonColor="red"
      />





      <InfoModal
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
        message={infoModalMessage}
        title="Information"
      />
    </div>
  );
};
