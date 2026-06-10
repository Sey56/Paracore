# Paracore vs. The Industry: BIM Automation Comparison

This document provides a technical and workflow comparison between **Paracore** and existing Revit automation methodologies.

---

## Capability Matrix

### Core Development Experience

| Capability | Dynamo | pyRevit | Traditional Add-in | **Paracore** |
| :--- | :---: | :---: | :---: | :---: |
| **Zero-compile execution** | ❌ | ✅ | ❌ | **✅** |
| **Full Revit API access** | Partial | ✅ | ✅ | **✅** |
| **Type safety + IntelliSense** | ❌ | ❌ | ✅ | **✅** |
| **Live VS Code sync** | ❌ | ❌ | ❌ | **✅** |
| **Hot-reload (edit → instant run)** | ❌ | Partial | ❌ | **✅** |
| **Modern C# (.NET 8 / C# 12)** | ❌ | ❌ | ✅ | **✅** |
| **Boilerplate requirements** | High | Low | Extreme | **Zero** |

### Interactive REPL

| Capability | Dynamo | pyRevit | Traditional Add-in | **Paracore** |
| :--- | :---: | :---: | :---: | :---: |
| **Interactive REPL console** | ❌ | ❌ | ❌ | **✅** |
| **Session persistence (variables survive across commands)** | ❌ | ❌ | ❌ | **✅** |
| **One-liner element queries** | ❌ | ❌ | ❌ | **✅** |
| **Fluent chaining (`.Where().Select().Table()`)** | ❌ | ❌ | ❌ | **✅** |
| **Instant data visualization from REPL** | ❌ | ❌ | ❌ | **✅** |
| **Explore Revit enums live (`Enum.GetNames(...).Table()`)** | ❌ | ❌ | ❌ | **✅** |

### Parameter Engine (Gallery Scripts)

| Capability | Dynamo | pyRevit | Traditional Add-in | **Paracore** |
| :--- | :---: | :---: | :---: | :---: |
| **Auto-generated UI from code properties** | ❌ | ❌ | ❌ | **✅** |
| **Slider generation (`[Range]` attribute)** | ❌ | ❌ | ❌ | **✅** |
| **Unit-aware inputs (`[Unit("mm")]`)** | ❌ | ❌ | ❌ | **✅** |
| **Revit enum dropdowns (auto-hydrated)** | ❌ | ❌ | ❌ | **✅** |
| **Material/Element picker from type properties** | ❌ | ❌ | ❌ | **✅** |
| **Editable parameters (change values, re-run)** | Data-Shapes | Manual WPF | Manual WPF | **✅ (Built-in)** |
| **Script metadata (author, category, description)** | ❌ | Partial | ❌ | **✅** |
| **Searchable categorized script gallery** | ❌ | Partial | ❌ | **✅** |

### Unit Intelligence

| Capability | Dynamo | pyRevit | Traditional Add-in | **Paracore** |
| :--- | :---: | :---: | :---: | :---: |
| **`.InputUnit("m")` → internal feet** | ❌ | ❌ | ❌ | **✅** |
| **`.OutputUnit("mm", 3)` → display-ready** | ❌ | ❌ | ❌ | **✅** |
| **Unit-aware comparisons (`.IsLessThan()`)** | ❌ | ❌ | ❌ | **✅** |
| **Automatic conversion in parameters** | ❌ | ❌ | ❌ | **✅** |

### Data & Analytics

| Capability | Dynamo | pyRevit | Traditional Add-in | **Paracore** |
| :--- | :---: | :---: | :---: | :---: |
| **Interactive data grid output (`.Table()`)** | ❌ | ❌ | Manual | **✅** |
| **Inline parameter editing from table** | ❌ | ❌ | ❌ | **✅** |
| **Search/filter within results** | ❌ | ❌ | ❌ | **✅** |
| **CSV export** | ❌ | ❌ | ❌ | **✅** |
| **Chart visualization** | ❌ | ❌ | ❌ | **✅** |
| **Sync-to-Model (edit → write back to Revit)** | ❌ | ❌ | ❌ | **✅** |

### Advanced / Enterprise

