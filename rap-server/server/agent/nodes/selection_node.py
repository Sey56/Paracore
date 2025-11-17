from langchain_core.messages import AIMessage, HumanMessage
import re

def handle_script_selection(state: dict, llm) -> dict:
    """
    Handles the logic for user script selection from a list of choices.
    """
    current_human_message = None
    for msg in reversed(state["messages"]):
        if isinstance(msg, HumanMessage):
            current_human_message = msg
            break

    user_selection = current_human_message.content.strip()
    identified_scripts = state.get('identified_scripts_for_choice', [])
    recommended_script_name = state.get('recommended_script_name')
    selected_script = None

    # Prioritize checking for a specific script selection first
    selected_script = None
    
    # Check for a number in the user's response
    numbers_in_response = re.findall(r'\d+', user_selection)
    if numbers_in_response:
        try:
            index = int(numbers_in_response[0]) - 1
            if 0 <= index < len(identified_scripts):
                selected_script = identified_scripts[index]
        except (ValueError, IndexError):
            pass # Ignore if conversion or indexing fails
    
    # If not a number, check for name
    if not selected_script:
        # Check for a script name (or part of it) in the user's response
        for script in identified_scripts:
            # e.g., "spiral" in "Create_Spiral_Wall.cs"
            script_base_name = script.get('name', '').split('.')[0].lower().replace('_', ' ')
            if script_base_name in user_selection.lower():
                selected_script = script
                break # Take the first partial match

    # If no specific script was chosen, check if the user is affirming the recommendation
    if not selected_script:
        affirmation_prompt = f"""The user was asked to confirm a recommended action. Their response is: "{user_selection}"\nIs this response a confirmation or agreement (e.g., yes, proceed, ok, do it, sounds good)?\nRespond with a single word: YES or NO.\n"""
        affirmation_response = llm.invoke([HumanMessage(content=affirmation_prompt)])
        is_affirmation = "YES" in affirmation_response.content.strip().upper()

        if is_affirmation and recommended_script_name:
            selected_script = next((s for s in identified_scripts if s.get('name') == recommended_script_name), None)
    
    if selected_script:
        return {
            "selected_script_metadata": selected_script,
            "script_selected_for_params": True,
            "next_conversational_action": "present_parameters"
        }
    else:
        return {
            "messages": [AIMessage(content="I couldn't understand your selection. Please respond with the number or exact name of the script you'd like to proceed with.")],
            "next_conversational_action": "ask_for_script_confirmation"
        }
