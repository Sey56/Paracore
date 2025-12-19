import React, { useState, useEffect, useMemo } from "react";
import { filterVisibleParameters } from '@/utils/parameterVisibility';
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
  } = useScriptExecution();

  const [editedParameters, setEditedParameters] = useState<ScriptParameter[]>([]);

  useEffect(() => {
    setEditedParameters(script.parameters || []);
  }, [script.id, script.parameters]);

  // Memoize visible parameters to prevent unnecessary re-renders
  const visibleParameters = useMemo(() => {
    return filterVisibleParameters(editedParameters);
  }, [editedParameters]);

  const [selectedPreset, setSelectedPreset] = useState("<Default Parameters>");

  const [isNewPresetModalOpen, setIsNewPresetModalOpen] = useState(false);
  const [isRenamePresetModalOpen, setIsRenamePresetModalOpen] = useState(false);
  const [isDeletePresetModalOpen, setIsDeletePresetModalOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState('');
  const [isUpdatePresetModalOpen, setIsUpdatePresetModalOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [infoModalMessage, setInfoModalMessage] = useState('');


  const isRunning = runningScriptPath === script.id;

  useEffect(() => {
    setSelectedPreset("<Default Parameters>");
  }, [script.id]);

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
    if (result.success) setSelectedPreset(presetName);
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
    if (result.success) setSelectedPreset(newName);
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
      setSelectedPreset("<Default Parameters>");
      setTimeout(() => {
        setSelectedPreset(currentPresetName);
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
    setSelectedPreset("<Default Parameters>");
    setPresetToDelete('');
  };

  const handleRunScript = async () => {
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
        {activeMainView === 'scripts' && script.parameters && script.parameters.length > 0 && (
          <div className="relative flex items-center justify-end">
            <select
              className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500 mr-auto"
              value={selectedPreset}
              onChange={(e) => {
                const presetName = e.target.value;
                setSelectedPreset(presetName);
                if (presetName === "<Default Parameters>") {
                  const defaultParams = initializeParameters(script.parameters ?? []);
                  updateUserEditedParameters(script.id, defaultParams);
                  setEditedParameters(defaultParams);
                } else {
                  const preset = presets.find((p) => p.name === presetName);
                  if (preset) {
                    updateUserEditedParameters(script.id, preset.parameters);
                    setEditedParameters(preset.parameters);
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
            <div className="relative flex items-center" title={finalTooltipMessage}>
              <button
                className="bg-blue-600 hover:bg-blue-700 text-white py-2 px-6 text-base rounded-lg font-semibold flex items-center justify-center disabled:bg-blue-400 dark:disabled:bg-blue-800 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg"
                onClick={handleRunScript}
                disabled={isRunDisabled}
              >
                <FontAwesomeIcon icon={isRunning ? faSpinner : faPlay} className={`mr-3 ${isRunning ? "animate-spin" : ""}`} />
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

      <InfoModal
        isOpen={isInfoModalOpen}
        onClose={() => setIsInfoModalOpen(false)}
        message={infoModalMessage}
        title="Information"
      />
    </div>
  );
};