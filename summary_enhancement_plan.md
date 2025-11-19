# Agent Summary Response Enhancement Plan

This document outlines the plan to refine and polish the agent's post-execution summary responses based on user feedback.

## 1. Current State Analysis

The current summary logic is handled in `rap-server/server/agent/summary_utils.py` and consumed by `summary_node.py`. The logic works but has several areas for improvement:

*   **Inconsistent Summaries:** It only creates summaries for "large" outputs (>5 rows/lines), letting smaller outputs pass through raw. This creates two different data pathways that the `summary_node` has to handle.
*   **Redundant Data:** The `table_summary` and `console_summary` objects include truncated data (`truncated_rows_json`, `truncated_lines`), which we no longer need as the agent's response should be text-only.
*   **No Fallback:** If a script produces no table and no significant console output, no summary is generated, and the agent's response is a generic "Action completed successfully."

## 2. Desired Behavior & Goals

The goal is to make the agent's summary response concise, consistent, and always informative, regardless of the script's output.

1.  **For `Show` (Table) Output:** The agent should **always** respond with a simple text message stating the number of rows found and directing the user to the "Table" tab.
    > "Script executed successfully and returned a table with 36 rows. For the full output, see the **Table tab**."

2.  **For `Println` (Console) Output:** If there is no `Show` output, the agent should respond with a simple text message stating the number of lines printed.
    > "Script executed successfully and produced 15 lines of output in the **Console tab**."

3.  **For No `Show` or `Println`:** If the script only produces the default success/failure message, the agent should report that specific outcome.
    > "Code executed successfully."
    > or
    > "Code execution failed."

## 3. Implementation Plan

To achieve this, we will refactor the backend summary logic.

### Step 1: Refactor `summary_utils.py`

I will rewrite the `generate_summary` function to be simpler and more direct. It will **always** return a summary object and will never return `None` for a successful execution.

The new logic will be:

```python
def generate_summary(raw_execution_result: dict) -> dict:
    structured_output = raw_execution_result.get('structuredOutput')
    console_output = raw_execution_result.get('output', '')

    # Priority 1: Check for a table from Show()
    if structured_output and isinstance(structured_output, list):
        table_item = next((item for item in structured_output if item.get('type') == 'table'), None)
        if table_item and table_item.get('data'):
            try:
                rows = json.loads(table_item['data'])
                row_count = len(rows) if isinstance(rows, list) else 0
                return {'type': 'table', 'row_count': row_count}
            except json.JSONDecodeError:
                pass # Fall through to console summary

    # Priority 2: Check for relevant console output from Println()
    relevant_lines = [line for line in console_output.strip().split('\n') if not line.startswith("✅") and not line.startswith("❌")]
    if relevant_lines:
        return {'type': 'console', 'line_count': len(relevant_lines)}

    # Priority 3: Fallback to the default success or failure message
    if "✅ Code executed successfully" in console_output:
        return {'type': 'message', 'message': 'Code executed successfully.'}
    elif "❌ Code execution failed" in console_output:
        return {'type': 'message', 'message': 'Code execution failed.'}
    
    # Default fallback if no other condition is met
    return {'type': 'message', 'message': 'Action completed.'}
```

### Step 2: Refactor `summary_node.py`

I will simplify the `summary_node` to handle the new, consistent summary object from `generate_summary`. It no longer needs to handle raw data.

The new logic will be:

```python
def summary_node(state: dict) -> dict:
    summary_data = state.get("execution_summary")
    final_message = "Action completed." # Default

    if summary_data:
        summary_type = summary_data.get('type')
        if summary_type == 'table':
            row_count = summary_data.get('row_count', 0)
            final_message = f"Script executed successfully and returned a table with {row_count} rows. For the full output, see the **Table tab**."
        elif summary_type == 'console':
            line_count = summary_data.get('line_count', 0)
            final_message = f"Script executed successfully and produced {line_count} lines of output in the **Console tab**."
        elif summary_type == 'message':
            final_message = summary_data.get('message', 'Action completed.')

    # Create the final message and reset the state
    messages = state.get("messages", []) + [AIMessage(content=final_message)]
    return {
        "messages": messages,
        # Reset state for the next turn
        "selected_script_metadata": None,
        # ... (rest of the state reset)
    }
```

This plan creates a clean, predictable, and robust summary system that will behave exactly as you've specified for all possible script execution outcomes.
