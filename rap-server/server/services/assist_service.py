import logging
import re
import os
import glob
from typing import List, Optional, Dict, Any

from pydantic import BaseModel, Field
from pydantic_ai import Agent
from pydantic_ai.models.google import GoogleModel
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider

from workspace_manager import get_scripts_dir
from api.assist_prompts import EXPLAIN_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

class FixAttempt(BaseModel):
    script_code: str
    explanation: str
    error_message: str

class ExplainErrorResponse(BaseModel):
    is_success: bool = Field(description="True if the AI successfully provided a fix.", default=False)
    explanation: str = Field(description="Clear explanation of the error and the fix.", default="")
    fixed_code: Optional[str] = Field(description="The complete fixed C# code (Mandatory for single-file scripts).", default=None)
    filename: Optional[str] = Field(description="The relative filename being fixed (e.g. 'Main.cs').", default=None)
    files: Optional[Dict[str, str]] = Field(description="A dictionary of filenames to their FULL fixed code contents (Mandatory for multi-file scripts). Use relative paths as keys.", default=None)
    error_message: Optional[str] = Field(description="Internal error message if the AI processing failed.", default=None)

# Define the Pydantic-ai Agent
error_fix_agent = Agent(
    'google-gla:gemini-1.5-flash',
    output_type=ExplainErrorResponse,
    system_prompt=EXPLAIN_SYSTEM_PROMPT
)

async def explain_error_logic(
    script_code: str,
    script_path: str,
    script_type: str,
    error_message: str,
    context: Dict[str, str],
    llm_provider: str,
    llm_model: str,
    llm_api_key_value: str,
    history: List[FixAttempt] = []
):
    try:
        # 1. Setup Model
        provider = llm_provider.lower()
        if "openai" in provider or "openrouter" in provider:
            os.environ["OPENAI_API_KEY"] = llm_api_key_value
            if "openrouter" in provider:
                provider_obj = OpenAIProvider(base_url="https://openrouter.ai/api/v1", api_key=llm_api_key_value)
                model = OpenAIModel(llm_model, provider=provider_obj)
            else:
                model = OpenAIModel(llm_model)
        elif "google" in provider or "gemini" in provider:
            os.environ["GOOGLE_API_KEY"] = llm_api_key_value
            model = GoogleModel(llm_model)
        else:
            model = GoogleModel(llm_model)

        # 2. Build History Messages
        history_context = ""
        if history:
            history_context = "\n### PREVIOUS ATTEMPTS (HISTORY):\n"
            for i, attempt in enumerate(history):
                history_context += f"Attempt {i+1}:\n- Error: {attempt.error_message}\n- Your Explanation: {attempt.explanation}\n---\n"

        context_str = "\n".join([f"{k}: {v}" for k, v in context.items()])
        
        # Resolve source code context from IDE workspace if active
        source_context = ""
        if script_type == "multi-file":
            try:
                scripts_dir = get_scripts_dir(script_path, script_type)
                if os.path.isdir(scripts_dir):
                    files_found = []
                    for fpath in glob.glob(os.path.join(scripts_dir, "*.cs")):
                        fname = os.path.basename(fpath)
                        if fname.lower() == "globals.cs": continue
                        try:
                            with open(fpath, 'r', encoding='utf-8-sig') as f: content = f.read()
                        except:
                            try:
                                with open(fpath, 'r', encoding='utf-8') as f: content = f.read()
                            except: continue
                        if content: files_found.append(f"### FILE: {fname}\n{content}")
                    source_context = "\n\n".join(files_found) if files_found else script_code
                else: source_context = script_code
            except Exception as e:
                logger.error(f"Failed to load files for AI fix: {e}")
                source_context = script_code
        else: source_context = script_code

        prompt = f"""[ERROR MESSAGE]
{error_message}

[SCRIPT CONTEXT]
Path: {script_path}
Type: {script_type}
{context_str}

{history_context}

[CURRENT SCRIPT CODE]
{source_context}

Please fix the error and provide the full code."""

        # 3. Run Agent
        result = await error_fix_agent.run(prompt, model=model)
        response_data = result.output
        
        # 4. Finalize & Clean Response
        if response_data.files:
            sanitized_files = {}
            for fname, fcontent in response_data.files.items():
                new_name = fname.replace("_cs", ".cs")
                if not new_name.endswith(".cs"): new_name += ".cs"
                sanitized_files[new_name] = fcontent
            response_data.files = sanitized_files

        script_name_raw = context.get("script_name") or "FixedScript.cs"
        response_data.filename = re.sub(r'[^\w\.-]', '_', str(script_name_raw))
        if not response_data.filename.endswith(".cs"): response_data.filename += ".cs"

        hallucination_map = {
            "Paracore.Scripting.Context.Document": "Doc",
            "Paracore.Scripting.Context.UIDocument": "Uidoc",
            "Paracore.Scripting.Context": "Doc",
            "CoreScript.Engine.Globals.Doc": "Doc",
            "CoreScript.Engine.Globals": "Doc",
            "3.28084": "1.0",
            "M_TO_FT": "1.0"
        }

        def clean_code(code: str) -> str:
            if not code: return code
            for hall, fix in hallucination_map.items(): code = code.replace(hall, fix)
            return code

        if response_data.fixed_code: response_data.fixed_code = clean_code(response_data.fixed_code)
        if response_data.files:
            for fname in response_data.files: response_data.files[fname] = clean_code(response_data.files[fname])

        response_data.is_success = True
        return response_data

    except Exception as e:
        logger.error(f"Explain error failed: {e}")
        err_str = str(e)
        if "503" in err_str or "overloaded" in err_str.lower():
            err_str = "🚀 The AI model is currently overloaded. Please try again in a few seconds."
        elif "429" in err_str or "rate limit" in err_str.lower():
            err_str = "⏳ Rate limit exceeded. Please wait a moment."
        return ExplainErrorResponse(is_success=False, explanation="The AI was unable to process your request.", error_message=err_str)
