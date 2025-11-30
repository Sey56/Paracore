from langchain_core.messages import AIMessage, HumanMessage
from pydantic import BaseModel, Field
from typing import List, Any, Dict
import json
import uuid

from .utils import get_llm

def evaluate_visible_when(condition: str, all_params: List[Dict]) -> bool:
    """
    Evaluates a visibleWhen condition for a parameter.
    Returns True if the parameter should be visible, False otherwise.
    """
    if not condition:
        return True
    
    # Support == and != operators
    operators = ['==', '!=']
    operator = None
    for op in operators:
        if op in condition:
            operator = op
            break
    
    if not operator:
        return True
    
    parts = condition.split(operator)
    if len(parts) != 2:
        return True
    
    param_name = parts[0].strip()
    expected_value_str = parts[1].strip()
    
    # Remove quotes from expected value
    if (expected_value_str.startswith("'") and expected_value_str.endswith("'")) or \
       (expected_value_str.startswith('"') and expected_value_str.endswith('"')):
        expected_value_str = expected_value_str[1:-1]
    
    # Find the parameter
    param = next((p for p in all_params if p.get('name') == param_name), None)
    if not param:
        return True
    
    actual_value = param.get('value', param.get('defaultValueJson'))
    
    # Evaluate condition
    if operator == '==':
        return str(actual_value) == str(expected_value_str)
    elif operator == '!=':
        return str(actual_value) != str(expected_value_str)
    
    return True

def filter_visible_parameters(params: List[Dict]) -> List[Dict]:
    """
    Filters parameters based on their visibleWhen conditions.
    Returns only the visible parameters.
    """
    visible = []
    for param in params:
        if evaluate_visible_when(param.get('visibleWhen'), params):
            visible.append(param)
    return visible

def handle_present_parameters(state: dict) -> dict:
    """
    Handles the logic for presenting script parameters to the user.
    """
    selected_script = state.get('selected_script_metadata')
    parameters = state.get('script_parameters_definitions')
    script_name = selected_script.get('name', 'the selected script')

    # Check if this script has parameter sets (Mode parameter)
    has_parameter_set = False
    if isinstance(parameters, list):
        for param in parameters:
            if isinstance(param, dict) and param.get('visibleWhen'):
                has_parameter_set = True
                break

    # Check if there are any parameters to present
    if parameters:
        if has_parameter_set:
            # For scripts with parameter sets, ask user to select the mode first
            param_summary = f"I've selected the script **{script_name}**.\n\nThis script has multiple parameter sets (modes). Please select the mode in the Parameters tab, then type 'proceed' to continue."
        else:
            # For regular scripts, list all parameters
            param_summary = f"Here are the parameters for {script_name}:\n"
            for param in parameters:
                param_summary += f"- {param.get('name')}: Type={param.get('type')}, Default={param.get('defaultValueJson')}\n"
            param_summary += "\nDo you want to run it with these parameters, or would you like to change any parameter values?"
    else:
        # If there are no parameters, provide a more direct confirmation message
        param_summary = f"The script {script_name} doesn't require any parameters.\n\nDo you want to run it?"
    
    return {
        "messages": [AIMessage(content=param_summary)],
        "next_conversational_action": "confirm_execution"
    }

