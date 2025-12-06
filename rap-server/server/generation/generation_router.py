"""
Router for AI script generation endpoints.
Handles code generation and execution for Generation Mode.
"""

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from typing import Optional, List, Dict
import os
import re
import asyncio

from auth import get_current_user, CurrentUser
from generation.gemini_client import generate_code_with_gemini

router = APIRouter(prefix="/generation", tags=["Generation"])


class GenerateScriptRequest(BaseModel):
    task_description: str
    previous_attempts: Optional[List[Dict[str, str]]] = None  # List of {"code": ..., "error": ...}
    use_web_search: bool = False  # Enable Google Search for Revit API docs
    llm_provider: str = "gemini"
    llm_model: str = "gemini-2.0-flash-exp"
    llm_api_key_name: Optional[str] = None
    llm_api_key_value: Optional[str] = None


class GenerateScriptResponse(BaseModel):
    generated_code: str
    is_success: bool
    error_message: Optional[str] = None
    attempt_number: int


def extract_code_from_response(raw_response: str) -> str:
    """Extract C# code from LLM response (between ```csharp and ```)."""
    code_block_start = "```csharp"
    code_block_end = "```"
    
    start = raw_response.find(code_block_start)
    if start == -1:
        return ""
    
    start += len(code_block_start)
    end = raw_response.find(code_block_end, start)
    
    if end == -1:
        return ""
    
    code = raw_response[start:end].strip()
    return code


@router.post("/generate_script", response_model=GenerateScriptResponse)
async def generate_script(
    request: GenerateScriptRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Generates C# CoreScript code using the specified LLM.
    Supports retry logic with error context.
    """
    print(f"[Generation] Received request for task: {request.task_description[:50]}...")
    try:
        print(f"[Generation] Calling Gemini API with model: {request.llm_model}")
        # Generate code using Gemini (or other LLM)
        raw_response = await generate_code_with_gemini(
            task_description=request.task_description,
            previous_attempts=request.previous_attempts,
            use_web_search=request.use_web_search,
            llm_model=request.llm_model,
            llm_api_key_name=request.llm_api_key_name,
            llm_api_key_value=request.llm_api_key_value
        )
        
        print(f"[Generation] Received response from Gemini (length: {len(raw_response)})")
        
        # Extract code from response
        generated_code = extract_code_from_response(raw_response)
        
        if not generated_code:
            print("[Generation] Failed to extract code from response")
            return GenerateScriptResponse(
                generated_code="",
                is_success=False,
                error_message="Failed to extract code from LLM response.",
                attempt_number=1
            )
        
        print(f"[Generation] Successfully extracted code ({len(generated_code)} chars)")
        return GenerateScriptResponse(
            generated_code=generated_code,
            is_success=True,
            error_message=None,
            attempt_number=1
        )
    
    except Exception as e:
        print(f"[Generation] Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save_temp_script")
async def save_temp_script(request: Request):
    """
    Save generated code to a temporary file for VSCode editing.
    Returns the path to the saved file.
    """
    try:
        data = await request.json()
        script_code = data.get("script_code")
        requested_filename = data.get("filename")
        
        if not script_code:
            raise HTTPException(status_code=400, detail="No script code provided")
        
        # Use AppData directory instead of project directory
        app_data_dir = os.path.join(os.getenv('APPDATA'), 'paracore-data', 'generated-scripts')
        os.makedirs(app_data_dir, exist_ok=True)
        
        # Use provided filename or generate unique one
        if requested_filename:
            filename = requested_filename
            # Security check: ensure simple filename
            filename = os.path.basename(filename)
        else:
            timestamp = int(asyncio.get_event_loop().time() * 1000)
            filename = f"generated_script_{timestamp}.cs"
            
        temp_file_path = os.path.join(app_data_dir, filename)
        
        # Write the script code to the temp file
        with open(temp_file_path, 'w', encoding='utf-8') as f:
            f.write(script_code)
        
        print(f"[Generation] Saved temp script to: {temp_file_path}")
        
        return {
            "success": True,
            "path": temp_file_path,  # Return absolute path for edit-script endpoint
            "absolute_path": temp_file_path
        }
        
    except Exception as e:
        print(f"[Generation] Save temp script error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save_to_library")
async def save_to_library(request: Request):
    """
    Save generated script to Agent-Library with metadata.
    """
    try:
        data = await request.json()
        script_code = data.get("script_code")
        script_name = data.get("script_name")
        library_path = data.get("library_path")
        category = data.get("category")
        sub_category = data.get("sub_category", "")
        metadata = data.get("metadata", {})
        
        if not all([script_code, script_name, library_path, category]):
            raise HTTPException(status_code=400, detail="Missing required fields")
        
        # Ensure script name ends with .cs
        if not script_name.endswith('.cs'):
            script_name += '.cs'
        
        # Construct metadata header
        metadata_header = "/*\n"
        metadata_header += f"DocumentType: {metadata.get('documentType', 'Project')}\n"
        metadata_header += f"Categories: {metadata.get('categories', 'Architectural')}\n"
        metadata_header += f"Author: {metadata.get('author', 'Unknown')}\n"
        metadata_header += f"Dependencies: {metadata.get('dependencies', 'RevitAPI 2025, CoreScript.Engine, RServer.Addin')}\n"
        metadata_header += "\n"
        
        description = metadata.get('description', '')
        if description:
            metadata_header += "Description:\n"
            for line in description.split('\n'):
                metadata_header += f"{line}\n"
            metadata_header += "\n"
        
        usage_examples = metadata.get('usageExamples', [])
        if usage_examples:
            metadata_header += "UsageExamples:\n"
            for example in usage_examples:
                if example.strip():
                    metadata_header += f"- \"{example}\"\n"
        
        metadata_header += "*/\n\n"
        
        # Combine metadata and code
        full_script = metadata_header + script_code
        
        # Construct full path
        if sub_category:
            full_path = os.path.join(library_path, category, sub_category, script_name)
        else:
            full_path = os.path.join(library_path, category, script_name)
        
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        # Check if file exists
        if os.path.exists(full_path):
            raise HTTPException(status_code=409, detail=f"Script '{script_name}' already exists at this location")
        
        # Write the script
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(full_script)
        
        print(f"[Generation] Saved script to library: {full_path}")
        
        return {
            "success": True,
            "path": full_path,
            "message": f"Script '{script_name}' saved successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Generation] Save to library error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
