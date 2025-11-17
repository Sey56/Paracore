import json

def generate_summary(raw_execution_result: dict) -> dict | None:
    """
    Inspects a raw script execution result and generates a concise summary
    if the output is large (e.g., >5 table rows or console lines).
    """
    print(f"SUMMARY_UTILS_DEBUG: Received raw_execution_result: {raw_execution_result}")

    structured_output = raw_execution_result.get('structuredOutput')
    console_output = raw_execution_result.get('output')

    # --- Table Summary ---
    if structured_output and isinstance(structured_output, list) and len(structured_output) > 0:
        table_item = next((item for item in structured_output if item.get('type') == 'table'), None)
        if table_item and table_item.get('data'):
            try:
                rows = json.loads(table_item['data'])
                print(f"SUMMARY_UTILS_DEBUG: Parsed {len(rows)} rows from table data.")

                if isinstance(rows, list) and len(rows) > 5:
                    print(f"SUMMARY_UTILS_DEBUG: Row count ({len(rows)}) > 5. Generating table summary.")
                    
                    truncated_rows = rows[:5]
                    # We need to re-serialize the truncated rows back to JSON strings for the agent node
                    truncated_rows_json = [json.dumps(row) for row in truncated_rows]

                    table_summary = {
                        'row_count': len(rows),
                        'truncated_rows_json': truncated_rows_json
                    }
                    summary = {'type': 'table', 'table': table_summary}
                    print(f"SUMMARY_UTILS_DEBUG: Returning table summary: {summary}")
                    return summary
                else:
                    print(f"SUMMARY_UTILS_DEBUG: Row count ({len(rows)}) <= 5. No table summary needed.")

            except json.JSONDecodeError as e:
                print(f"SUMMARY_UTILS_DEBUG: JSONDecodeError parsing table data: {e}")
                return None # Error parsing, no summary

    # --- Console Summary ---
    if console_output and isinstance(console_output, str):
        lines = console_output.strip().split('\n')
        # Filter out non-essential messages that the user doesn't need to see
        relevant_lines = [line for line in lines if not line.startswith("✅") and not line.startswith("❌")]
        
        print(f"SUMMARY_UTILS_DEBUG: Found {len(relevant_lines)} relevant console lines.")

        if len(relevant_lines) > 5:
            print(f"SUMMARY_UTILS_DEBUG: Line count ({len(relevant_lines)}) > 5. Generating console summary.")
            
            console_summary = {
                'line_count': len(relevant_lines),
                'truncated_lines': relevant_lines[:5]
            }
            summary = {'type': 'console', 'console': console_summary}
            print(f"SUMMARY_UTILS_DEBUG: Returning console summary: {summary}")
            return summary
        else:
            print(f"SUMMARY_UTILS_DEBUG: Line count ({len(relevant_lines)}) <= 5. No console summary needed.")

    print("SUMMARY_UTILS_DEBUG: No summary conditions met. Returning None.")
    return None