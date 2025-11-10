import json
import os
import asyncio
from langchain_core.messages import ToolMessage
from ..state import AgentState # Corrected import path
from ..api_helpers import handle_list_available_scripts

async def list_scripts_node(state: AgentState) -> dict:
    """
    Acts as a fast "retriever" in a RAG pattern. It performs a quick, local
    keyword search on the manifest to find a small number of candidate scripts.
    It does NOT call an LLM.
    """
    print("--- list_scripts_node (retriever) called ---")
    last_message = state["messages"][-1]
    tool_call_id = last_message.tool_calls[0]['id'] if last_message.tool_calls else ""

    task_description = state.get("current_task_description", "").lower()
    print(f"DEBUG: Task Description: '{task_description}'")
    if not task_description:
        return {"messages": [ToolMessage(content=json.dumps({"error": "No task description found."}), tool_call_id=tool_call_id)]}

    # 1. Get the manifest from the helper
    list_scripts_result = await handle_list_available_scripts(state)
    if not list_scripts_result.get("is_success"):
        return {"messages": [ToolMessage(content=json.dumps(list_scripts_result), tool_call_id=tool_call_id)]}
    
    all_scripts = list_scripts_result.get("manifest", [])
    print(f"DEBUG: All Scripts Manifest: {json.dumps(all_scripts, indent=2)}")
    if not all_scripts:
        return {"messages": [ToolMessage(content=json.dumps({"error": "Script manifest is empty."}), tool_call_id=tool_call_id)]}

    # 2. Perform a fast, local keyword search (the "retrieval" step)
    task_words = task_description.split() # Keep as list for simpler iteration
    print(f"DEBUG: Task Words (list): {task_words}")
    candidate_scripts = []
    for script in all_scripts:
        script_description = script.get("description", "").lower()
        script_display_name = script.get("displayName", "").lower()
        script_name = script.get("name", "").lower()
        
        print(f"DEBUG: Processing Script: '{script_name}'")
        print(f"DEBUG:   Description: '{script_description}'")
        print(f"DEBUG:   Display Name: '{script_display_name}'")

        searchable_text = " ".join([script_description, script_display_name, script_name])
        print(f"DEBUG:   Searchable Text: '{searchable_text}'")

        # Check if any word from the task description is in the searchable text
        found_match = False
        for word in task_words:
            if word in searchable_text:
                found_match = True
                break
        
        print(f"DEBUG:   Found Match: {found_match}")
        if found_match:
            candidate_scripts.append(script)

    print(f"--- Retriever found {len(candidate_scripts)} candidate(s) ---")

    # 3. Return the small list of candidates in the ToolMessage
    # The main agent LLM will then perform the final semantic choice.
    
    # Store the identified candidates in the state
    state['identified_scripts_for_choice'] = candidate_scripts if candidate_scripts else None

    # Return a simple confirmation message to the history.
    confirmation_message = {
        "status": "success",
        "message": f"Retriever found {len(candidate_scripts)} candidate(s). Agent should now analyze 'identified_scripts_for_choice' in state."
    }

    return {
        "identified_scripts_for_choice": state['identified_scripts_for_choice'],
        "messages": [
            ToolMessage(
                content=json.dumps(confirmation_message), 
                tool_call_id=tool_call_id
            )
        ]
    }
