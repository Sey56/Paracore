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
} from "@fortawesome/free-solid-svg-icons";
import type { Script, ScriptParameter } from "@/types/scriptModel";
import { useUI } from "@/hooks/useUI";
import { useScriptExecution } from "@/features/automation";
import { ScriptParametersForm } from "./ScriptParametersForm";
import { NewPresetNameModal } from './NewPresetNameModal';
import { ConfirmActionModal } from './ConfirmActionModal';
import { InfoModal } from './InfoModal';
import { useAuth } from '@/features/auth';
import { Role } from '@/features/auth';

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

  const validationErrors = validateParameters(filterVisibleParameters(editedParameters));
  const isParamsValid = validationErrors.length === 0;

  const isRunDisabled = !!runningScriptPath || !isActionable || !isParamsValid;

  const isProtectedTool = !!(script.metadata && script.metadata.isProtected) || (script.name && script.name.toLowerCase().endsWith('.ptool'));

  const finalTooltipMessage = !isParamsValid
    ? `Issues: ${validationErrors.join(', ')}`
    : tooltipMessage;

  return (
    <div className={`tab-content p-6 overflow-y-auto h-full custom-scrollbar pb-60 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm`}>
      <div className="space-y-8">
        {/* 1. Refinery Header & Preset Matrix */}
        {activeMainView === 'scripts' && (editedParameters.length > 0 || (script.parameters && script.parameters.length > 0)) && (
          <div className="flex flex-col space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-1 h-4 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
              <h3 className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Unit Configuration Presets</h3>
            </div>

            <div className="flex items-center gap-3 p-2 bg-slate-100/50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 shadow-inner">
              <div className="relative flex-1 group">
                <select
                  className="w-full appearance-none bg-white dark:bg-slate-900 border-2 border-transparent rounded-xl px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:border-blue-500/30 focus:ring-4 focus:ring-blue-500/5 transition-all cursor-pointer shadow-sm"
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
                  <option value="<Default Parameters>">Registry Defaults</option>
                  {presets.map((preset, i) => (
                    <option key={i} value={preset.name}>{preset.name}</option>
                  ))}
                </select>
                <FontAwesomeIcon icon={faSync} className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none opacity-50" />
              </div>

              <div className="flex items-center gap-1.5 pr-1">
                {isDefaultPreset ? (
                  <button
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all duration-300"
                    onClick={() => setIsResetModalOpen(true)}
                    disabled={!isActionable || isRunning}
                    title="Purge Local Cache"
                  >
                    <FontAwesomeIcon icon={faUndo} className="text-xs" />
                  </button>
                ) : (
                  <>
                    <button title="Rename Configuration" className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all" onClick={handleRenamePreset}>
                      <FontAwesomeIcon icon={faEdit} className="text-xs" />
                    </button>
                    <button title="Update Configuration" className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all" onClick={handleUpdatePreset}>
                      <FontAwesomeIcon icon={faSync} className="text-xs" />
                    </button>
                    <button title="Delete Configuration" className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all" onClick={handleDeletePreset}>
                      <FontAwesomeIcon icon={faTrash} className="text-xs" />
                    </button>
                  </>
                )}
                <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
                <button 
                  title="Forge New Configuration" 
                  className="w-9 h-9 rounded-xl flex items-center justify-center bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-all active:scale-90" 
                  onClick={handleNewPreset}
                >
                  <FontAwesomeIcon icon={faPlus} className="text-xs" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Control Matrix (The Form) */}
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

        {/* 3. Terminal Activation Area */}
        {activeMainView === 'scripts' && (
          <div className="pt-8 mt-12 border-t border-slate-200 dark:border-slate-800 flex flex-col space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="relative group" title={finalTooltipMessage}>
                  <button
                    className={`flex items-center gap-3 px-8 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] transition-all duration-500 shadow-2xl active:scale-95
                      ${isRunDisabled 
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-50' 
                        : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/30 hover:shadow-blue-500/40 ring-4 ring-blue-500/5'
                      }`}
                    onClick={handleRunScript}
                    disabled={isRunDisabled}
                  >
                    <FontAwesomeIcon icon={isRunning ? faSpinner : faPlay} className={isRunning ? "animate-spin" : "group-hover:translate-x-0.5 transition-transform"} />
                    {isRunning ? "Initializing..." : "Activate Unit"}
                  </button>
                  
                  {showStatusIcon && (
                    <button
                      className={`absolute -right-14 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center transition-all animate-in zoom-in duration-300 shadow-lg
                        ${runSucceeded ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'}`}
                      onClick={handleStatusIconClick}
                      title={activeInspectorTab === 'console' ? "Return to Parameters" : "View Output Terminal"}
                    >
                      <FontAwesomeIcon icon={runSucceeded ? faCheckCircle : faTimesCircle} className="text-lg" />
                    </button>
                  )}
                </div>
              </div>

              {activeRole !== Role.User && !isProtectedTool && (
                <button
                  title="Inspect Core Logic"
                  className="w-12 h-12 rounded-2xl text-slate-400 hover:text-blue-500 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-all flex items-center justify-center shadow-sm group"
                  onClick={onViewCodeClick}
                >
                  <FontAwesomeIcon icon={faExternalLinkAlt} className="text-sm group-hover:scale-110 transition-transform" />
                </button>
              )}
            </div>

            {/* Bottom Status Feed */}
            {!isParamsValid && (
              <div className="flex items-center gap-2 px-4 py-2 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-100 dark:border-rose-800 animate-in slide-in-from-bottom-2 duration-300">
                <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-widest leading-none">
                  Configuration Issues: {validationErrors.join(', ')}
                </span>
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
  );
};
