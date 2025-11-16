export interface ExecutionResult {
  output: string;
  error: string | null;
  isSuccess: boolean;
  structuredOutput?: StructuredOutput[];
}

import { StructuredOutput, ScriptParameter } from './scriptModel';

export interface ParameterPreset {
  name: string;
  parameters: ScriptParameter[]; // ScriptParameter[]
}
