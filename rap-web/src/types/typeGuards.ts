import type { ExecutionResult } from "@/types/common";

export function isExecutionResult(data: unknown): data is ExecutionResult {
  return (
    typeof data === "object" &&
    data !== null &&
    ("output" in data || "error" in data)
  );
}
