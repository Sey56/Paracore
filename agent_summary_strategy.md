# Proposed Strategy for Agent Output Summarization

This document outlines a hierarchical strategy to handle script execution outputs, ensuring the agent receives a concise, token-efficient summary while the user still has access to the full, raw output in the UI.

The strategy is divided into two parts: the C# Engine's responsibility as the "Summary Generator" and the Python Agent's responsibility as the "Summary Consumer."

---

### 1. C# Engine (`RServer.Addin`) Responsibility: The Summary Generator

The gRPC service (`CoreScriptRunnerService.cs`), which receives the raw `ExecutionResult` from the `CodeRunner`, will be responsible for creating the `OutputSummary` object. It will follow a strict hierarchy of rules:

#### **Rule #1: Prioritize `Show()` (Table Output)**
- **Condition:** If the script execution result contains table data (i.e., `ExecutionResult.StructuredOutput` is not empty).
- **Action:** The engine will create an `OutputSummary` object that contains **only a `TableSummary`**.
    - This `TableSummary` will consist of a truncated version of the full table (e.g., the first 5 rows).
    - It will also include metadata, such as the total number of rows (e.g., "Showing 5 of 100 rows").
    - In this case, any output from `Println` will be **ignored** for the purpose of the agent's summary to maintain focus.

#### **Rule #2: Summarize `Println()` if No Table Exists**
- **Condition:** If Rule #1 is not met (no table data) AND the `ExecutionResult.PrintLog` contains more than a certain number of lines (e.g., > 5).
- **Action:** The engine will create an `OutputSummary` object containing **only a `ConsoleSummary`**.
    - This `ConsoleSummary` will be a truncated version of the full log (e.g., the first 5 lines).
    - It will also include metadata, such as the total number of lines.

#### **Rule #3: No Summary Needed**
- **Condition:** If neither Rule #1 nor Rule #2 is met. This covers several important scenarios:
    1.  The script produces no output for our custom globals (e.g., it only modifies the Revit model or uses a native Revit `TaskDialog.Show()`).
    2.  The script's console output (`PrintLog`) is already short (e.g., 5 lines or fewer), making a summary redundant.
- **Action:** The engine will **not** create an `OutputSummary` object. The `output_summary` field in the gRPC response to the `rap-server` will be `null`.

This ensures the gRPC response always contains the full raw output, but only includes a summary when it's necessary and valuable.

---

### 2. Python Agent (`rap-server`) Responsibility: The Summary Consumer

The agent's logic (`graph.py`) will be updated to intelligently interpret the information it receives from the frontend after a script is executed.

#### **Step 1: Prioritize the Structured Summary**
- **Condition:** When the agent receives the post-execution message, does it contain a non-null `output_summary`?
- **Action:** If YES, the agent will use it to formulate its response.
    - If a `TableSummary` is present, the agent will respond conversationally: *"The script ran successfully and returned a table. Here are the first few rows... For the full table, please see the Table tab."*
    - If a `ConsoleSummary` is present, the agent will respond: *"The script executed successfully. Here are the first few lines of the output... For the full output, please see the Console tab."*

#### **Step 2: Fallback to Raw Output**
- **Condition:** If the `output_summary` is `null` or missing.
- **Action:** The agent will inspect the raw output fields that are forwarded to it.
    - If the raw output is empty or just a simple success message, the agent will provide a generic confirmation: *"Action completed successfully."* This gracefully handles scripts that have no visible output.
    - If the raw output contains a small amount of text (from a short `Println` or a single `Print`), the agent can include it directly: *"The script ran and returned the following message: [raw output text]"*.

#### **Step 3: Always Reset State**
- **Action:** Regardless of which path is taken (summary or raw output), after generating and sending its final message, the agent will **always** perform two critical actions:
    1.  Clear its internal state related to the completed task (the selected script, its parameters, etc.).
    2.  Transition its conversational graph to the `END` state.

This final step is the key to fixing the "stuck in a loop" problem and ensuring the agent is ready for a completely new command.
