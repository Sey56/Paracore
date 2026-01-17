import { createContext } from 'react';
import type { Script, ScriptParameter } from '@/types/scriptModel';
import type { ExecutionResult, ParameterPreset } from '@/types/common';

export interface ScriptExecutionContextProps {
  selectedScript: Script | null;
  setSelectedScript: (script: Script | null, source?: 'user' | 'agent' | 'agent_executed_full_output' | 'refresh' | 'hard_reset') => Promise<void>;
  runningScriptPath: string | null;
  executionResult: ExecutionResult | null;
  setExecutionResult: React.Dispatch<React.SetStateAction<ExecutionResult | null>>;
  runScript: (script: Script, parameters?: ScriptParameter[]) => Promise<ExecutionResult | undefined>;
  clearExecutionResult: () => void;
  userEditedScriptParameters: Record<string, ScriptParameter[]>;
  updateUserEditedParameters: (scriptId: string, parameters: ScriptParameter[], isPresetLoad?: boolean) => void;
  defaultDraftParameters: Record<string, ScriptParameter[]>;
  activePresets: Record<string, string>;
  setActivePreset: (scriptId: string, presetName: string) => void;
  presets: ParameterPreset[];
  addPreset: (preset: ParameterPreset) => { success: boolean; message: string };
  updatePreset: (name: string, preset: ParameterPreset) => { success: boolean; message: string };
  deletePreset: (name: string) => { success: boolean; message: string };
  renamePreset: (oldName: string, newName: string) => { success: boolean; message: string };
  computeParameterOptions: (script: Script, parameterName: string) => Promise<void>;
  pickObject: (script: Script, paramName: string, selectionType: string) => Promise<void>;
  isComputingOptions: Record<string, boolean>;
  editScript: (script: Script) => Promise<void>;
  resetScriptParameters: (scriptId: string) => Promise<void>;
}

export const ScriptExecutionContext = createContext<ScriptExecutionContextProps | undefined>(undefined);
