import { createContext, Dispatch, SetStateAction } from 'react';
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

/**
 * SELECTION CONTEXT
 * Components using this only re-render when the selected script changes.
 */
export interface ScriptSelectionContextProps {
  selectedScript: Script | null;
  setSelectedScript: (script: Script | null, source?: 'user' | 'agent' | 'agent_executed_full_output' | 'refresh' | 'hard_reset' | 'replace') => Promise<void>;
}
export const ScriptSelectionContext = createContext<ScriptSelectionContextProps | undefined>(undefined);

/**
 * EXECUTION STATE CONTEXT
 * Components using this re-render on every execution start/stop/result.
 * This is the "Volatile" context.
 */
export interface ScriptExecutionStateContextProps {
  runningScriptPath: string | null;
  executionResult: ExecutionResult | null;
  setExecutionResult: Dispatch<SetStateAction<ExecutionResult | null>>;
  isComputingOptions: Record<string, boolean>;
}
export const ScriptExecutionStateContext = createContext<ScriptExecutionStateContextProps | undefined>(undefined);

/**
 * METADATA & DATA CONTEXT
 * Components using this re-render when parameters, presets, or content changes.
 */
export interface ScriptDataContextProps {
  userEditedScriptParameters: Record<string, ScriptParameter[]>;
  defaultDraftParameters: Record<string, ScriptParameter[]>;
  activePresets: Record<string, string>;
  presets: ParameterPreset[];
  combinedScriptContent: string | null;
}
export const ScriptDataContext = createContext<ScriptDataContextProps | undefined>(undefined);

/**
 * OPERATIONS CONTEXT
 * Components using this NEVER re-render because these functions are stable (useCallback).
 * This is the "Static" context for buttons and actions.
 */
export interface ScriptOperationsContextProps {
  runScript: (script: Script, parameters?: ScriptParameter[], shouldUpdateGlobalState?: boolean) => Promise<ExecutionResult | undefined>;
  clearExecutionResult: () => void;
  updateUserEditedParameters: (scriptId: string, parameters: ScriptParameter[], isPresetLoad?: boolean) => void;
  setActivePreset: (scriptId: string, presetName: string) => void;
  addPreset: (preset: ParameterPreset) => { success: boolean; message: string };
  updatePreset: (name: string, preset: ParameterPreset) => { success: boolean; message: string };
  deletePreset: (name: string) => { success: boolean; message: string };
  renamePreset: (oldName: string, newName: string) => { success: boolean; message: string };
  computeParameterOptions: (script: Script, parameterName: string, shouldUpdateGlobalState?: boolean) => Promise<ComputeParameterOptionsResult>;
  pickObject: (script: Script, paramName: string, selectionType: string, shouldUpdateGlobalState?: boolean) => Promise<PickObjectResult>;
  editScript: (script: Script) => Promise<boolean | void>;
  renameScript: (script: Script, newName: string) => Promise<{ success: boolean; message: string }>;
  resetScriptParameters: (scriptId: string) => Promise<void>;
  buildTool: (script: Script) => Promise<{ success: boolean; message: string }>;
}
export const ScriptOperationsContext = createContext<ScriptOperationsContextProps | undefined>(undefined);

/**
 * LEGACY COMPATIBILITY
 * This remains for components that haven't been refactored yet.
 * It will still cause re-renders on everything.
 */
export interface ScriptExecutionContextProps extends ScriptSelectionContextProps, ScriptExecutionStateContextProps, ScriptDataContextProps, ScriptOperationsContextProps {}
export const ScriptExecutionContext = createContext<ScriptExecutionContextProps | undefined>(undefined);
