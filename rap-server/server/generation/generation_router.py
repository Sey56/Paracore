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

from grpc_client import (
    get_script_metadata,
    get_script_parameters,
    get_combined_script,
    create_and_open_workspace,
    compute_parameter_options
)
from utils import get_or_create_script, resolve_script_path, redact_secrets
from auth import get_current_user, CurrentUser
from generation.gemini_client import generate_code_with_gemini, explain_and_fix_with_gemini

router = APIRouter(prefix="/generation", tags=["Generation"])


class GenerateScriptRequest(BaseModel):
    task_description: str
    previous_attempts: Optional[List[Dict[str, str]]] = None  # List of {"code": ..., "error": ...}
    use_web_search: bool = False  # Enable Google Search for Revit API docs
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    llm_api_key_name: Optional[str] = None
    llm_api_key_value: Optional[str] = None
    multi_file: bool = False  # If True, LLM can generate multiple modular files


class GenerateScriptResponse(BaseModel):
    generated_code: str  # Still returns primary file/combined code for back-compat
    files: Optional[Dict[str, str]] = None  # Mapping of filename -> code content
    is_success: bool
    error_message: Optional[str] = None
    attempt_number: int


def extract_files_from_response(raw_response: str) -> Dict[str, str]:
    """
    Extract multiple C# code blocks from LLM response.
    Supports two patterns:
    1. External headers: File: Main.cs \n ```csharp ... ```
    2. Internal headers: ```csharp \n // File: Main.cs \n ... \n // File: Params.cs ... ```
    """
    files = {}
    
    # Pattern 1: External file-prefixed blocks (Markdown style)
    # "File: filename.cs" followed by "```csharp ... ```"
    file_pattern = r"(?:File|Filename):\s*([a-zA-Z0-9_\.]+\.cs)\s*[\r\n]+```csharp[\r\n]+(.*?)\s*```"
    matches = list(re.finditer(file_pattern, raw_response, re.DOTALL | re.IGNORECASE))
    
    for match in matches:
        filename = match.group(1)
        code = match.group(2).strip()
        files[filename] = code
        
    # Pattern 2: Internal headers (Single block containing multiple files)
    if not files:
        # Find all csharp blocks
        raw_blocks = re.findall(r"```csharp[\r\n]+(.*?)\s*```", raw_response, re.DOTALL)
        for block in raw_blocks:
            # Look for "// File: name.cs" markers inside this block
            # We split the block by these markers
            segments = re.split(r"//\s*(?:File|Filename):\s*([a-zA-Z0-9_\.]+\.cs)", block, flags=re.IGNORECASE)
            
            # segments[0] is everything before the first marker (often empty or generic header)
            # segments[1] is filename1, segments[2] is code1, etc.
            if len(segments) > 1:
                for i in range(1, len(segments), 2):
                    fname = segments[i].strip()
                    fcode = segments[i+1].strip()
                    files[fname] = fcode
            elif not files:
                # Fallback: No markers found inside the first block, treat as Main.cs or single file
                files["Main.cs"] = block.strip()
                
    return files


