COPILOT_INSTRUCTIONS = """# Script Context: Paracore Tool Project
# All logic goes into the Scripts/ folder.
# Use #region GroupName directives to organize parameters.

## Architectural Mandates
- **Pure Logic**: Focus strictly on Revit API and C# logic. 
- **Parameter Mapping**: Use the `Params` class at the bottom of the file for all user-configurable inputs.
- **Implicit Imports**: Most standard Revit and System namespaces are already imported via GlobalUsings.
- **Output**: Use `Println()`, `Log()`, or `Table()` for reporting results to the Paracore UI.

## Pro-Tips
- Use `Doc` to access the current Revit Document.
- Use `UIDoc` to access the current UI Document.
- Leverage `FilteredElementCollector` for high-performance element discovery.
"""
