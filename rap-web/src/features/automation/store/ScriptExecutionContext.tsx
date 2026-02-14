import { createContext } from 'react';
import type { Script, ScriptParameter } from '@/types/scriptModel';
import type { ExecutionResult, ParameterPreset } from '@/types/common';

export interface ComputeParameterOptionsResult {
  options?: string[];
  is_success: boolean;
  error_message?: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface PickObjectResult {
  value?: string | number | boolean;
  is_success: boolean;
  cancelled?: boolean;
  error_message?: string;
}

export interface ScriptExecutionContextProps {
  selectedScript: Script | null;
  setSelectedScript: (script: Script | null, source?: 'user' | 'agent' | 'agent_executed_full_output' | 'refresh' | 'hard_reset') => Promise<void>;
  runningScriptPath: string | null;
  executionResult: ExecutionResult | null;
  setExecutionResult: (result: ExecutionResult | null) => void;
  runScript: (script: Script, parameters?: ScriptParameter[], shouldUpdateGlobalState?: boolean) => Promise<ExecutionResult | undefined>;
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
  computeParameterOptions: (script: Script, parameterName: string, shouldUpdateGlobalState?: boolean) => Promise<ComputeParameterOptionsResult>;
  pickObject: (script: Script, paramName: string, selectionType: string, shouldUpdateGlobalState?: boolean) => Promise<PickObjectResult>;
  isComputingOptions: Record<string, boolean>;
  editScript: (script: Script) => Promise<void>;
  renameScript: (script: Script, newName: string) => Promise<{ success: boolean; message: string }>;
  resetScriptParameters: (scriptId: string) => Promise<void>;
  buildTool: (script: Script) => Promise<{ success: boolean; message: string }>;
}

export const ScriptExecutionContext = createContext<ScriptExecutionContextProps | undefined>(undefined);
