# Paracore V3 Parameter System

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
V3 uses attributes to define how data is fetched and grouped.

### `[RevitElements]` (Auto-Extraction)
Use this when you want Paracore to **automatically** collect elements from the model for you.
*   **TargetType**: The Revit Class name (e.g., "WallType", "Level", "View").
*   **Category**: Optional. Required for generic types like "FamilySymbol" (e.g., `Category = "Doors"`).
*   **UI Icon**: Parameters with this attribute show a Revit-specific icon.

> [!IMPORTANT]
> **Rooms/Categories**: "Room" is a **Category**, not a Class. You cannot use `TargetType = "Room"`. For Rooms (and other categories), you must use the `_Options` convention with `OfCategory(BuiltInCategory.OST_Rooms)` as shown in the examples below.

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
Paracore uses a naming convention (`ParameterName_Suffix`) to attach dynamic logic to your parameters.

### Universal Compute Inference 🪄
**Any parameter** (regardless of attribute) will automatically trigger a **"Compute"** button in the UI if its provider relies on logic that must run in the Revit context.
*   **With Compute**: Methods (`_Options()`) or Logic Properties (`_Range => (0, GetMax(), 1)`).
*   **No Compute**: Static Fields or Literal Properties (`_Options = ["A", "B"]`).

### Convention List
| Suffix | Purpose | Return Type | Support |
| :--- | :--- | :--- | :--- |
| `_Options` | Populates a Dropdown/Multi-select | `List<string>` or `string[]` | Method, Property, Field |
| `_Filter` | Similar to Options, used inside `[RevitElements]` for refinement | `List<string>` | Method, Property, Field |
| `_Range` | Defines Min/Max/Step dynamically | `(double, double, double)` | Method, Property (Tuple) |
| `_Visible` | Controls UI visibility | `bool` | Method, Property |
| `_Enabled` | Controls UI read-only state | `bool` | Method, Property |

### Provider Examples 💡

#### 1. Method vs Property (Both work!)
**Property (Preferred for concise logic):**
```csharp
public List<string> ViewNames_Options => new FilteredElementCollector(Doc)
    .OfClass(typeof(View))
    .Select(v => v.Name)
    .ToList();
```

**Method (Preferred for complex logic):**
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

#### 2. Concise Room Selection (Expression Body `=>`)
For simple queries that don't require error handling or complex logic.
```csharp
[RevitElements(Group = "Selection")]
public string RoomName { get; set; }

public List<string> RoomName_Options => new FilteredElementCollector(Doc)
    .OfCategory(BuiltInCategory.OST_Rooms)
    .WhereElementIsNotElementType()
    .Cast<Room>()
    .Where(r => r.Area > 0)
    .Select(r => r.Name)
    .ToList();
```

#### 2. Dynamic Range (`_Range`)
Control numeric sliders **dynamically** based on the current model context (e.g., Level counts, wall heights, or unit settings).
*   **Return Type**: `(double min, double max, double step)`
*   **Behavior**: Because this property uses logic (e.g., queries `Doc`), Paracore automatically adds a **[Compute]** button. Clicking it runs your logic and updates the slider bounds in real-time.

```csharp
[ScriptParameter("Wall Height Limit"), Suffix("m")]
public double MaxHeight { get; set; } = 3.0;

// The convention {ParameterName}_Range
public (double, double, double) MaxHeight_Range 
{
    get 
    {
        // Example: Set max height to the highest level in the project
        double maxLevel = new FilteredElementCollector(Doc)
            .OfClass(typeof(Level))
            .Cast<Level>()
            .Max(l => l.Elevation);
            
        // Return (Min=0, Max=HighestLevel, Step=0.5)
        return (0.0, maxLevel, 0.5);
    }
}
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
```

---

## 4. Advanced Dynamic Options
You can write complex logic inside your providers. Paracore executes this code on the Revit thread, giving you full access to `Doc` and `App`.

### Custom Error Bubbling ⚠️
If your logic fails (e.g., no elements found), `throw` a descriptive exception. Paracore will catch this and display it as a styled notification in the UI.

```csharp
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
```

---

## 5. Modern C# Syntax Support
The extraction engine is robust and supports all modern initializers:
*   **Collection Expressions**: `public List<string> Tags { get; set; } = ["A", "B"];`
*   **Implicit New**: `public List<string> Options => new() { "X", "Y" };`
*   **Target-typed New**: `public string[] Modes = new[] { "Fast", "Slow" };`
*   **Property Getters**: `public List<string> Opts { get { return ["A"]; } }`

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
