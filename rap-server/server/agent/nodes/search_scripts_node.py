from langchain_core.messages import ToolMessage
from ..state import AgentState
import json
import os

def search_scripts_node(state: AgentState):
    """Searches for available scripts by reading the local script manifest file."""
    print("search_scripts_node: Entry")
    agent_scripts_path = state.get("agent_scripts_path")
    
    # Get the tool_call_id from the last AIMessage
    last_ai_message = next((msg for msg in reversed(state['messages']) if hasattr(msg, 'tool_calls') and msg.tool_calls), None)
    tool_call_id = last_ai_message.tool_calls[0]['id'] if last_ai_message else "search_scripts_error"

    if not agent_scripts_path:
        error_message = "Missing agent_scripts_path in state."
        print(f"search_scripts_node: Error - {error_message}")
        return {
            "messages": [ToolMessage(content=error_message, tool_call_id=tool_call_id)],
            "next_conversational_action": "handle_error"
        }

    manifest_file_path = os.path.join(agent_scripts_path, "manifest.json")

    try:
        print(f"search_scripts_node: Attempting to read local manifest from: {manifest_file_path}")
        with open(manifest_file_path, 'r', encoding='utf-8') as f:
            scripts_metadata = json.load(f)

        if scripts_metadata:
            print(f"search_scripts_node: Found {len(scripts_metadata)} scripts from local manifest.")
            # Return the full list for the LLM to analyze and also save it to the state
            return {
                "identified_scripts_for_choice": scripts_metadata,
                "messages": [ToolMessage(content=json.dumps(scripts_metadata), tool_call_id=tool_call_id)]
            }
        else:
            print("search_scripts_node: Local manifest is empty.")
            return {
                "identified_scripts_for_choice": [], # Ensure it's an empty list
                "next_conversational_action": "handle_error",
                "messages": [ToolMessage(content="Local script manifest is empty.", tool_call_id=tool_call_id)]
            }

    except FileNotFoundError:
        error_message = f"Manifest file not found at: {manifest_file_path}. Please ensure the manifest is generated."
        print(f"search_scripts_node: Error - {error_message}")
        return {
            "messages": [ToolMessage(content=error_message, tool_call_id=tool_call_id)],
            "next_conversational_action": "handle_error"
        }
    except json.JSONDecodeError:
        error_message = f"Invalid JSON in manifest file at: {manifest_file_path}. Please ensure it's a valid JSON."
        print(f"search_scripts_node: Error - {error_message}")
        return {
            "messages": [ToolMessage(content=error_message, tool_call_id=tool_call_id)],
            "next_conversational_action": "handle_error"
        }
    except Exception as e:
        error_message = f"Error in search_scripts_node: {e}"
        print(f"search_scripts_node: Error - {error_message}")
        return {
            "messages": [ToolMessage(content=error_message, tool_call_id=tool_call_id)],
            "next_conversational_action": "handle_error"
        }
