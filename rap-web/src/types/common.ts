
export interface TableSummary {
  rowCount: number;
  columnHeaders: string[];
  truncatedRows: string[]; // JSON serialized strings of rows
}

export interface ConsoleSummary {
  lineCount: number;
  truncatedLines: string[]; // First 5 lines
}

export interface ReturnValueSummary {
  type: string;
  value: string; // String representation of the return value
}

export interface OutputSummary {
  type: "string" | "table" | "console" | "return_value" | "error";
  message: string;
  table?: TableSummary;
  console?: ConsoleSummary;
  returnValueSummary?: ReturnValueSummary;
}

export interface ExecutionResult {
  output: string;
  error: string | null;
  isSuccess: boolean;
  showOutputData?: StructuredOutput[];
  outputSummary?: OutputSummary; // Added outputSummary here
}

import { StructuredOutput, ScriptParameter } from './scriptModel';

export interface ParameterPreset {
  name: string;
  parameters: ScriptParameter[]; // ScriptParameter[]
}
