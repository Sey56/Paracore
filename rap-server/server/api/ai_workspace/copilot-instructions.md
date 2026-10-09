# Paracore — gallery tool project

This workspace is a **Paracore gallery tool**. The script in `Scripts/` runs inside a live Revit
document through the Paracore engine (`CoreScript.Engine`). The Paracore desktop app shows this
folder as a card in its gallery; the `.csproj` and `Globals.cs` are scaffolding and must not be
edited.

## The rule that is never wrong

**① Paracore extension methods → ② LINQ → ③ the raw Revit API, and only then.**

Never write `FilteredElementCollector`, `get_Parameter`, `LookupParameter`, or `.AsString()` —
`GetElements<T>()`, `GetStr`/`GetNum`/`SetVal` already do those jobs. If you find yourself reaching
for `FilteredElementCollector`, stop.

## Skills — read the one that matches the task

| Skill | Read it when |
|---|---|
| **`paracore-engine`** | Before writing any element query, parameter read/write, unit conversion, or Revit UI call. Carries the complete extension-method reference. |
| **`paracore-tool`** | When this script should be a **configurable tool** — i.e. it gets a `Params` class so the user can set values in the gallery before the run. |

The script contract (structure, units, transactions, banned patterns) lives in
`.github/instructions/scripts.instructions.md` and is applied automatically to `Scripts/**/*.cs`.

## Two kinds of script — both valid

**① A plain script** — top-level statements only, **no `Params` class**. Correct for a query, an
audit, a one-shot fix, anything REPL-like. Do **not** add a `Params` class merely because "scripts
have one".

**② A TOOL** — the same top-level statements, **plus a `public class Params` at the bottom**. Each
public property becomes an editable control in the gallery, and the user sets the values **before**
the script runs. Add it only when the script has values a user should choose (a level, a threshold,
a family type). Read the `paracore-tool` skill before writing one.

## Layout

```
<workspace>/
  <Name>.csproj                     ← references (do not edit)
  <Name>.sln                        ← (do not edit)
  Globals.cs                        ← global usings, for IntelliSense only — never executed
  .github/copilot-instructions.md   ← this file
  .github/instructions/             ← the script contract (auto-applied)
  .github/skills/                   ← paracore-engine, paracore-tool
  Scripts/
    <Name>.cs                       ← THE entry file — top-level statements
    <YourType>.cs                   ← OPTIONAL — user-defined TYPES only
```

## Structure

- **Top-level statements only.** No `namespace`, no `class Program`, no `static void Main()`.
- **Exactly ONE file may contain top-level statements.** Every other `.cs` file in `Scripts/`
  declares **types only** — `class`, `record`, `struct`, `interface`, `enum`, or extension methods.
- **Definitions go at the bottom.** Order: `① top-level logic → ② top-level helper methods →
  ③ classes` (the `Params` class, if present, is **last**).
- A helper type is only compiled if something references it — reference your helpers from the entry
  file.

## Editing this workspace

The desktop app watches this folder: **parameter changes you make here appear live in the gallery
configurator**. Adding, removing or renaming a `Params` property adds, removes or renames the
corresponding control. Keep the file compiling — a broken script shows as broken in the app.
