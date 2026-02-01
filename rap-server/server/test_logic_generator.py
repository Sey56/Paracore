import os
import sys

# Add the server directory to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__))))

from generation.generation_router import extract_code_from_response, extract_files_from_response


def test_code_extraction():
    print("[TEST] Testing AI Code Extraction Logic...")

    # Case 1: Standard Modular Output (with conversational text)
    raw_modular = """
    Sure! I have generated a modular script for you.
    
    File: Main.cs
    ```csharp
    public class Main { void Run() { Println("Hello"); } }
    ```
    
    And here is the parameters file:
    
    File: Params.cs
    ```csharp
    public class Params { public int Value { get; set; } }
    ```
    """
    files = extract_files_from_response(raw_modular)
    print(f"[DEBUG] Case 1 Found files: {list(files.keys())}")
    assert "Main.cs" in files, "Failed to extract Main.cs"
    assert "Params.cs" in files, f"Failed to extract Params.cs. Found: {list(files.keys())}"
    assert "Hello" in files["Main.cs"]
    print("[PASS] Case 1 (Modular with Talk)")

    # Case 2: Single Block Fallback (No headers)
    raw_single = """
    Here is your single file:
    ```csharp
    public class Single { }
    ```
    """
    code = extract_code_from_response(raw_single)
    assert "public class Single" in code, "Failed to extract single block fallback"
    print("[PASS] Case 2 (Single Fallback)")

    # Case 3: Mixed Formatting (System Prompt V3 style)
    raw_mixed = """
    Filename: GeometryUtils.cs
    This utility handles math.
    ```csharp
    public class Utils { }
    ```
    """
    files = extract_files_from_response(raw_mixed)
    assert "GeometryUtils.cs" in files, "Failed to handle 'Filename:' prefix"
    print("[PASS] Case 3 (Mixed Prefixes)")

    print("\n[SUCCESS] Logic Armor Intact. Extraction logic is regression-proof.")

if __name__ == "__main__":
    try:
        test_code_extraction()
    except AssertionError as e:
        print(f"[FAIL] REGRESSION DETECTED: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"[ERROR] Test execution failed: {e}")
        sys.exit(1)
