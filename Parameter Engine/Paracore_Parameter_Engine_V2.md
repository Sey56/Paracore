# Paracore Parameter Engine (V2)

The Paracore Parameter Engine (V2) is a **convention-based, zero-boilerplate** system. It generates rich UIs by inspecting your C# `Params` class, supporting native types, validation, and dynamic logic.

## 1. Core Structure & Basic Inputs
Every script defines a `Params` class. Public properties become UI inputs. The engine infers the UI control from the C# type.

### Text & Numbers

| C# Definition | UI Result |
| :--- | :--- |
| `public string AppName { get; set; }` | **Empty Text Box**. |
| `public string UserName { get; set; } = "Default";` | **Text Box** pre-filled with "Default". |
| `public int Count { get; set; }` | **Number input**, initially empty. |
| `public double Length { get; set; }` | **Number input** (allows decimals). |

### Sliders (Ranges)
Use `[Range]` to add a slider control alongside the number input.

```csharp
[Range(1, 10, 1)]
public int Counter { get; set; } = 5; 
// UI: A slider from 1 to 10 using step 1. 
// Default value is set to 5.
```

### Boolean
```csharp
public bool IsActive { get; set; } = true;
// UI: A Toggle Switch (On/Off). 
```

---

## 2. Dropdowns & Multi-Select (Options)
The engine distinguishes between **Single Selection** (Dropdown) and **Multi-Selection** (Checkboxes) based on the property type.

### Single Selection (Dropdown)
If the property is a `string`, it renders a dropdown. You provide the list of items via an `_Options` property.

```csharp
// UI: Dropdown with "UPPERCASE" selected by default.
public string CaseOption { get; set; } = "UPPERCASE";

// The list of choices for the dropdown
public List<string> CaseOption_Options => ["UPPERCASE", "lowercase", "Camel Case"];
```
*Note: This works for both static lists (like above) and dynamic Revit element collections.*

### Multi-Selection (Checkboxes)
If the property is a `List<string>`, it automatically renders a list of checkboxes. No extra attribute is needed.

```csharp
// UI: Checkbox list. "Revit" is checked by default.
public List<string> AppNames { get; set; } = ["Revit"];

// The full list of available checkboxes
public List<string> AppNames_Options => ["Revit", "Paracore", "Other"];
```
*Tip: To have multiple items selected by default, just include them in the initializer: `["Revit", "Paracore"]`.*


## 3. Custom Filtering (Revit API)
Sometimes you need more than just a static list. You can use the full power of the Revit API inside your `_Options` property to filter elements dynamically.

### Filtered Type Selection
Example: List only Wall Types that contain "Generic" in their name.

```csharp
public string WallTypeName { get; set; }

// Use Revit API logic using the global 'Doc' variable
public List<string> WallTypeName_Options => new FilteredElementCollector(Doc)
            .OfClass(typeof(WallType))
            .Cast<WallType>()
            .Select(wt => wt.Name)
            .Where(name => name.Contains("Generic"))
            .ToList();
```

### Instance Selection
Example: List names of unique Wall instances in the model.

```csharp
public string WallName { get; set; }

// Lists distinct names of all Wall instances
public List<string> WallName_Options => new FilteredElementCollector(Doc)
            .OfClass(typeof(Wall))
            .Cast<Wall>()
            .Select(w => w.Name)
            .Distinct()
            .ToList();
```

---


## 4. Magic Extraction ([RevitElements])
The `[RevitElements]` attribute automatically correctly populates the options for you without needing an `_Options` provider.

### Single Type Selection
```csharp
// UI: Dropdown listing all Wall Types in the project.
[RevitElements(TargetType = "WallType")]
public string SelectedWallType { get; set; }
```

### Multi-Type Selection
Simply change the type to `List<string>` to get checkboxes.

```csharp
// UI: Checkbox list of all Wall Types in the project.
[RevitElements(TargetType = "WallType")]
public List<string> WallTypes { get; set; }
```

### Magic vs. Custom
*   **Magic (`[RevitElements]`):** Use this when you want *all* elements of a given type/category.
*   **Custom (`_Options` / `_Filter`):** Use this when you need to filter the list (e.g., "only Walls that are external").

---

## 5. Native Revit Selection
Handle Revit geometry and element selection using the `[Select]` attribute.

| Attribute | UI Result | Returns |
| :--- | :--- | :--- |
| `[Select(SelectionType.Point)]` | **Pick Point** Button | `XYZ` |
| `[Select(SelectionType.Element)]` | **Select** Button | `long` (Element ID) or `List<long>` |
| `[Select(SelectionType.Face)]` | **Pick Face** Button | `Reference` |
| `[Select(SelectionType.Edge)]` | **Pick Edge** Button | `Reference` |

```csharp
[Select(SelectionType.Point)]
public XYZ Origin { get; set; } // Defaults to (0,0,0) if not picked
```

---

## 6. File System
Native OS dialogs for files/folders.

```csharp
[InputFile("csv,xlsx")] // UI: Browse File button (filters for csv/xlsx)
public string SourceFile { get; set; }

[FolderPath]            // UI: Browse Folder button
public string ExportDir { get; set; }

[OutputFile("json")]    // UI: Save File dialog
public string OutputPath { get; set; }
```

---

## 7. Logic & Validation

### Documentation (Tooltips)
Use standard C# XML comments `/// <summary>`. These appear as tooltips in the UI.

### Grouping
Wrap properties in `#region GroupName` ... `#endregion` to group them in the UI.

### Validation Attributes
*   `[Required]`: Input cannot be empty.
*   `[Pattern("regex")]`: Enforce format (e.g. only numbers).
*   `[Min(0)]`, `[Max(100)]`: Numeric bounds without a slider.

### Conditional UI
*   **`[EnabledWhen("ParamName", "Value")]`**: Disables the input unless the condition matches.
*   **`_Visible` Property**: return `true/false` based on other parameters to hide/show inputs entirely.

```csharp
public bool IsAdvanced { get; set; }

public string SecretCode { get; set; }
public bool SecretCode_Visible => IsAdvanced; // Hidden unless IsAdvanced is true
```
