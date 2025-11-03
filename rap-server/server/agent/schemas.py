from pydantic import BaseModel, Field
from typing import List, Optional, Any, Literal

class AgentResponse(BaseModel):
    """
    The response model for the agent's structured output.
    """
    message_to_user: str = Field(..., description="A natural language message to the user.")
    structured_data: dict = Field(..., description="Structured data containing action and other relevant information.")

# The following schema is generated from the Pydantic model above.
# It's kept here for reference or for use cases that require a dictionary schema.
AGENT_RESPONSE_SCHEMA = AgentResponse.model_json_schema()