# Paracore Parameter System V3 - Complete Reference

## 1. Discovery Architecture
The V3 system uses **Implicit Discovery** based on a specific class structure.

### The `Params` Class
All parameters must be defined as `public` properties within a class named `Params`.
```csharp
public class Params 
{
    public string ProjectName { get; set; } = "Default Name";
}
```

---

## 2. Parameter Documentation (Tooltips)
Descriptions for the UI are extracted directly from your C# comments.

### Simple (Tagless)
```csharp
/// The name of your project
public string ProjectName { get; set; }
```

### XML Documentation (Standard)
```csharp
/// <summary>
/// The name of your project
/// </summary>
public string ProjectName { get; set; }
```

---

## 3. Data Types & UI Components
The engine infers the UI control based on the C# property type.

| C# Type | UI Control | Inference |
| :--- | :--- | :--- |
| `string` | Text Box | Default |
| `int`, `double` | Number Input | Default |
| `bool` | Checkbox (Toggle) | Default |
| `List<string>` | Multi-Select Checkboxes | Automatic MultiSelect |

---

## 4. Attributes (Explicit Metadata)
Use attributes to add constraints or specialized behavior.

### General Attributes
*   `[Required]`: Marks the parameter as mandatory in the UI.
*   `[Range(min, max, step)]`: Turns a number into a slider.
*   `[ScriptParameter(Group = "X")]`: Organizes the parameter into a UI group.
*   `[ScriptParameter(InputType = "File")]`: Adds a Browse button (Supports `File`, `Folder`, `SaveFile`).

### Revit Selection
*   `[RevitElements(TargetType = "WallType")]`: Automatically populates a dropdown with elements of that type.
*   `[RevitElements(Category = "Doors")]`: Filters elements by category.

---

## 5. Convention-Based Providers (Advanced Logic)
To keep the `Params` class clean, metadata providers use a naming convention (`PropertyName_Suffix`).

| Suffix | Purpose | Expected Type |
| :--- | :--- | :--- |
| `_Options` | Dynamic list of items | `string[]` or `List<string>` |
| `_Range` | Dynamic min/max | `(double, double)` or `(double, double, double)` |
| `_Visible` | Visibility logic | `bool` (Expression body `=>`) |
| `_Enabled` | Read-only logic | `bool` (Expression body `=>`) |

### Example: Dynamic Visibility
```csharp
public string Mode { get; set; } = "Simple";
public static string[] Mode_Options => ["Simple", "Advanced"];

public string AdvancedKey { get; set; }
public bool AdvancedKey_Visible => Mode == "Advanced";
```

---

## 6. Smart Compute Inference
*   **Static Providers**: If `_Options` is a **Property**, the data is extracted once at discovery. No "Fetch" button is shown.
*   **Dynamic Providers**: If `_Options` is a **Method**, the engine assumes it needs Revit access. A **"Fetch" (Search)** button is automatically shown in the UI.

```csharp
// No Fetch button (Static)
public static string[] Colors_Options => ["Red", "Blue"];

// Fetch button shown (Dynamic Revit Collection)
public List<string> ViewNames_Options() => new FilteredElementCollector(Doc)...ToList();
```

---

## 7. Best Practices
1.  **Use Properties**: Always use `public Type Name { get; set; }`.
2.  **Initialize Defaults**: Use `= "value";` to provide helpful starting points.
3.  **Group Everything**: Use `[ScriptParameter(Group = "...")]` for a professional UI layout.
4.  **Tagless is Faster**: Use `/// Description` for cleaner, more readable script files.
