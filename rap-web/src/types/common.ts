export interface ExecutionResult {
  output: string;
  error: string | null;
  isSuccess: boolean;
  structuredOutput?: StructuredOutput[];
  internalData?: string;
  timestamp?: number;
  scriptName?: string;
}

import { StructuredOutput, ScriptParameter } from './scriptModel';

export interface ParameterPreset {
  name: string;
  parameters: ScriptParameter[]; // ScriptParameter[]
}
