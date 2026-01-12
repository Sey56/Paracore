"""
Gemini API client for code generation.
Supports configurable LLM provider, model, and API key.
"""

import os
import httpx
import json
import asyncio
from typing import Optional, List, Dict

from generation.system_prompt import get_corescript_generation_prompt, get_error_explanation_prompt


async def explain_and_fix_with_gemini(
    script_code: str,
    error_message: str,
    context: Optional[Dict[str, str]] = None,
    llm_model: str = "gemini-2.0-flash-exp",
    llm_api_key_name: Optional[str] = None,
    llm_api_key_value: Optional[str] = None,
    max_retries: int = 3
) -> str:
    """
    Explains and fixes a script error using Gemini API with retry logic.
    """
    
    # Get API key
    api_key = llm_api_key_value
    if not api_key and llm_api_key_name:
        api_key = os.getenv(llm_api_key_name)
    if not api_key:
        api_key = os.getenv("GEMINI_API_KEY")
    
    if not api_key:
        raise ValueError("No Gemini API key provided.")
    
    # Build prompt
    prompt = get_error_explanation_prompt(
        script_code=script_code,
        error_message=error_message,
        context=context
    )
    
    # Prepare request
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{llm_model}:generateContent?key={api_key}"
    request_body = {
        "contents": [
            {
                "parts": [{"text": prompt}],
                "role": "user"
            }
        ]
    }
    
    # Retry logic for transient errors
    delay_ms = 1000
    for attempt in range(1, max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, json=request_body)
                response_data = response.json()
                
                if "error" in response_data:
                    error_code = response_data["error"].get("code")
                    if error_code == 503 and attempt < max_retries:
                        await asyncio.sleep(delay_ms / 1000)
                        delay_ms *= 2
                        continue
                    raise Exception(f"Gemini API Error: {response_data['error'].get('message')}")
                
                text = response_data["candidates"][0]["content"]["parts"][0]["text"]
                return text
        
        except Exception as e:
            if attempt < max_retries:
                await asyncio.sleep(delay_ms / 1000)
                delay_ms *= 2
                continue
            raise
    
    raise Exception("Failed after maximum retries")


async def generate_code_with_gemini(
    task_description: str,
    previous_attempts: Optional[List[Dict[str, str]]] = None,
    use_web_search: bool = False,
    llm_model: str = "gemini-2.0-flash-exp",
    llm_api_key_name: Optional[str] = None,
    llm_api_key_value: Optional[str] = None,
    multi_file: bool = False,
    max_retries: int = 3
) -> str:
    """
    Generates code using Gemini API with retry logic.
    
    Args:
        task_description: User's natural language task
        previous_attempts: Optional list of previous failed attempts, each with 'code' and 'error'
        use_web_search: Enable Google Search for Revit API documentation
        llm_model: Gemini model name
        llm_api_key_name: Environment variable name for API key
        llm_api_key_value: Direct API key value (takes precedence)
        max_retries: Maximum retry attempts for transient errors
    
    Returns:
        Raw LLM response containing generated code
    """
    
    # Get API key
    api_key = llm_api_key_value
    if not api_key and llm_api_key_name:
        api_key = os.getenv(llm_api_key_name)
    if not api_key:
        api_key = os.getenv("GEMINI_API_KEY")  # Fallback
    
    if not api_key:
        raise ValueError("No Gemini API key provided. Set GEMINI_API_KEY environment variable or provide llm_api_key_value.")
    
    # Build prompt
    prompt = get_corescript_generation_prompt(
        user_task=task_description,
        previous_attempts=previous_attempts,
        multi_file=multi_file
    )
    
    # Prepare request
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{llm_model}:generateContent?key={api_key}"
    request_body = {
        "contents": [
            {
                "parts": [{"text": prompt}],
                "role": "user"
            }
        ]
    }
    
    # Add Google Search tool if web search is enabled
    if use_web_search:
        request_body["tools"] = [
            {
                "google_search": {}
            }
        ]
        print("[Generation] Web search enabled - LLM can search for Revit API docs")
    
    
    
    # Retry logic for transient errors
    delay_ms = 1000
    for attempt in range(1, max_retries + 1):
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, json=request_body)
                response_data = response.json()
                
                # Check for API errors
                if "error" in response_data:
                    error_code = response_data["error"].get("code")
                    error_msg = response_data["error"].get("message")
                    
                    # Retry on 503 (service unavailable)
                    if error_code == 503 and attempt < max_retries:
                        await asyncio.sleep(delay_ms / 1000)
                        delay_ms *= 2  # Exponential backoff
                        continue
                    
                    raise Exception(f"Gemini API Error (Code: {error_code}): {error_msg}")
                
                # Extract response text
                candidates = response_data.get("candidates", [])
                if not candidates:
                    raise Exception("No candidates found in Gemini API response")
                
                content = candidates[0].get("content", {})
                parts = content.get("parts", [])
                if not parts:
                    raise Exception("No parts found in Gemini API response")
                
                text = parts[0].get("text", "")
                if not text:
                    raise Exception("Empty response text from Gemini API")
                
                return text
        
        except httpx.TimeoutException:
            if attempt < max_retries:
                await asyncio.sleep(delay_ms / 1000)
                delay_ms *= 2
                continue
            raise Exception("Gemini API request timed out after retries")
        
        except Exception as e:
            if attempt < max_retries and "503" in str(e):
                await asyncio.sleep(delay_ms / 1000)
                delay_ms *= 2
                continue
            raise
    
    raise Exception("Failed to generate code after maximum retries")
