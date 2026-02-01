import logging
import re
import os
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider

from auth import CurrentUser, get_current_user

router = APIRouter(prefix="/generation", tags=["AI Assistance"])
logger = logging.getLogger(__name__)

class FixAttempt(BaseModel):
    script_code: str
    explanation: str
    error_message: str

class ExplainErrorRequest(BaseModel):
    script_code: str
    script_path: str
    type: str  # single-file or multi-file
    error_message: str
    context: Dict[str, str]
    llm_provider: str
    llm_model: str
    llm_api_key_value: str
    history: Optional[List[FixAttempt]] = []

class ExplainErrorResponse(BaseModel):
    is_success: bool = Field(description="True if the AI successfully provided a fix.", default=False)
    explanation: str = Field(description="Clear explanation of the error and the fix.", default="")
    fixed_code: Optional[str] = Field(description="The complete fixed C# code (Mandatory for single-file scripts).", default=None)
    filename: Optional[str] = Field(description="The relative filename being fixed (e.g. 'Main.cs').", default=None)
    files: Optional[Dict[str, str]] = Field(description="A dictionary of filenames to their FULL fixed code contents (Mandatory for multi-file scripts). Use relative paths as keys.", default=None)
    error_message: Optional[str] = Field(description="Internal error message if the AI processing failed.", default=None)

EXPLAIN_SYSTEM_PROMPT = """You are the Paracore Surgical Debugger. Your ONLY mission is to fix the reported [ERROR MESSAGE].

**SURGICAL PROTOCOL (ZERO TOLERANCE)**:
1. **FIX ONLY WHAT IS BROKEN**: If a line of code is not directly causing the reported error, DO NOT CHANGE, REFACTOR, OR "IMPROVE" IT.
2. **GLOBAL AUTHORITY**: `Doc`, `Uidoc`, `App`, and `Println` are **STATIC** properties of a globally imported class. They are 100% accessible inside `public class Params`. Never "fix" scope for them.
3. **NO HALLUCINATIONS**: Never use `Paracore.Scripting`, `Context`, or any imaginary namespaces.
4. **NO UNIT CONVERSIONS**: Do not add manual math factors (like 3.28084). The platform handles units via attributes.
5. **FULL INTEGRITY**: Always return the ENTIRE file content.

**OUTPUT FORMAT**:
- Multi-file: Populate the `files` dictionary with full code.
- Single-file: Populate `fixed_code` and `filename`.
"""

# Define the Pydantic-ai Agent
error_fix_agent = Agent(
    'google-gla:gemini-1.5-flash', # Default, will be overridden in run
    output_type=ExplainErrorResponse,
    system_prompt=EXPLAIN_SYSTEM_PROMPT
)

@router.post("/explain_error", response_model=ExplainErrorResponse)
async def explain_error(request: ExplainErrorRequest, current_user: CurrentUser = Depends(get_current_user)):
    try:
        # 1. Setup Model
        provider = request.llm_provider.lower()
        if "openai" in provider or "openrouter" in provider:
            os.environ["OPENAI_API_KEY"] = request.llm_api_key_value
            if "openrouter" in provider:
                provider_obj = OpenAIProvider(base_url="https://openrouter.ai/api/v1", api_key=request.llm_api_key_value)
                model = OpenAIModel(request.llm_model, provider=provider_obj)
            else:
                model = OpenAIModel(request.llm_model)
        elif "google" in provider or "gemini" in provider:
            os.environ["GOOGLE_API_KEY"] = request.llm_api_key_value
            model = GoogleModel(request.llm_model)
        else:
            # Fallback
            model = GoogleModel(request.llm_model)

        # 2. Build History Messages
        # We don't have a direct 'history' to 'messages' mapper in pydantic-ai yet, 
        # so we'll build a concise prompt including history context.
        history_context = ""
        if request.history:
            history_context = "\n### PREVIOUS ATTEMPTS (HISTORY):\n"
            for i, attempt in enumerate(request.history):
                history_context += f"Attempt {i+1}:\n"
                history_context += f"- Error: {attempt.error_message}\n"
                history_context += f"- Your Explanation: {attempt.explanation}\n"
                history_context += "---\n"

        context_str = "\n".join([f"{k}: {v}" for k, v in request.context.items()])
        
        prompt = f"""[ERROR MESSAGE]
{request.error_message}

[SCRIPT CONTEXT]
Path: {request.script_path}
Type: {request.type}
{context_str}

{history_context}

[CURRENT SCRIPT CODE]
{request.script_code}

Please fix the error and provide the full code.
"""

        # 3. Run Agent
        result = await error_fix_agent.run(prompt, model=model)
        
        # 4. Finalize Response
        response_data = result.output
        
        # Ensure filenames in 'files' dictionary are sanitized (e.g. Main_cs -> Main.cs)
        if response_data.files:
            sanitized_files = {}
            for fname, fcontent in response_data.files.items():
                new_name = fname.replace("_cs", ".cs")
                if not new_name.endswith(".cs"):
                    new_name += ".cs"
                sanitized_files[new_name] = fcontent
            response_data.files = sanitized_files

        # Ensure filename is robust
        script_name_raw = request.context.get("script_name") or "FixedScript.cs"
        response_data.filename = re.sub(r'[^\w\.-]', '_', str(script_name_raw))
        if not response_data.filename.endswith(".cs"):
            response_data.filename += ".cs"

        # HALLUCINATION FILTER (ROBUST): Search and replace common hallucinations
        # This acts as an absolute technical barrier.
        hallucination_map = {
            "Paracore.Scripting.Context.Document": "Doc",
            "Paracore.Scripting.Context.UIDocument": "Uidoc",
            "Paracore.Scripting.Context": "Doc", # Fallback for partials
            "CoreScript.Engine.Globals.Doc": "Doc",
            "CoreScript.Engine.Globals": "Doc",
            "3.28084": "1.0", # Kill manual unit conversions that fight the engine
            "M_TO_FT": "1.0"
        }

        def clean_code(code: str) -> str:
            if not code: return code
            for hall, fix in hallucination_map.items():
                code = code.replace(hall, fix)
            return code

        if response_data.fixed_code:
            response_data.fixed_code = clean_code(response_data.fixed_code)
        
        if response_data.files:
            for fname in response_data.files:
                response_data.files[fname] = clean_code(response_data.files[fname])

        response_data.is_success = True

        return response_data

    except Exception as e:
        logger.error(f"Explain error failed: {e}")
        err_str = str(e)
        if "503" in err_str or "overloaded" in err_str.lower():
            err_str = "🚀 The AI model is currently overloaded. Please try again in a few seconds or switch to a different model (e.g., Gemini 1.5 Pro)."
        elif "429" in err_str or "rate limit" in err_str.lower():
            err_str = "⏳ Rate limit exceeded. Please wait a moment before trying again, or use a model with higher capacity."
        
        return ExplainErrorResponse(
            is_success=False, 
            explanation="The AI was unable to process your request.",
            error_message=err_str
        )
