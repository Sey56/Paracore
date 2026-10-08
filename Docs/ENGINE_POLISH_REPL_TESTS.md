# Engine Polish — REPL checks after rebuild

Run these **after** rebuilding and reinstalling the engine. They cover the two changes that
actually alter behaviour (the rest are renames and file moves, which the compiler already proves).

Paste each block into the REPL (or the VS Code script host). The point of each check is stated
next to it — a number that matches is the proof.

---

## A. R3 — `.Table()` element adaptation (the extracted shared helper)

`ScriptApi.Table(elements)` and the `.Table()` extension now call ONE implementation
(`Output.AdaptElementsForTable`). Both used to have their own copy.

**A1 — the extension path, instance elements.**
Expect a table whose columns are `Id | Family | Type | Category`.

```csharp
GetElements("Walls").Take(5).Table();
```

**A2 — the extension path, TYPE elements.**
This is the branch that matters: for an `ElementType` the column *values* come from
`Family Name` / `Type Name`, not `Family` / `Type`.
Expect `Family` and `Type` columns to be **populated**, not blank.

```csharp
GetElements("WallTypes").Take(5).Table();
```

**A3 — the static overload (the other call site).**
Expect the **same** table as A1 for the same input — same columns, same values.

```csharp
Table(GetElements("Walls").Take(5));
```

> ⚠ A1 vs A3 is the actual regression test. Both used to build the table independently; if the
> extraction was wrong, one of them will differ or throw.

**A4 — empty collection.**
Expect **no** table rendered (not an empty table, not an error), and no exception.

```csharp
GetElements("Walls").Where(w => false).Table();
```

**A5 — non-element data still renders as-is** (the `else` branch, must be untouched).

```csharp
GetElements("Walls").GroupByParam("Base Constraint", "Length", "m").Table();
```

---

## B. P-5 — `ToNotebook` no longer shares one data file

It used to write a **fixed** `%APPDATA%\paracore-data\notebooks\scratch\data.json`, so every
notebook read the same file and an older notebook silently loaded the newest data.

**B1 — two notebooks, two data files.**
Run both, then list the folder. Expect **two** data files, `Alpha_data.json` and `Beta_data.json`
— not a single `data.json`.

```csharp
GetElements("Walls").Take(3).ToNotebook("Alpha");
GetElements("Rooms").Take(3).ToNotebook("Beta");
```

```csharp
System.IO.Directory.GetFiles(
    System.IO.Path.Combine(
        System.Environment.GetFolderPath(System.Environment.SpecialFolder.ApplicationData),
        "paracore-data", "notebooks", "scratch"))
```

**B2 — the path is sanitized.** A name with a path-illegal character must not throw and must not
escape the scratch directory. Expect a file named `Bad_Name_data.json` (the `:` replaced by `_`).

```csharp
GetElements("Walls").Take(3).ToNotebook("Bad:Name");
```

---

## C. Chart API — the rename (compile-level, so a quick smoke test is enough)

**C1 — the surviving names work.**

```csharp
GetElements("Rooms").GroupByParam("Level", "Area", "m2").BarGraph();
GetElements("Doors").GroupByParam("Level").PieGraph();
GetElements("Walls").GroupByParam("Base Constraint", "Length", "m").LineGraph();
```

**C2 — the retired names must fail to compile.** This is the *expected* result, not a defect.
⚠ The error **code depends on the call form** — both prove the rename landed, so do not read one as
a different outcome from the other:

| call form | error |
| :--- | :--- |
| bare name — `BarChart(...)` | `CS0103: The name 'BarChart' does not exist in the current context` |
| extension form — `collection.BarChart()` | `CS1061: 'IEnumerable<object>' does not contain a definition for 'BarChart'` |

```csharp
BarChart(new[] { new { name = "a", value = 1 } });                     // → CS0103
GetElements("Rooms").GroupByParam("Level", "Area", "m2").BarChart();   // → CS1061
```

---

## What a PASS looks like

| Check | Pass condition |
| :--- | :--- |
| A1 / A3 | identical tables for identical input |
| A2 | `Family` + `Type` columns populated on a type collection |
| A4 | nothing rendered, no exception |
| A5 | grouped data renders unchanged |
| B1 | two files: `Alpha_data.json`, `Beta_data.json` |
| B2 | `Bad_Name_data.json`, no exception |
| C1 | three charts render |
| C2 | `CS0103` on `BarChart` — **expected** |

⚠ The D16–D24 finishing gate (`verify_build_contains.py`) and the cross-repo isolation check are
**static** and were already run green before this install — they do not need repeating here, but
`Docs/TAKEOFF_SPEC.md` remains the authority on any takeoff number.
