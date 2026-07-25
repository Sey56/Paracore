import React, { useState, useEffect } from "react";
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
  faUndo,
  faLayerGroup,
} from "@fortawesome/free-solid-svg-icons";
import type { Script, ScriptParameter } from "@/types/scriptModel";
import { useUI } from "@/hooks/useUI";
import { useScriptExecution } from "@/features/automation";

import { ScriptParametersForm } from "./ScriptParametersForm";
import { NewPresetNameModal } from './NewPresetNameModal';
import { ConfirmActionModal } from './ConfirmActionModal';
import { InfoModal } from './InfoModal';
import { useAuth } from '@/features/auth';

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
  
  // FORCE DEEP REFLOW on mount specifically for the Parameters tab content
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      const scrollContainer = document.querySelector('.custom-scrollbar');
      if (scrollContainer) {
        const _ = (scrollContainer as HTMLElement).offsetHeight;
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const [activeTab, setActiveTab] = useState(0);
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
    // Use cached user-edited parameters if available and non-empty, otherwise fall back to script defaults
    const cachedParams = userEditedScriptParameters[script.id];
    setEditedParameters((cachedParams && cachedParams.length > 0) ? cachedParams : (script.parameters || []));
  }, [script.id, userEditedScriptParameters, script.parameters]);

  const selectedPreset = activePresets[script.id] || "<Default Parameters>";

  const [isNewPresetModalOpen, setIsNewPresetModalOpen] = useState(false);
  const [isRenamePresetModalOpen, setIsRenamePresetModalOpen] = useState(false);
  const [isDeletePresetModalOpen, setIsDeletePresetModalOpen] = useState(false);
  const [presetToDelete, setPresetToDelete] = useState('');
  const [isUpdatePresetModalOpen, setIsUpdatePresetModalOpen] = useState(false);
  const [isInfoModalOpen, setIsInfoModalOpen] = useState(false);
  const [infoModalMessage, setInfoModalMessage] = useState('');
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [areGroupsExpanded, setAreGroupsExpanded] = useState(false);

  const toggleAllGroups = () => {
    const newState = !areGroupsExpanded;
    setAreGroupsExpanded(newState);
    window.dispatchEvent(new CustomEvent(newState ? 'expand-all-groups' : 'collapse-all-groups'));
  };


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
    if (script) {
      runScript(script, editedParameters);
    }
  };

  const isDefaultPreset = selectedPreset === "<Default Parameters>";

  const validationErrors = validateParameters(filterVisibleParameters(editedParameters));
  const isParamsValid = validationErrors.length === 0;

  const isRunDisabled = !!runningScriptPath || !isActionable || !isParamsValid;

  const isProtectedTool = !!(script.metadata && script.metadata.isProtected) || (script.name && script.name.toLowerCase().endsWith('.ptool'));


  return (
    <div className={`tab-content flex flex-col h-full overflow-hidden`}>
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar py-6 pl-5 pr-3">
        <div className="space-y-8 pb-6 pr-2">
        {/* 1. Configuration Presets */}
        {(activeMainView === 'gallery' || activeMainView === 'repl') && (editedParameters.length > 0 || (script.parameters && script.parameters.length > 0)) && (
          <div className="flex flex-col space-y-4">

            <div className="flex items-center gap-3 p-2 bg-slate-100/50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/50 shadow-inner tooltip-bottom">
              <div className="relative flex-1 group">
                <select
                  className="w-full appearance-none bg-white dark:bg-slate-900 border-2 border-transparent rounded-lg px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500/30 focus:ring-4 focus:ring-blue-500/5 transition-all cursor-pointer shadow-sm"
                  value={selectedPreset}
                  onChange={(e) => {
                    const presetName = e.target.value;
                    internalSetSelectedPreset(presetName);
                    if (presetName === "<Default Parameters>") {
                      const draftParams = defaultDraftParameters[script.id];
                      const finalDefaultParams = draftParams || initializeParameters(script.parameters ?? []);
                      updateUserEditedParameters(script.id, finalDefaultParams, true);
                      setEditedParameters(finalDefaultParams);
                    } else {
                      const preset = presets.find((p) => p.name === presetName);
                      if (preset) {
                        const mergedParams = (script.parameters ?? []).map(scriptParam => {
                          const presetParam = preset.parameters.find(p => p.name === scriptParam.name);
                          if (presetParam) {
                            let newValue = presetParam.value;
                            if (scriptParam.multiSelect && typeof newValue === 'string') {
                              try {
                                const parsed = JSON.parse(newValue);
                                if (Array.isArray(parsed)) newValue = JSON.stringify(parsed);
                              } catch {
                                const arrayValue = newValue.split(',').map(v => v.trim()).filter(v => v.length > 0);
                                newValue = JSON.stringify(arrayValue);
                              }
                            }
                            const finalOptions = presetParam.options && presetParam.options.length > 0 ? presetParam.options : scriptParam.options;
                            return { ...scriptParam, value: newValue, options: finalOptions };
                          }
                          return { ...scriptParam };
                        });
                        updateUserEditedParameters(script.id, mergedParams, true);
                        setEditedParameters(mergedParams);
                      }
                    }
                  }}
                >
                  <option value="<Default Parameters>">Parameter Defaults</option>
                  {presets.map((preset, i) => (
                    <option key={i} value={preset.name}>{preset.name}</option>
                  ))}
                </select>
                <FontAwesomeIcon icon={faSync} className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none opacity-50" />
              </div>

              <div className="flex items-center gap-1.5 pr-1">
                <button
                  onClick={toggleAllGroups}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300 ${areGroupsExpanded
                    ? "text-blue-600 bg-blue-50 dark:bg-blue-900/30 shadow-sm"
                    : "text-slate-400 hover:text-blue-600 hover:bg-slate-50 dark:hover:bg-slate-900/20"
                    }`}
                  title={areGroupsExpanded ? "Collapse All Groups" : "Expand All Groups"}
                >
                  <div className="relative">
                    <FontAwesomeIcon icon={faLayerGroup} className="text-xs" />
                    <div className={`absolute -right-1 -bottom-1 w-2 h-2 rounded-full border-2 border-slate-100 dark:border-slate-800 transition-colors ${areGroupsExpanded ? "bg-blue-500" : "bg-slate-400"}`}></div>
                  </div>
                </button>

                <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />

                {isDefaultPreset ? (
                  <button
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all duration-300"
                    onClick={() => setIsResetModalOpen(true)}
                    disabled={!isActionable || isRunning}
                    title="Reset to Defaults"
                  >
                    <FontAwesomeIcon icon={faUndo} className="text-xs" />
                  </button>
                ) : (
                  <>
                    <button title="Rename Configuration" className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all" onClick={handleRenamePreset}>
                      <FontAwesomeIcon icon={faEdit} className="text-xs" />
                    </button>
                    <button title="Update Configuration" className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all" onClick={handleUpdatePreset}>
                      <FontAwesomeIcon icon={faSync} className="text-xs" />
                    </button>
                    <button title="Delete Configuration" className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all" onClick={handleDeletePreset}>
                      <FontAwesomeIcon icon={faTrash} className="text-xs" />
                    </button>
                  </>
                )}
                <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
                <button
                  title="Save New Preset"
                  className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all active:scale-90"
                  onClick={handleNewPreset}
                >
                  <FontAwesomeIcon icon={faPlus} className="text-xs" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Parameter Form */}
        <div className="relative">
          <ScriptParametersForm
            script={script}
            parameters={editedParameters}
            onChange={handleParameterChange}
            onComputeOptions={(paramName: string) => computeParameterOptions(script, paramName)}
            onPickObject={handlePickObject}
            isComputingOptions={isComputingOptions}
            isActionable={isActionable}
          />
        </div>

        {/* 3. Execution Controls */}
        {(activeMainView === 'gallery' || activeMainView === 'repl') && (
          <div className="pt-8 mt-12 border-t border-slate-200 dark:border-slate-800 flex flex-col space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 relative">
                <button
                  className={`flex items-center gap-3 px-8 py-4 rounded-xl font-black text-xs uppercase tracking-[0.2em] transition-all duration-500 shadow-2xl active:scale-95
                    ${isRunning
                      ? 'bg-blue-600 text-white cursor-wait opacity-90'
                      : isRunDisabled
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-50'
                        : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/30 hover:shadow-blue-500/40 ring-4 ring-blue-500/5'
                    }`}
                  onClick={handleRunScript}
                  disabled={isRunDisabled}
                >
                  <FontAwesomeIcon icon={isRunning ? faSpinner : faPlay} className={isRunning ? "animate-spin" : "group-hover:translate-x-0.5 transition-transform"} />
                  {isRunning ? "Running..." : "Run"}
                </button>
              </div>

              {!isProtectedTool && (
                <button
                  title="View Source Code"
                  className="w-12 h-12 rounded-xl text-slate-400 hover:text-blue-500 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-all flex items-center justify-center shadow-sm group tooltip-left"
                  onClick={onViewCodeClick}
                >
                  <FontAwesomeIcon icon={faExternalLinkAlt} className="text-sm group-hover:scale-110 transition-transform" />
                </button>
              )}
            </div>

            {/* Bottom Status Feed */}
            {!isParamsValid && (
              <div className="flex items-start gap-3 px-4 py-3 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-100 dark:border-rose-800 animate-in slide-in-from-bottom-2 duration-300">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse mt-1.5 shrink-0" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-rose-600 dark:text-rose-400 tracking-[0.2em] uppercase mb-1">
                    Configuration Issues
                  </span>
                  <div className="space-y-1">
                    {validationErrors.map((err, i) => (
                      <div key={i} className="text-xs font-bold text-rose-600 dark:text-rose-400 tracking-wider flex items-center gap-1.5">
                        <span className="opacity-50">•</span> {err}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
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
    </div>
  );
};
