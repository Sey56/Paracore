from langchain_core.messages import AIMessage, HumanMessage
from pydantic import BaseModel, Field
from typing import List
import json

class RelevantScripts(BaseModel):
    """A list of relevant script absolute paths."""
    script_paths: List[str] = Field(description="A list of the string `absolutePath` values of scripts that are relevant to the user's query.")

def handle_semantic_search(state: dict, llm) -> dict:
    """
    Handles the logic for performing semantic search on the script manifest.
    """
    full_manifest = state['identified_scripts_for_choice']
    
    # Find the last human message to use as the query
    query = None
    for msg in reversed(state["messages"]):
        if isinstance(msg, HumanMessage):
            # Ignore the system message used to trigger the summary
            if msg.content != "System: Script execution was successful.":
                query = msg.content
                break
    
    if not query or not full_manifest:
        return {"messages": [AIMessage(content="I can't seem to find any scripts. Please check the agent's script path settings.")]}

    try:
        structured_llm = llm.with_structured_output(RelevantScripts)
        scripts_for_llm = [script for script in full_manifest if script.get('name') != 'manifest.json']
        filtering_prompt = f"""You are a script filter. Your task is to identify all scripts that EXACTLY match the user's requested action.
User Query: "{query}"
Review the "Available Scripts" below. For each script, check if its `description` indicates that it performs the user's requested action.
**CRITICAL RULE:** Do NOT select a script if it only contains a keyword but performs the wrong action. For example, if the query is "create a wall", a script that "rotates a wall" is not a match.
**EXAMPLE:**
If the user query is "make a building element" and the available scripts are one that "creates a wall" and another that "creates a floor", you should return the `absolutePath` of BOTH scripts.
Available Scripts:
{json.dumps(scripts_for_llm, indent=2)}
Identify ALL scripts that are a direct match for the user's query and return their `absolutePath` values.
"""
        response_obj = structured_llm.invoke([HumanMessage(content=filtering_prompt)])
        matching_paths = response_obj.script_paths
        semantically_relevant_scripts = [s for s in scripts_for_llm if s.get('absolutePath') in matching_paths]

        if not semantically_relevant_scripts:
            return {"messages": [AIMessage(content="I couldn't find any relevant scripts for your task.")]}

        # --- Sequence Planning ---
        class ScriptSequence(BaseModel):
            is_chain: bool = Field(description="True if the scripts should be executed in a sequence to fulfill the request. False if they are alternatives.")
            ordered_script_names: List[str] = Field(description="The names of the scripts in the correct execution order.")

        sequencing_llm = llm.with_structured_output(ScriptSequence)
        sequencing_prompt = f"""User Query: "{query}"
Identified Scripts:
{json.dumps(semantically_relevant_scripts, indent=2)}

Determine if the user's request requires executing multiple scripts in a specific order (a chain), or if these are alternative options and only one should be chosen.
If it is a chain, order them logically (e.g., Selection first, then Modification).
If they are alternatives, pick the single best one and put it in the list.

Return the decision.
"""
        sequence_response = sequencing_llm.invoke([HumanMessage(content=sequencing_prompt)])
        
        ordered_scripts = []
        for name in sequence_response.ordered_script_names:
            script = next((s for s in semantically_relevant_scripts if s.get('name') == name), None)
            if script:
                ordered_scripts.append(script)
        
        if not ordered_scripts:
             # Fallback if LLM returns names that don't match (shouldn't happen often)
             ordered_scripts = [semantically_relevant_scripts[0]]

        # Setup the execution queue
        first_script = ordered_scripts[0]
        remaining_queue = ordered_scripts[1:]

        return {
            "selected_script_metadata": first_script,
            "script_execution_queue": remaining_queue,
            "script_selected_for_params": True,
            "next_conversational_action": "present_parameters"
        }
    except Exception as e:
        print(f"search_node: Error processing LLM response for script filtering: {e}")
        return {"messages": [AIMessage(content="I encountered an error while trying to find relevant scripts. Please try again.")]}
