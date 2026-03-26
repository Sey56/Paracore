# Paracore Data Accessors: The Definitive Guide

Paracore provides three highly specialized extension methods to extract parameter data from any Revit `Element`. Each has a specific architectural purpose depending on whether you are doing math, exporting data, or generating reports.

All methods accept a `string name` as their primary argument. This can be:
1. The exact name of a Revit Parameter (e.g., `"Area"`, `"Fire Rating"`)
2. A Built-In Parameter Enum name (e.g., `"ROOM_AREA"`)
3. A Native C# Property name via reflection (e.g., `"Width"`)

---

## 1. `GetNum` - The Math Engine
**Returns a `double`**. Used for calculations, math, or numeric threshold filtering.

| Method Signature | Core Behavior | Example | Output Type |
| :--- | :--- | :--- | :--- |
| **`GetNum(name)`** | Grabs the raw number directly from the database in **Revit Internal Units** (Decimal Feet / Square Feet). No conversions. | `rm.GetNum("Area")` | `107.639...` (double) |
| **`GetNum(name, unit)`** | Grabs the internal number, performs the math to convert it into your chosen unit, and returns the converted value. | `rm.GetNum("Area", "m2")` | `10.0` (double) |

### 💡 Pro Usage
Combine this with `IsLessThan()` to filter elements using human units while protecting against floating-point geometry noise:
```csharp
// "Find all rooms smaller than 10 square meters"
var threshold = 10.InputUnit("m2");
var smallRooms = GetElements<Room>().Where(rm => rm.GetNum("Area").IsLessThan(threshold));
```

---

## 2. `GetStr` - The Universal Text Converter
**Returns a `string`**. Used to extract purely readable text data, devoid of math logic or trailing unit suffixes.

| Method Signature | Core Behavior | Example | Output Type |
| :--- | :--- | :--- | :--- |
| **`GetStr(name)`** | Smart extraction. It resolves raw Element IDs into their actual Names (e.g., Level IDs become "Level 1"), and forces unknown numbers into a string. | `rm.GetStr("Level")` | `"Level 1"` (string) |
| **`GetStr(name, unit)`** | Internally calls `GetNum(unit)` to do the math conversion, rounds the result, and returns the raw number as a **Unitless Text String**. | `rm.GetStr("Area", "m2")` | `"10.00"` (string) |

### 💡 Pro Usage
Use this for clean **Data Export** (like CSV/Excel generation) where you want converted numbers without the `" m²"` text ruining the spreadsheet column math:
```csharp
// Exporting purely numeric strings for Excel
var data = GetElements<Room>().Select(rm => new { 
    Name = rm.GetStr("Name"),
    Area_m2 = rm.GetStr("Area", "m2") // Outputs "10.00", not "10.00 m²"
});
```

---

## 3. `GetVal` - The WYSIWYG Mirror (What You See Is What You Get)
**Returns a `string`**. Used to exactly mimic the formatted text displayed in the Revit Properties Palette.

| Method Signature | Core Behavior | Example | Output Type |
| :--- | :--- | :--- | :--- |
| **`GetVal(name)`** | Bypasses custom conversions and directly asks the Revit API: *"What exact text is displaying in the user's Properties Palette right now?"* | `rm.GetVal("Area")` | `"10.00 m²"` (string) |
| **`GetVal(name, unit)`** | Internally calls `GetNum(unit)` to do the math conversion, but strictly appends the **Unit Suffix** directly into the string. | `rm.GetVal("Volume", "m3")` | `"25.50 m³"` (string) |

### 💡 Pro Usage
Use this when you are writing **Log Files**, updating **Comments**, or generating reports for non-programmers where the metric must be clearly labeled inside the text string.
```csharp
// Generating human-readable reports
GetElements<Room>()
    .Select(rm => new { 
        Room = rm.GetStr("Number"), 
        Area = rm.GetVal("Area") 
    })
    .Table();
    
// Table Output:
// | Room | Area       |
// | 101  | 10.00 m²   |
// | 102  | 15.50 m²   |
```

---

## 🏛️ Summary Cheat Sheet

*   Need to do Math? 👉 **`GetNum`**
*   Need to export clean data to Excel? 👉 **`GetStr`**
*   Need the exact text users see in Revit UI? 👉 **`GetVal`**

---

## 🔍 Discovery Helpers

Paracore provides tools to help you discover what data is available on elements without leaving the REPL.

### `ReflectionProperties()`
**Returns a table**. Lists all direct C# properties available on the Revit class (e.g., exposing that `Room` has an `.Area` property, whereas `Wall` does not). This is your quick reference to avoid needing raw Reflection (`typeof(Room).GetProperties()`).

```csharp
// "Show me all native C# properties available for this wall"
Selection.First().ReflectionProperties().Table();
// Output: Table with columns 'Name' (e.g. Width) and 'Type' (e.g. Double)
```
