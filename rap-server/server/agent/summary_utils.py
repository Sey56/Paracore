import json
import re

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
                    return {'type': 'table', 'row_count': len(rows)}
            except (json.JSONDecodeError, TypeError):
                # If data is invalid, fall through to other summary types
                pass

    # --- Priority 2: Console Summary (from 'Println' global) ---
    if console_output and isinstance(console_output, str):
        lines = console_output.strip().split('\n')
        # Relevant lines are those not starting with the default success/failure markers
        relevant_lines = [line for line in lines if not line.startswith("✅") and not line.startswith("❌")]
        
        if relevant_lines:
            return {'type': 'console', 'line_count': len(relevant_lines)}

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