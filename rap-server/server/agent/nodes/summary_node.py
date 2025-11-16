import json
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.graph import END

from ..state import AgentState
from .utils import get_llm

def summary_node(state: AgentState):
    llm = get_llm(state)
    script_execution_result = state.get('script_execution_result')

    if not script_execution_result:
        return {"messages": [AIMessage(content="Error: No script execution result found to summarize.")], "next_conversational_action": END}

    summary = script_execution_result.get("output_summary")
    
    response_content = ""
    
    if summary:
        # Use LLM to generate a conversational summary
        summary_prompt = f"""The following is a structured summary of a script execution:
{json.dumps(summary, indent=2)}

Please generate a concise, conversational summary for the user based on this data.
- Start by stating if the script was successful or if it failed.
- If it was successful, briefly mention the key results from the console, table, or return value summaries. For example, "The script created a table with 50 rows" or "The script returned the value 'Success'".
- If there are many lines/rows (e.g., more than 5), mention the total count and explicitly tell the user to "See the Console tab for full output" or "See the Table tab for full output".
- If the script failed, clearly state the error message.
- Keep the entire response brief and conversational.
"""
        try:
            llm_response = llm.invoke([HumanMessage(content=summary_prompt)])
            response_content = llm_response.content
        except Exception as e:
            print(f"Error generating LLM summary: {e}")
            # Fallback to a default summary if LLM fails
            if script_execution_result.get("is_success"):
                response_content = "The script ran successfully. See the Console and Table tabs for details."
            else:
                response_content = f"The script failed: {script_execution_result.get('error_message', 'Unknown error')}. See the Console tab for details."
    else:
        # Fallback for when there is no summary object at all
        if script_execution_result.get("is_success"):
            response_content = "The script ran successfully. No detailed summary was available. See the Console and Table tabs for the full output."
        else:
            response_content = f"The script failed: {script_execution_result.get('error_message', 'Unknown error')}. See the Console tab for details."

    return {
        "messages": [AIMessage(content=response_content)],
        "next_conversational_action": END # Signal to end the conversation
    }