def extract_code_from_response(raw_response: str) -> str:
    """Extract primary C# code from LLM response (between ```csharp and ```)."""
    files = extract_files_from_response(raw_response)
    if "Main.cs" in files:
        return files["Main.cs"]
    if files:
        return next(iter(files.values()))
    return ""


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
            llm_api_key_value=request.llm_api_key_value,
            multi_file=request.multi_file
        )
        
        print(f"[Generation] Received response from Gemini (length: {len(raw_response)})")
        
        # Extract code from response
        generated_code = extract_code_from_response(raw_response)
        
        # Extract multiple files from response
        files = extract_files_from_response(raw_response)
        primary_code = extract_code_from_response(raw_response)
        
        if not primary_code:
            print("[Generation] Failed to extract any code from response")
            return GenerateScriptResponse(
                generated_code="",
                is_success=False,
                error_message="Failed to extract code from LLM response.",
                attempt_number=1
            )
        
        print(f"[Generation] Successfully extracted {len(files)} files")
        return GenerateScriptResponse(
            generated_code=primary_code,
            files=files if len(files) > 1 else None,
            is_success=True,
            error_message=None,
            attempt_number=1
        )
    
    except Exception as e:
        error_msg = redact_secrets(str(e))
        print(f"[Generation] Error: {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)


from utils import get_or_create_script, resolve_script_path, redact_secrets
from auth import get_current_user, CurrentUser
from generation.gemini_client import generate_code_with_gemini, explain_and_fix_with_gemini
from workspace_manager import get_scripts_dir
import glob

router = APIRouter(prefix="/generation", tags=["Generation"])


class GenerateScriptRequest(BaseModel):
    task_description: str
# ... (existing GenerateScriptRequest parts) ...

# ... (existing functions) ...

class ExplainErrorRequest(BaseModel):
    error_message: str
    script_code: Optional[str] = None
    script_path: Optional[str] = None
    type: Optional[str] = None
    files: Optional[Dict[str, str]] = None
    context: Optional[Dict[str, str]] = None
    llm_provider: Optional[str] = None
    llm_model: Optional[str] = None
    llm_api_key_name: Optional[str] = None
    llm_api_key_value: Optional[str] = None


class ExplainErrorResponse(BaseModel):
    explanation: str
    fixed_code: Optional[str] = None
    files: Optional[Dict[str, str]] = None
    filename: Optional[str] = None
    is_success: bool
    error_message: Optional[str] = None


@router.post("/explain_error", response_model=ExplainErrorResponse)
async def explain_error(
    request: ExplainErrorRequest,
    current_user: CurrentUser = Depends(get_current_user)
):
    """
    Analyzes a failed script run, explains why it failed, and provides a fix.
    Supports both single-file and multi-file contexts.
    Prioritizes loading files from the Active Workspace if available.
    """
    error_summary = request.error_message[:100] + "..." if len(request.error_message) > 100 else request.error_message
    print(f"[Generation] Received error explanation request for: {error_summary}")
    
    try:
        # 1. Determine Files to Analyze
        files_to_process = request.files or {}
        
        # If files not provided explicitly, try to load from disk/workspace
        if not files_to_process and request.script_path:
            try:
                target_dir = get_scripts_dir(request.script_path, request.type)
                print(f"[Generation] Loading script context from: {target_dir}")
                
                if os.path.exists(target_dir):
                    if os.path.isfile(target_dir): # Single file case
                         with open(target_dir, 'r', encoding='utf-8-sig') as f:
                             files_to_process[os.path.basename(target_dir)] = f.read()
                    else: # Directory case
                        for file_path in glob.glob(os.path.join(target_dir, "*.cs")):
                            with open(file_path, 'r', encoding='utf-8-sig') as f:
                                files_to_process[os.path.basename(file_path)] = f.read()
            except Exception as load_err:
                print(f"[Generation] Warning: Failed to load files from disk: {load_err}")

        # 2. Construct Combined Content
        script_content_to_send = ""
        
        if files_to_process:
            print(f"[Generation] Processing multi-file explanation request ({len(files_to_process)} files)")
            combined_parts = []
            for fname, code in files_to_process.items():
                combined_parts.append(f"// File: {fname}\n{code}")
            script_content_to_send = "\n\n".join(combined_parts)
        elif request.script_code:
            # Fallback to provided single string
            script_content_to_send = request.script_code
        else:
            raise HTTPException(status_code=400, detail="No script content or valid path provided for analysis.")
            
        # Determine if multi-file mode should be active
        is_multi_file = request.type == 'multi-file' or len(files_to_process) > 1

        raw_response = await explain_and_fix_with_gemini(
            script_code=script_content_to_send,
            error_message=request.error_message,
            context=request.context,
            multi_file=is_multi_file,
            llm_model=request.llm_model,
            llm_api_key_name=request.llm_api_key_name,
            llm_api_key_value=request.llm_api_key_value
        )
        
        # Extract fixed code (Primary)
        fixed_code = extract_code_from_response(raw_response)
        
        # Extract multiple files if present
        fixed_files = extract_files_from_response(raw_response)
        
        # Extract filename if present (// File: filename.cs) from the primary block
        filename = None
        if fixed_code:
            filename_match = re.search(r"//\s*(?:File|Filename):\s*([a-zA-Z0-9_\.]+\.cs)", fixed_code, re.IGNORECASE)
            if filename_match:
                filename = filename_match.group(1)
        
        # Clean up the explanation (remove the code block from the text)
        explanation = re.sub(r"```csharp.*?```", "", raw_response, flags=re.DOTALL).strip()
        
        return ExplainErrorResponse(
            explanation=explanation,
            fixed_code=fixed_code if fixed_code else None,
            files=fixed_files if len(fixed_files) > 0 else None,
            filename=filename,
            is_success=True
        )
        
    except Exception as e:
        error_msg = redact_secrets(str(e))
        print(f"[Generation] Explain error error: {error_msg}")
        return ExplainErrorResponse(
            explanation="Failed to generate explanation.",
            is_success=False,
            error_message=error_msg
        )


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
    Save generated script to a specific target directory.
    Supports both legacy (category-based) and new (direct path) saving.
    """
    try:
        data = await request.json()
        script_code = data.get("script_code")
        script_name = data.get("script_name")
        
        # New mode: Direct target directory
        target_directory = data.get("target_directory")
        
        # Legacy mode inputs
        library_path = data.get("library_path")
        category = data.get("category")
        sub_category = data.get("sub_category", "")
        metadata = data.get("metadata", {})
        files = data.get("files") # For multi-file support
        
        if not script_code or not script_name:
            raise HTTPException(status_code=400, detail="Missing script code or name")
        
        # Ensure script name ends with .cs
        if not script_name.endswith('.cs'):
            script_name += '.cs'
            
        if target_directory:
            # New Simple Mode: Save directly to target folder
            
            if files:
                # Multi-file Mode: Save all files in the dict
                print(f"[Generation] Saving multi-file script ({len(files)} files) to: {target_directory}")
                for filename, code in files.items():
                    # If this is the main file, use the user-provided script_name
                    final_filename = filename
                    if filename.lower() == 'main.cs':
                        final_filename = script_name
                    
                    file_path = os.path.join(target_directory, final_filename)
                    os.makedirs(os.path.dirname(file_path), exist_ok=True)
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(code)
                
                full_path = target_directory # Return folder path for success message
                
            else:
                # Single-file Mode
                full_path = os.path.join(target_directory, script_name)
                # Ensure directory exists (might be deep path)
                os.makedirs(os.path.dirname(full_path), exist_ok=True)
                
                with open(full_path, 'w', encoding='utf-8') as f:
                    f.write(script_code)
            
            return {
                "success": True,
                "path": full_path,
                "message": f"Script saved successfully"
            }
        elif library_path and category:
            # Legacy Mode: Construct path from category hierarchy
            # Only used if old frontend calls this or fallback
            
            # Construct metadata header (Keep for legacy compatibility if needed)
            metadata_header = "/*\n"
            metadata_header += f"DocumentType: {metadata.get('documentType', 'Project')}\n"
            metadata_header += f"Categories: {metadata.get('categories', 'Architectural')}\n"
            metadata_header += f"Author: {metadata.get('author', 'Unknown')}\n"
            metadata_header += f"Dependencies: {metadata.get('dependencies', 'RevitAPI 2025, CoreScript.Engine, Paracore.Addin')}\n"
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
            
            full_script = metadata_header + script_code
            
            if sub_category:
                full_path = os.path.join(library_path, category, sub_category, script_name)
            else:
                full_path = os.path.join(library_path, category, script_name)
        else:
            raise HTTPException(status_code=400, detail="Missing target directory or library configuration")
        
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        
        # Check if file exists
        if os.path.exists(full_path):
            raise HTTPException(status_code=409, detail=f"Script '{script_name}' already exists at this location")
        
        # Write the script
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(full_script)
        
        print(f"[Generation] Saved script to: {full_path}")
        
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
