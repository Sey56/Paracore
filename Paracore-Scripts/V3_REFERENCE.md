# Paracore V3 Parameter System - The Ultimate Guide

The V3 Parameter System is a convention-over-configuration architecture designed for high-performance Revit automation. It minimizes boilerplate and puts all control into the `Params` class.

---

## 1. Core Architecture
Every script must follow this strict internal structure:
1.  **Imports**: Standard `using` statements at the top.
2.  **Metadata Block**: Optional `[ScriptMetadata]` block for the gallery.
3.  **Global Logic**: Your script's sequential logic. Instantiate with `var p = new Params();`.
4.  **Helper Methods**: Any private methods used by your logic.
5.  **`class Params`**: **Must be at the BOTTOM of the file.**

---

## 2. Choosing Your Attribute
V3 uses attributes to define how data is fetched and grouped, not necessarily how it's computed.

### `[RevitElements]` (Auto-Extraction)
Use this when you want Paracore to **automatically** collect elements from the model for you.
*   **TargetType**: The Revit Class name (e.g., "WallType", "Level", "View").
*   **Category**: Optional. Required for generic types like "FamilySymbol" (e.g., `Category = "Doors"`).
*   **UI Icon**: Parameters with this attribute show a Revit-specific icon.

```csharp
[RevitElements(TargetType = "WallType", Group = "Elements")]
public string SelectedWallType { get; set; }
```

### `[ScriptParameter]` (Manual/Logic-Based)
Use this for inputs that you define manually or through custom logic. It is the default for strings, numbers, and booleans.

```csharp
[ScriptParameter(Group = "Settings")]
public double OffsetDistance { get; set; } = 150.0;
```

---

## 3. Dynamic Providers (The "Magic" Convention)
Paracore uses a naming convention (`ParameterName_Suffix`) to attach logic to your parameters.

### Universal Compute Inference 🪄
**Any parameter** (regardless of attribute) will automatically trigger a **"Compute"** button in the UI if its provider contains logic:
*   A **Method**: `public List<string> MyParam_Options() { ... }`
*   A **Property with a body**: `public List<string> MyParam_Options => ...`

> [!TIP]
> Use static initializers (e.g., `public List<string> X_Options = ["A", "B"];`) for simple lists that don't need a Compute button.

### Convention List
| Suffix | Purpose | Return Type |
| :--- | :--- | :--- |
| `_Options` | Populates a Dropdown/Multi-select | `List<string>` or `string[]` |
| `_Filter` | Similar to Options, used inside `[RevitElements]` for refinement | `List<string>` |
| `_Range` | Defines Min/Max/Step dynamically | `(double? min, double? max, double? step)` |
| `_Visible` | Controls UI visibility | `bool` |
| `_Enabled` | Controls UI read-only state | `bool` |

### Provider Examples 💡

#### 1. Method vs Property (Both work!)
**Property (Preferred for concise logic):**
```csharp
public List<string> ViewNames_Options => new FilteredElementCollector(Doc)
    .OfClass(typeof(View))
    .Select(v => v.Name)
    .ToList();
```

**Method (Preferred for complex logic or standard C# style):**
```csharp
public List<string> ViewNames_Options()
{
    var views = new FilteredElementCollector(Doc)
        .OfClass(typeof(View))
        .Cast<View>()
        .Where(v => !v.IsTemplate)
        .ToList();
        
    return views.Select(v => v.Name).ToList();
}
```

#### 2. Dynamic Range (`_Range`)
Control sliders based on document units or other logic.
```csharp
[ScriptParameter, Suffix("mm")]
public double WallHeight { get; set; }

// Returns (min, max, step)
public (double, double, double) WallHeight_Range => (100, 5000, 10);
```

#### 3. Conditional UI (`_Visible` / `_Enabled`)
Create reactive interfaces that change based on user input.
```csharp
[ScriptParameter(Group = "Mode")]
public bool IsManualMode { get; set; } = false;

[ScriptParameter(Group = "Mode")]
public string ManualOverrideText { get; set; }

// Only show the text box if Manual Mode is checked
public bool ManualOverrideText_Visible => IsManualMode;

// Or keep it visible but disabled (grayed out)
// public bool ManualOverrideText_Enabled => IsManualMode;
```


---

## 4. Advanced Dynamic Options
You can write complex logic inside your providers. Paracore executes this code on the Revit thread, giving you full access to `Doc` and `App`.

### Custom Error Bubbling ⚠️
If your logic fails (e.g., no elements found), `throw` a descriptive exception. Paracore will catch this and display it as a styled notification in the UI.

```csharp
public List<string> RoomName_Options
{
    get
    {
        var rooms = new FilteredElementCollector(Doc)
            .OfCategory(BuiltInCategory.OST_Rooms)
            .Cast<Room>()
            .ToList();

        if (!rooms.Any()) 
            throw new Exception("❌ No Rooms found in this document! Please place some rooms first.");

        return rooms.Select(r => r.Name).OrderBy(n => n).ToList();
    }
}
```

---

## 5. Modern C# Syntax Support
The extraction engine is robust and supports all modern initializers:
*   **Collection Expressions**: `public List<string> Tags { get; set; } = ["A", "B"];`
*   **Implicit New**: `public List<string> Options => new() { "X", "Y" };`
*   **Target-typed New**: `public string[] Modes = new[] { "Fast", "Slow" };`

---

## 6. Type Mapping
| C# Type | UI Component |
| :--- | :--- |
| `string` | Text Box |
| `int` / `double` | Numeric Spinner |
| `[Range]` + Numeric | Slider |
| `bool` | Switch / Toggle |
| `DateTime` | Date Picker |
| `List<string>` | Multi-Select Checkboxes |
| `Enum` | Dropdown |

---

## 7. Best Practices
1.  **XML Summaries**: Use `/// <summary>` on your properties to provide help text in the UI.
2.  **Grouping**: Always use `Group = "..."` to keep the UI organized.
3.  **No Magic Numbers**: If a value can change, make it a `[ScriptParameter]`.
4.  **Transaction Boundary**: Keep your logic sequential. The engine handles the transaction at the end.