| Capability | Dynamo | pyRevit | Traditional Add-in | **Paracore** |
| :--- | :---: | :---: | :---: | :---: |
| **AI agent orchestration** | ❌ | ❌ | ❌ | **✅** |
| **Multi-file script projects** | ❌ | ✅ | ✅ | **✅** |
| **Protected binary tools (ship compiled)** | ❌ | ❌ | ✅ | **✅** |
| **Assembly caching (instant re-runs)** | ❌ | ❌ | N/A | **✅** |
| **Background watchdog monitoring (Sentinels)** | ❌ | ❌ | ❌ | **✅** |
| **Clash detection engine** | ❌ | ❌ | ❌ | **✅** |
| **MCP server (VS Code agent integration)** | ❌ | ❌ | ❌ | **✅** |

---

## Detailed Comparisons

### 1. The REPL Advantage

No other Revit tool offers an interactive C# REPL. In Paracore, you can type a single line and get immediate results:

```csharp
// One-liner: Get all walls on Level 1
GetElements<Wall>().WhereParam("Base Constraint", "Level 1").Table()
```

The REPL supports **session persistence** — variables, functions, and state survive across commands. This means you can build up complex queries iteratively:

```csharp
// Command 1: Store rooms
var rooms = GetElements<Room>().ToList()

// Command 2: Filter (rooms variable is still alive)
rooms.Where(r => r.GetNum("Area").IsGreaterThan(20.InputUnit("m2"))).Table()
```

In Dynamo, this requires rewiring nodes. In pyRevit, you restart the script. In an add-in, you recompile. In Paracore, you just type the next line.

### 2. The Parameter Engine (Gallery Scripts)

Paracore's zero-boilerplate UI generation is unmatched. A simple C# class:

```csharp
public class Params
{
    [Unit("m")] [Range(0.6, 1.5, 0.05)]
    public double Width { get; set; } = 0.9;

    [Unit("mm")] [Range(30, 60, 5)]
    public double Thickness { get; set; } = 45.0;

    public Material? LeafMaterial { get; set; }
}
```

Automatically generates:
- A **slider** for Width (0.6m to 1.5m, step 0.05)
- A **slider** for Thickness (30mm to 60mm, step 5)
- A **material picker dropdown** populated with all project materials

No WPF. No XAML. No Data-Shapes package. Just C# attributes → professional UI.

Users can **edit parameter values and re-run** the script instantly — the UI preserves state between executions.

### 3. Paracore vs. Dynamo (Visual Programming)

Dynamo is excellent for visual thinkers and geometric logic but becomes a "spaghetti" mess for complex data management or conditional branching.

Paracore offers the same accessibility for non-developers through its **Parameter Engine** but allows power users to write high-performance C# queries that are 10x more compact and readable than a 50-node Dynamo graph.

### 4. Paracore vs. pyRevit (Scripting)

pyRevit is the current king of Revit scripting, but it relies on Python (often IronPython), which lacks the type safety and modern language features of C# 12.

Paracore provides the same "scripting" speed but uses the native language of Revit (C#), offering full IntelliSense, type safety, and direct access to the latest .NET features without the Python wrapper overhead.

### 5. Paracore vs. Traditional Add-ins (DevOps)

Add-ins are the standard for professional tools, but the development loop (Build → Restart Revit → Test) is incredibly slow.

Paracore uses a custom **CoreScript.Engine** to execute raw C# code dynamically. You get the speed of a script with the performance and architectural integrity of a compiled DLL.

### 6. Unit Intelligence

Revit stores all data in internal units (feet/decimal feet). Most tools require the developer to manually calculate conversions.

Paracore introduces the `.InputUnit()` and `.OutputUnit()` extensions:

```csharp
// Instead of: 10 * 10.7639  (manual ft² conversion)
// Write:
rooms.Where(r => r.GetNum("Area").IsLessThan(10.InputUnit("m2")))

// Instead of: area / 10.7639  (manual reverse conversion)
// Write:
rm.GetNum("Area").OutputUnit("m2", 3)  // → "15.234"
```

### 7. Interactive Analytics vs. Console Prints

Most scripts output data to a log or a simple dialog. Paracore automatically pipes structured results into an **Interactive Table** with:

- **Search & filter** across all columns
- **Inline editing** — change a parameter value directly in the grid
- **Sync-to-Model** — edits are written back to the Revit model
- **CSV export** — filtered data exports with one click
- **Chart rendering** — automatic visualization of numeric data
