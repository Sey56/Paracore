from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import logging
import json
import os

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

router = APIRouter(prefix="/agent/generate", tags=["agent"])
logger = logging.getLogger(__name__)

class GenerationRequest(BaseModel):
    requirement: str
    context_scripts: Optional[List[str]] = Field(default_factory=list, description="Optional list of curated script contents to use as reference.")
    llm_provider: str
    llm_model: str
    llm_api_key_value: str

class GenerationResponse(BaseModel):
    code: str
    explanation: str

GENERATOR_PROMPT = """You are an expert Revit API developer specializing in the Paracore C# scripting environment.
Your goal is to generate HIGH-FIDELITY, dynamic C# scripts that run inside the CoreScript.Engine.

**PARACORE CONVENTIONS (MUST FOLLOW):**
1. **Globals**: Use `Doc`, `UIDoc`, `App` for Revit access.
2. **Parameters**: Define a `public class Params` at the bottom and instantiate it as `var p = new Params();` at the top.
3. **Logging**: Use `Println("...")` for feedback. DO NOT use `Console.WriteLine`.
4. **Transactions**: Use `Transact("Action Name", () => { ... });` for any model changes.
5. **Tables**: Use `Table(myDataList);` to display structured output in the UI.
6. **Selection**: If the script is about selecting/isolating, use `UIDoc.Selection.SetElementIds(...)`.

**REFERENCE PATTERNS:**
Use the provided scripts below as templates for style, transactions, and parameter decorators (like [RevitElements] or [Unit("mm")]).

**OUTPUT FORMAT:**
Return ONLY the C# code followed by a brief markdown explanation. Wrap the code in ```csharp blocks.
"""

@router.post("/code", response_model=GenerationResponse)
async def generate_script(request: GenerationRequest):
    try:
        # Prepare LLM
        if "openai" in request.llm_provider.lower():
            llm = ChatOpenAI(
                model=request.llm_model,
                api_key=request.llm_api_key_value,
                temperature=0
            )
        else:
             raise HTTPException(status_code=400, detail="Only OpenAI provider is currently supported for direct generation.")

        # Build Context
        ref_text = "\n\n".join([f"--- REFERENCE SCRIPT ---\n{s}" for s in request.context_scripts])
        
        messages = [
            SystemMessage(content=GENERATOR_PROMPT),
            HumanMessage(content=f"Reference Scripts for Style:\n{ref_text}\n\nTask: {request.requirement}")
        ]

        response = await llm.ainvoke(messages)
        
        # Parse result (very simple split for now)
        content = response.content
        code = ""
        explanation = ""
        
        if "```csharp" in content:
            parts = content.split("```csharp")
            explanation_pre = parts[0]
            code_parts = parts[1].split("```")
            code = code_parts[0].strip()
            explanation = (explanation_pre + (code_parts[1] if len(code_parts) > 1 else "")).strip()
        else:
            code = content
            explanation = "Generated script (missing markdown markers)."

        return GenerationResponse(code=code, explanation=explanation)

    except Exception as e:
        logger.error(f"Generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
