# C# Scripting Guide for Paracore

## Metadata Formatting (CRITICAL)
The Paracore Engine's metadata extractor has specific requirements for where you place the metadata block (`/* ... */`). Following these rules ensures your script appears correctly in the gallery.

### Rule 1: Imports First (Recommended)
If your script uses `using` statements (almost all do), you **MUST** place them at the very top of the file, followed by at least one blank line, *before* the metadata block.

**✅ Correct Pattern:**
```csharp
using Autodesk.Revit.DB;
using System.Linq;

/*
DocumentType: Project
Categories: Architectural, Prototyping
Author: Your Name
Dependencies: RevitAPI 2025
Description:
Your description here.
*/

// Script logic starts here...
Print("Hello World");
```

**❌ Incorrect Pattern (Will Fail):**
```csharp
/*
DocumentType: Project
Description: This block will be stripped by the parser because it precedes the 'using' statements!
*/
using Autodesk.Revit.DB;
```

### Rule 2: No Imports
If your script has zero `using` statements, you can place the metadata block anywhere.

---

## Best Practices
- **Spacing**: Always leave a blank line between your imports and the metadata block.
- **Keys**: Ensure your metadata keys (e.g., `DocumentType:`, `Description:`) are capitalized correctly and followed by a colon.
- **Description**: Can be multi-line.
