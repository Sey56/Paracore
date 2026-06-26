"""
Canonical AI instructions for generating Paracore gallery scripts.
SOURCE OF TRUTH: copilot-instructions.md in the paracore repo root.
This module reads from the canonical file at import time (dev) or falls
back to an inline default (production bundles).
"""
import os

_instructions_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", "copilot-instructions.md")
_instructions_path = os.path.normpath(_instructions_path)

try:
    with open(_instructions_path, "r", encoding="utf-8") as f:
        COPILOT_INSTRUCTIONS = f.read()
except FileNotFoundError:
    # Fallback for production deployments where the md file isn't present
    COPILOT_INSTRUCTIONS = """# Script Context: Paracore Tool Project
# All logic goes into the Scripts/ folder.
# ...

Generate C# Revit API scripts for the Paracore runtime (CoreScript.Engine).
See docs/copilot-instructions.md for the full canonical content.
"""
