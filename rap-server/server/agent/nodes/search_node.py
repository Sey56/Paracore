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

        if len(semantically_relevant_scripts) == 1:
            return {
                "selected_script_metadata": semantically_relevant_scripts[0],
                "script_selected_for_params": True,
                "next_conversational_action": "present_parameters"
            }
        elif len(semantically_relevant_scripts) > 1:
            # If multiple scripts are found, have the LLM rank them to find the best fit.
            ranking_prompt = f"""Given the user's query and a list of relevant scripts, which script is the single best fit for the task?
User Query: "{query}"
Relevant Scripts:
{json.dumps(semantically_relevant_scripts, indent=2)}
Your task is to respond with the `name` of the single best script. Only return the name, nothing else.
"""
            best_fit_response = llm.invoke([HumanMessage(content=ranking_prompt)])
            best_fit_name = best_fit_response.content.strip().replace('"', '')

            # Find the full metadata for the best fit script.
            best_script = next((s for s in semantically_relevant_scripts if s.get('name') == best_fit_name), None)

            # If a best script is found, proceed directly to parameter presentation.
            if best_script:
                return {
                    "selected_script_metadata": best_script,
                    "script_selected_for_params": True,
                    "next_conversational_action": "present_parameters"
                }
            # Fallback in case the LLM hallucinates a name (select the first one).
            else:
                return {
                    "selected_script_metadata": semantically_relevant_scripts[0],
                    "script_selected_for_params": True,
                    "next_conversational_action": "present_parameters"
                }

        else:
            return {"messages": [AIMessage(content="I couldn't find any relevant scripts for your task.")]}
    except Exception as e:
        print(f"search_node: Error processing LLM response for script filtering: {e}")
        return {"messages": [AIMessage(content="I encountered an error while trying to find relevant scripts. Please try again.")]}
