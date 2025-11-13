
import { createContext } from 'react';
import type { Script, ScriptParameter } from '@/types/scriptModel';
import type { ExecutionResult, ParameterPreset, OutputSummary } from '@/types/common';

export interface ScriptExecutionContextProps {
  selectedScript: Script | null;
  setSelectedScript: (script: Script | null, source?: 'user' | 'agent' | 'agent_executed_full_output') => Promise<void>;
  runningScriptPath: string | null;
  executionResult: ExecutionResult | null;
  setExecutionResult: React.Dispatch<React.SetStateAction<ExecutionResult | null>>;
  runScript: (script: Script, parameters?: ScriptParameter[]) => Promise<void>;
  clearExecutionResult: () => void;
  userEditedScriptParameters: Record<string, ScriptParameter[]>;
  updateUserEditedParameters: (scriptId: string, parameters: ScriptParameter[]) => void;
  presets: ParameterPreset[];
  addPreset: (preset: ParameterPreset) => { success: boolean; message: string };
  updatePreset: (name: string, preset: ParameterPreset) => { success: boolean; message: string };
  deletePreset: (name: string) => { success: boolean; message: string };
  renamePreset: (oldName: string, newName: string) => { success: boolean; message: string };
  outputSummary?: OutputSummary;
}

export const ScriptExecutionContext = createContext<ScriptExecutionContextProps | undefined>(undefined);
