import json
from langchain_core.messages import AIMessage

def summary_node(state: dict) -> dict:
    """
    Handles the post-execution summary logic.
    Formats a summary of the script execution results.
    """
    final_message = "Action completed successfully." # Default message
    summary_data = state.get("execution_summary")
    raw_output_data = state.get("raw_output_for_summary")

    if summary_data:
        # Case 1: A pre-generated summary exists (for large outputs)
        if summary_data.get('type') == 'table' and summary_data.get('table'):
            table_summary = summary_data['table']
            rows_json = table_summary.get('truncated_rows_json', [])
            total_rows = table_summary.get('row_count', len(rows_json))
            
            if rows_json:
                try:
                    rows_data = [json.loads(r) for r in rows_json]
                    headers = list(rows_data[0].keys())
                    
                    # Format Markdown Table
                    header_line = "| " + " | ".join(headers) + " |"
                    separator_line = "| " + " | ".join(['---'] * len(headers)) + " |"
                    body_lines = []
                    for row in rows_data:
                        body_lines.append("| " + " | ".join(str(row.get(h, '')) for h in headers) + " |")
                    
                    table_str = "\n".join([header_line, separator_line] + body_lines)
                    final_message = f"Script executed successfully. Here are the first {len(rows_data)} rows:\n\n{table_str}\n\n...contains {total_rows} items. For full output see the **Table tab**."
                except (json.JSONDecodeError, IndexError):
                    final_message = f"Script returned a table with {total_rows} rows, but there was an error displaying a preview. For full output see the **Table tab**."
            else:
                final_message = f"Script returned a table with {total_rows} rows. For full output see the **Table tab**."

        elif summary_data.get('type') == 'console' and summary_data.get('console'):
            console_summary = summary_data['console']
            lines = console_summary.get('truncated_lines', [])
            total_lines = console_summary.get('line_count', len(lines))
            
            if lines:
                code_block = "```\n" + "\n".join(lines) + "\n```"
                final_message = f"Script executed successfully. Here are the first {len(lines)} lines:\n\n{code_block}\n\n...contains {total_lines} lines. For full output see the **Console tab**."
            else:
                final_message = f"Script produced {total_lines} log messages. For full output see the **Console tab**."

    elif raw_output_data:
        # Case 2: No pre-generated summary exists (for small outputs)
        structured_output = raw_output_data.get('structuredOutput')
        console_output = raw_output_data.get('output')

        if structured_output and isinstance(structured_output, list) and len(structured_output) > 0:
            table_item = next((item for item in structured_output if item.get('type') == 'table'), None)
            if table_item and table_item.get('data'):
                try:
                    rows_data = json.loads(table_item['data'])
                    if isinstance(rows_data, list) and len(rows_data) > 0:
                        headers = list(rows_data[0].keys())
                        header_line = "| " + " | ".join(headers) + " |"
                        separator_line = "| " + " | ".join(['---'] * len(headers)) + " |"
                        body_lines = ["| " + " | ".join(str(row.get(h, '')) for h in headers) + " |" for row in rows_data]
                        table_str = "\n".join([header_line, separator_line] + body_lines)
                        final_message = f"Script executed successfully and returned the following table:\n\n{table_str}"
                except (json.JSONDecodeError, IndexError):
                    final_message = "Script executed successfully, but there was an error displaying the table output."

        elif console_output:
            lines = console_output.strip().split('\n')
            relevant_lines = [line for line in lines if not line.startswith("✅") and not line.startswith("❌")]
            if relevant_lines:
                code_block = "```\n" + "\n".join(relevant_lines) + "\n```"
                final_message = f"Script executed successfully with the following output:\n\n{code_block}"
            else:
                final_message = "Script executed successfully."
    
    # Return state to end the conversation
    return {
        "messages": [AIMessage(content=final_message)],
        # Reset state for the next turn
        "selected_script_metadata": None,
        "script_parameters_definitions": None,
        "next_conversational_action": None,
        "identified_scripts_for_choice": None,
        "recommended_script_name": None,
        "script_selected_for_params": None,
        "final_parameters_for_execution": None,
        "ui_parameters": None,
        "execution_summary": None,
        "raw_output_for_summary": None,
    }
