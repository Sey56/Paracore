import json


def generate_summary(raw_execution_result: dict) -> dict | None:
    """
    Inspects a raw script execution result and generates a concise summary
    object based on the type of output.
    """
    structured_output = raw_execution_result.get('structuredOutput')
    console_output = raw_execution_result.get('output', '')

    # --- Priority 1: Table Summary (from 'Show' global) ---
    if structured_output and isinstance(structured_output, list) and len(structured_output) > 0:
        table_item = next((item for item in structured_output if item.get('type') == 'table'), None)
        if table_item and table_item.get('data'):
            try:
                rows = json.loads(table_item['data'])
                if isinstance(rows, list):
                    summary = {'type': 'table', 'row_count': len(rows)}

                    # Add headers and preview
                    if len(rows) > 0:
                        first_row = rows[0]
                        if isinstance(first_row, dict):
                            summary['headers'] = list(first_row.keys())
                            # Preview first 2 rows
                            summary['preview'] = rows[:2]

                    return summary
            except (json.JSONDecodeError, TypeError):
                # If data is invalid, fall through to other summary types
                pass

    # --- Priority 2: Console Summary (from 'Println' global) ---
    if console_output and isinstance(console_output, str):
        lines = console_output.strip().split('\n')

        # Filter out the timestamp line only
        relevant_lines = [line for line in lines if not line.startswith("✅ Code executed") and not line.startswith("❌ Code execution")]

        if relevant_lines:
            summary = {'type': 'console', 'line_count': len(relevant_lines)}

            # Check for explicit SUMMARY: convention
            summary_lines = [line for line in relevant_lines if line.strip().startswith("SUMMARY:")]
            if summary_lines:
                # Join multiple summary lines if present, removing the prefix
                summary_text = " ".join([line.replace("SUMMARY:", "").strip() for line in summary_lines])
                summary['summary_text'] = summary_text
            else:
                # Prioritize lines with ✅ or ❌ (result messages), otherwise take first line
                result_lines = [line for line in relevant_lines if line.startswith("✅") or line.startswith("❌")]
                if result_lines:
                    # Use the first result line as the summary
                    summary['preview'] = [result_lines[0]]
                else:
                    # Fallback to first line if no result markers found
                    summary['preview'] = relevant_lines[:1]

            return summary

    # --- Priority 3: Default Summary (Success/Failure message) ---
    if console_output and isinstance(console_output, str):
        lines = console_output.strip().split('\n')
        for line in lines:
            if line.startswith("✅") or line.startswith("❌"):
                # Extract the message before the timestamp
                message = line.split('|')[0].strip()
                # Clean up the emoji marker
                message = message.replace("✅", "").replace("❌", "").strip()
                return {'type': 'default', 'message': message}

    return None