def handle_parameter_modification(state: dict, llm) -> dict:
    """
    Handles the logic for modifying script parameters based on user input.
    """
    current_human_message = None
    for msg in reversed(state["messages"]):
        if isinstance(msg, HumanMessage):
            current_human_message = msg
            break

    current_params = state.get('script_parameters_definitions', [])

    # Special handling for scripts with NO parameters
    if not current_params:
        is_affirmative_prompt = f"""Is the user's response an affirmative confirmation (e.g., yes, sure, ok, do it)? Respond with a single word: YES or NO. User response: "{current_human_message.content}" """
        affirmative_response = llm.invoke([HumanMessage(content=is_affirmative_prompt)])
        is_affirmative = "YES" in affirmative_response.content.strip().upper()

        if is_affirmative:
            # If user says yes, proceed directly to execution
            selected_script = state.get('selected_script_metadata')
            tool_call = {
                "name": "run_script_by_name",
                "args": {
                    "script_name": str(selected_script.get('name')),
                    "parameters": {},  # No parameters
                    "is_final_approval": True
                },
                "id": f"tool_call_{uuid.uuid4()}"
            }
            return {
                "messages": [AIMessage(content="", tool_calls=[tool_call])],
                "status": "interrupted",
                "tool_call": tool_call,
            }
        else:
            # If user says no, cancel the operation gracefully and clear ALL state
            return {
                "messages": [AIMessage(content="Okay, I won't run the script. What would you like to do next?")],
                "next_conversational_action": None,
                
                # Clear all script-specific state
                "selected_script_metadata": None,
                "script_parameters_definitions": None,
                "script_selected_for_params": False,
                "user_provided_param_modifications": None,
                "ui_parameters": None,
                "final_parameters_for_execution": None,
                
                # Clear discovery state
                "identified_scripts_for_choice": None,
                "recommended_script_name": None,
                "current_task_description": None,
                "script_execution_queue": None,
            }

    # Check if this script has parameter sets
    has_parameter_set = False
    if isinstance(current_params, list):
        for param in current_params:
            if isinstance(param, dict) and param.get('visibleWhen'):
                has_parameter_set = True
                break

    # For parameter set scripts, check if user is saying "proceed" after mode selection
    # CRITICAL: Only apply this logic if we're in the confirm_execution state
    if has_parameter_set and state.get('next_conversational_action') == 'confirm_execution':
        proceed_keywords = ["proceed", "continue", "go ahead", "next"]
        is_simple_proceed = any(kw in current_human_message.content.lower() for kw in proceed_keywords)
        
        if is_simple_proceed and len(current_human_message.content.split()) <= 3:
            # User selected mode and said "proceed" - present filtered parameters
            selected_script = state.get('selected_script_metadata')
            script_name = selected_script.get('name', 'the selected script')
            
            # Apply UI parameters (mode selection)
            ui_params = state.get('ui_parameters', {})
            params_dict = {str(p['name']): p for p in current_params if 'name' in p and isinstance(p['name'], str)}
            
            if ui_params:
                for param_name, param_value in ui_params.items():
                    if param_name in params_dict:
                        params_dict[param_name]['value'] = param_value
            
            updated_params_list = list(params_dict.values())
            
            # Filter to only visible parameters
            visible_params = filter_visible_parameters(updated_params_list)
            
            # Present only visible parameters
            param_summary = f"Here are the parameters for {script_name}:\n"
            for param in visible_params:
                value = param.get('value', param.get('defaultValueJson'))
                param_summary += f"- {param.get('name')}: {value}\n"
            param_summary += "\nDo you want to run it with these parameters, or would you like to change any parameter values?"
            
            return {
                "messages": [AIMessage(content=param_summary)],
                "script_parameters_definitions": updated_params_list,
                "next_conversational_action": "confirm_execution"
            }

    # --- Existing logic for scripts WITH parameters ---
    class ParameterUpdate(BaseModel):
        """A single parameter update."""
        name: str = Field(description="The name of the parameter to update.")
        value: Any = Field(description="The new value for the parameter.")

    class ParameterUpdates(BaseModel):
        """A list of parameter updates extracted from the user's message."""
        updates: List[ParameterUpdate] = Field(description="A list of parameter updates.")

    extraction_llm = llm.with_structured_output(ParameterUpdates)
    
    # Create a simplified representation of parameters for the prompt
    param_context = [
        {"name": p.get('name'), "defaultValue": p.get('defaultValueJson')} 
        for p in current_params
    ]

    extraction_prompt = f"""The user wants to modify parameters for a script. Their request is: "{current_human_message.content}"
    
Here are the available parameters and their default values, which you should use as a formatting guide:
{json.dumps(param_context, indent=2)}
    
Your task is to extract the parameter names and their new values from the user's request.
    - The user might refer to parameters by their exact name or a close variation (e.g., "level" for "levelName").
    - The value could be a string, a number, or a boolean.
    - **Crucially, you must format the new value to match the style of the default value.** For example, if the default is "Level 1" and the user says "set level to 2", the new value must be "Level 2".
    - If a parameter name from the user's request does not closely match any of the available parameter names, ignore it.
    
Return a list of all identified parameter updates.
    """
    
    try:
        extracted_updates_obj = extraction_llm.invoke([HumanMessage(content=extraction_prompt)])
        chat_updates = {str(item.name): item.value for item in extracted_updates_obj.updates}
    except Exception as e:
        print(f"parameter_node: Could not extract parameter updates from user message: {e}")
        chat_updates = {}

    # Merge parameters: UI changes first, then chat changes
    ui_params = state.get('ui_parameters') # This is a dict of {name: value} 
    
    # Create a dictionary of current parameters for easy lookup
    params_dict = {str(p['name']): p for p in current_params if 'name' in p and isinstance(p['name'], str)}

    # Apply UI updates
    if ui_params:
        for param_name, param_value in ui_params.items():
            if param_name in params_dict:
                params_dict[param_name]['value'] = param_value
                # CRITICAL FIX: DO NOT update defaultValueJson here. It must retain the original default.

    # Apply chat updates (these take precedence)
    if chat_updates:
        for param_name, param_value in chat_updates.items():
            # Find the correct parameter name (case-insensitive)
            for p_name in params_dict.keys():
                if p_name.lower() == param_name.lower():
                    params_dict[p_name]['value'] = param_value
                    # CRITICAL FIX: DO NOT update defaultValueJson here. It must retain the original default.
                    break

    updated_params_list = list(params_dict.values())

    # Check if the user also wants to run the script
    run_intent_prompt = f"""You must determine if the user wants to execute the script based on their message.
- If the message ONLY contains parameter changes (e.g., "change the level to 2", "set the height to 5"), respond NO.
- If the message contains an explicit command to proceed or execute (e.g., "run it", "yes", "ok", "proceed", "change the level to 2 and run it"), respond YES.

User request: "{current_human_message.content}"
Does this message contain an explicit command to run the script? Respond with a single word: YES or NO.
"""
    run_intent_response = llm.invoke([HumanMessage(content=run_intent_prompt)])
    is_run_request = "YES" in run_intent_response.content.strip().upper()

    if is_run_request:
        # Prepare for HITL by calling the run_script_by_name tool
        selected_script = state.get('selected_script_metadata')
        # Normalize parameter values so the backend receives plain strings for simple values
        final_params = {}
        for p in updated_params_list:
            if 'name' not in p or not isinstance(p['name'], str):
                continue
            name = str(p['name'])
            val = p.get('value')
            # If value is a dict/list, send JSON string
            if isinstance(val, (dict, list)):
                final_params[name] = json.dumps(val)
            elif isinstance(val, str):
                # Strip accidental surrounding quotes from UI or chat input
                if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                    final_params[name] = val[1:-1]
                else:
                    final_params[name] = val
            else:
                # For numbers/bools/None, convert to plain string
                final_params[name] = str(val)
        
        tool_call = {
            "name": "run_script_by_name",
            "args": {
                "script_name": str(selected_script.get('name')),
                "parameters": final_params,
                "is_final_approval": True  # Signal to frontend this is the final step
            },
            "id": f"tool_call_{uuid.uuid4()}"  # Generate a unique ID
        }
        
        return {
            "messages": [AIMessage(content="", tool_calls=[tool_call])],
            "status": "interrupted",  # Signal to frontend to look for tool_call
            "tool_call": tool_call,  # Include the tool_call directly in the response data
            "final_parameters_for_execution": updated_params_list,  # Keep this for potential frontend use
        }

    else:
        # Just respond with the updated parameters for confirmation
        # Filter to only visible parameters
        visible_params = filter_visible_parameters(updated_params_list)
        
        param_summary = "I've updated the parameters. Here is the new configuration:\n"
        for param in visible_params:
            # We need to use 'value' to show the current setting, not 'defaultValueJson'
            value = param.get('value', param.get('defaultValueJson'))
            param_summary += f"- {param.get('name')}: {value}\n"
        param_summary += "\nDo you want to run the script with these settings, or make more changes?"

        return {
            "messages": [AIMessage(content=param_summary)],
            "script_parameters_definitions": updated_params_list,
            "next_conversational_action": "confirm_execution"  # Stay in this state
        }