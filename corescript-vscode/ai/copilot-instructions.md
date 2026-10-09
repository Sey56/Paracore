# Paracore — VS Code scripting workspace

You are writing **C# scripts that execute inside a live Revit document** through the Paracore
engine. The user runs the current script with **`Ctrl+Shift+R`** (*CoreScript: Run in Revit*); the
Paracore add-in must be running in Revit with its **Server** toggle ON. Output appears in the VS Code
**"CoreScript"** output channel.

⚠ **This is NOT a gallery/tool project.** There is **no parameter UI, no gallery card, no packaging
step**. The code you write *is* the tool, and it runs the moment it is sent — so **every value must
be correct in the source itself**. There is no dialog between authoring and execution.

## The rule that is never wrong

**① Paracore extension methods → ② LINQ → ③ the raw Revit API, and only then.**

Never write `FilteredElementCollector`, `get_Parameter`, `LookupParameter`, or `.AsString()` —
`GetElements<T>()`, `GetStr`/`GetNum`/`SetVal` already do those jobs. If you find yourself reaching
for `FilteredElementCollector`, stop.

## Skill — read it before writing API calls

| Skill | Read it when |
|---|---|
| **`paracore-engine`** | Before writing any element query, parameter read/write, unit conversion, or Revit UI call. Carries the complete extension-method reference. |

The script contract (structure, units, transactions, banned patterns) lives in
`.github/instructions/scripts.instructions.md` and is applied automatically to `Scripts/**/*.cs`.

## Layout

```
<workspace>/
  <workspace>.csproj                ← references (do not edit)
  global.json                       ← SDK pin (do not edit)
  Globals.cs                        ← global usings, for IntelliSense only — NEVER executed
  .editorconfig
  .github/copilot-instructions.md   ← this file
  .github/instructions/             ← the script contract (auto-applied)
  .github/skills/                   ← paracore-engine
  Scripts/
    Main.cs                         ← THE entry file — top-level statements
    <YourType>.cs                   ← OPTIONAL — user-defined TYPES only
```

## Structure

- **Top-level statements only.** No `namespace`, no `class Program`, no `static void Main()`.
- **Exactly ONE file may contain top-level statements: `Scripts/Main.cs`.** The engine throws
  *"Only one script file can contain top-level statements."* if a second one does.
- **Every other `.cs` file in `Scripts/` declares TYPES ONLY** — `class`, `record`, `struct`,
  `interface`, `enum`, or extension methods.
- **Definitions go at the bottom.** Order: `① top-level logic → ② top-level helper methods →
  ③ class/struct/interface definitions`.
- The engine sends `Main.cs` **plus every file it references** — a helper type is only compiled if
  `Main.cs` (or another included file) actually uses it, so **reference your helpers from `Main.cs`**.
- `Globals.cs` is **never sent to Revit** — it exists purely so VS Code shows IntelliSense for the
  engine globals. Never put logic there.
- If the task is small, keep everything in `Main.cs`.

## No `Params` class

There is no editable-parameter UI in this flow, so **do not create a `Params` class** and do not use
`[Unit]` / `[Range]` / `[Confirm]` attributes. Put constants directly in the code, next to where they
are used.

## Debugging

- Output (including `Println`) and errors stream to the **"CoreScript"** output channel.
- A compile error returns the compiler message with mapped line numbers — fix `Main.cs` and re-run.
- If the run reports it cannot connect, Revit is closed or the Paracore **Server** toggle is OFF.
- To inspect the model, `Table(...)`, `el.CombinedParams().Table()`, `GetMagicNames()` and
  `GetCategories()` answer "what is actually here?" without guessing.
