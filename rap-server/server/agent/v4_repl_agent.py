import os
import json
from dataclasses import dataclass
from pydantic_ai import Agent, RunContext
from pydantic import BaseModel, Field
from agent.prompt import SYSTEM_PROMPT

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

