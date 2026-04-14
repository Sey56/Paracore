import os
import json
from dataclasses import dataclass
from pydantic_ai import Agent, RunContext
from pydantic import BaseModel, Field
from agent.prompt import SYSTEM_PROMPT
import logging

try:
    from grpc_client import execute_script
except ImportError:
    import sys
    import os
    sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from grpc_client import execute_script

logger = logging.getLogger(__name__)

# The Sovereign Handoff signal class. 
# This tells the router to pause execution and ask the human.
class InterruptedException(Exception):
    def __init__(self, csharp_code: str, justification: str):
        self.csharp_code = csharp_code
        self.justification = justification
        super().__init__("Sovereign Handoff requested for UI approval.")

@dataclass
class AgentDeps:
    user_id: str
    thread_id: str

v4_repl_agent = Agent(
    deps_type=AgentDeps,
    system_prompt=SYSTEM_PROMPT
)
class DynamicQueryArgs(BaseModel):
    csharp_code: str = Field(description="The C# snippet to execute in the Paracore REPL.")
    justification: str = Field(description="A short explanation of why you are running this code.")

@v4_repl_agent.tool
async def execute_dynamic_query(ctx: RunContext[AgentDeps], args: DynamicQueryArgs) -> str:
    """
    Executes a dynamic C# snippet in the Revit Paracore Engine.
    Calling this tool will pause the agent and prompt the human for approval.
    """
    # SOVEREIGN HANDOFF: We interrupt the agent's flow by raising this custom exception.
    # The agent_router.py will catch this exception, extract the code, and send it to the UI.
    raise InterruptedException(args.csharp_code, args.justification)

class ExploreQueryArgs(BaseModel):
    csharp_code: str = Field(description="The C# snippet to execute silently for parameter discovery or data fetching.")
    justification: str = Field(description="Why you need this information before completing the user's task.")

@v4_repl_agent.tool
async def explore_revit_data(ctx: RunContext[AgentDeps], args: ExploreQueryArgs) -> str:
    """
    Executes a dynamic C# snippet SILENTLY in Revit and returns the output to you immediately.
    Use this to run `.CombinedParams().Table()` or check properties BEFORE writing the final answer.
    """
    try:
        # We auto-inject Take(20) at the end if Table() or CombinedParams is used to prevent token flooding
        # But for now we trust the LLM or handle the shield in the router.
        logger.info(f"Agent Exploring Data: {args.justification}")
        
        result = execute_script(args.csharp_code, "{}")
        
        if result["is_success"]:
            output_str = ""
            if result.get("structured_output"):
                output_str = json.dumps(result["structured_output"])
            else:
                output_str = str(result.get("output", "Execution succeeded with no output."))
            
            # The Shield: Truncate massive outputs to prevent context flooding
            if len(output_str) > 8000:
                output_str = output_str[:8000] + "\n... [TRUNCATED: Result exceeded 8000 characters. Refine your query, e.g., use .Take(10) or filter further.]"
            return output_str
        else:
            return f"Execution Failed: {result['error_message']}\nDetails: {result['error_details']}"
            
    except Exception as e:
        return f"Error executing exploration script: {str(e)}"
