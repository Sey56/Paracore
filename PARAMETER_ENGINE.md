# Paracore Parameter Engine (V2)

The Paracore Parameter Engine (V2) is designed to be **"Zero Boilerplate"**. It automatically inspects your C# `Params` class, infers UI controls from types and naming conventions, and handles complex Revit object conversions (like `XYZ` and `Reference`) behind the scenes.

## 1. Native Revit Types (Enhanced in V2)
The engine natively supports Revit API types. You no longer need to parse strings manually.

### Points (XYZ)
Automatically renders a "Pick Point" button in the UI. The engine injects a ready-to-use `Autodesk.Revit.DB.XYZ` object.

```csharp
[Select(SelectionType.Point)]
public XYZ StartPoint { get; set; } 

// Usage in script:
// double x = p.StartPoint.X;
```

### Edges & Faces (Reference)
Automatically renders a "Pick Edge" or "Pick Face" button. The engine manages the stable representation string and injects a valid `Autodesk.Revit.DB.Reference` object.

```csharp
[Select(SelectionType.Edge)]
public Reference MyEdge { get; set; }

[Select(SelectionType.Face)]
public Reference MyFace { get; set; }

// Usage in script:
// Element e = Doc.GetElement(p.MyEdge);
// GeometryObject geo = e.GetGeometryObjectFromReference(p.MyEdge);
```

### Elements (IDs)
Select elements by ID using an `int` or `long`.

```csharp
[Select(SelectionType.Element)]
public int SelectedWallId { get; set; }

// Usage:
// Element e = Doc.GetElement(new ElementId(p.SelectedWallId));
```

---

## 2. Standard Data Types
The engine infers UI controls from standard C# types.

| C# Type | UI Control | Notes |
| :--- | :--- | :--- |
| `string` | Text Box | |
| `int`, `double` | Number Box | |
| `bool` | Checkbox | |
| `List<string>` | Multi-Select | Renders a list of checkboxes. |

---

## 3. Validation & UI Attributes
Customize the UI and enforce constraints using standard C# attributes.

### Selection
```csharp
[Select(SelectionType.Point)]   // XYZ
[Select(SelectionType.Element)] // int/long
[Select(SelectionType.Edge)]    // Reference
[Select(SelectionType.Face)]    // Reference
```

### Ranges & Sliders
Render a slider for numeric inputs.
```csharp
[Range(0, 100)]         // Min 0, Max 100
[Range(0, 100, 5)]      // Min 0, Max 100, Step 5
public int Percentage { get; set; }

// Alternatives:
[Min(0)]
[Max(100)]
public double Value { get; set; }
```

### Units & Auto-Conversion
The engine handles unit conversion automatically. If you suffix your parameter name or use the `[Unit]` attribute, the UI displays the value in that unit, but the script receives the value converted to **Revit Internal Units (feet)**.

**Supported Units:** `mm`, `cm`, `m`, `ft`, `in`, `sqft`, `sqm`, `cuft`, `cum`.

```csharp
// User enters "100" in UI (labeled "mm") -> Script receives 0.328... (feet)
public double Length_mm { get; set; } 

// Explicit Attribute
[Unit("m2")]
public double Area { get; set; }
```

### File System
Trigger native OS file dialogs.
```csharp
[InputFile("csv,txt")] // Open File
public string CsvPath { get; set; }

[InputFolder]          // Select Folder
public string ExportDir { get; set; }

[SaveFile("json")]     // Save File
public string OutputPath { get; set; }
```

### Logic & Visibility
Control when parameters are visible or enabled based on other parameter values.
```csharp
public bool UseAdvanced { get; set; }

// Only visible if UseAdvanced == true
[EnabledWhen(nameof(UseAdvanced), true)] 
public string AdvancedOption { get; set; }
```

### Metadata
```csharp
[Description("This is a tooltip description.")]
[Required] // Marks input with a red asterisk
public string Name { get; set; }
```

---

## 4. Dynamic Providers (Convention-based)
You can provide dynamic options or logic by defining extra properties/methods following a naming convention (`{ParameterName}_{Suffix}`).

### Options Provider (`_Options`)
Populate a dropdown list dynamically.
```csharp
public string Category { get; set; }

// Automatically detected as options for 'Category'
public List<string> Category_Options => new List<string> { "Walls", "Doors", "Windows" };
```

### Visibility Provider (`_Visible`)
Dynamic visibility logic (complex logic supported).
```csharp
public bool IsVisible => true;

public string ExtraParam { get; set; }
public bool ExtraParam_Visible => IsVisible; // Complex logic allowed here
```

---

## 5. Legacy Support
The `[ScriptParameter]` attribute is still supported for backward compatibility but is **not recommended** for new scripts. It allows defining all properties in a single attribute but is verbose and error-prone.

```csharp
// Legacy Style (Deprecated)
[ScriptParameter(Description = "Old style", Min = 0, Max = 10)]
public int OldParam { get; set; }
```

---

## 6. Best Practices & Troubleshooting

### Region & Directive Isolation (Critical)
When using `#region` and `#endregion` to group parameters, **always leave an empty line** between the directive and your parameter properties.

**❌ BAD (Causes CS1040 Errors):**
The engine may accidentally pull the directive onto the same line when injecting values.
```csharp
#region Dimensions
public double Width { get; set; }
#endregion 
```

**✅ GOOD:**
Separating them ensures the engine modifies the property without touching the directive.
```csharp
#region Dimensions

public double Width { get; set; }

#endregion
```

### Type Handling
*   **Points:** Always use `XYZ` for coordinates. Do not use `string`.
*   **References:** Use `Reference` for edges/faces. The engine handles the parsing for you.