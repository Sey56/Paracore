export interface ExecutionResult {
  output: string;
  error: string | null;
  isSuccess: boolean;
  structuredOutput?: StructuredOutput[];
  internalData?: string;
  timestamp?: number;
  scriptName?: string;
  capturedDocTitle?: string | null;
  /**
   * Wall clock of the request itself, in ms, measured around the HTTP call that
   * performed the work. Measured HERE rather than derived from the UI's loading
   * flags: a finishing takeoff flips more than one loading flag, and a flag that
   * drops and re-raises mid-run made a transition-based timer restart and report
   * only the last fragment of the run.
   */
  elapsedMs?: number;
}

import { StructuredOutput, ScriptParameter } from './scriptModel';

export interface ParameterPreset {
  name: string;
  parameters: ScriptParameter[]; // ScriptParameter[]
}
