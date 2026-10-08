# PROJECT_SPEC.md — paracore

## 0. ⚠⚠ READ THE MASTER SPEC FIRST

This repo is **one project in the Paracore ecosystem**. It is **not self-contained**, and it is
**not** the top authority.

Before changing anything here, read:

```
C:\Users\seyou\Paracore\paracore-ecosystem\MASTER_SYSTEM_SPEC.md
```

It lives **outside every project repo** — in the `paracore-ecosystem` repo, a **sibling** of this
one. The sections that bind this repo: **§3** (the artifact authority table — *edit HERE, nowhere
else*) and **§4** (the change classes).

⚠ **If that file is not present, STOP and ask for it. Do not infer the cross-project rules.**
⚠ This is a **pointer, not a copy** — the master's rules are deliberately not repeated here. A rule
in N places must be changed in N places, and a stale duplicate is worse than a missing file.

---

## 1. What this project is

The **generic engine + add-in library**, and the Paracore desktop app.

⚠ **It is a LIBRARY.** Other projects reference *it*; it references none of them. The dependency
arrow never points inward. A capability added here for one consumer's benefit is a design error.

## 2. Where things live

| Artifact | Path |
|---|---|
| Engine — script surface, geometry, packs | `CoreScript.Engine/` |
| Add-in host — ribbon, load contexts | `Paracore.Addin/` |
| Shim — dependency-free Revit entry point | `Paracore.Shim/` |
| Sidecar server | `Paracore.Server/` |
| Desktop app | `rap-web/` |
| Build | `build-addin.ps1` → `installers/` |

## 3. Invariants — this project must not break these

- ⚠ The engine and add-in are **ALWAYS free and generic**. A **PACK** is the Pro/free unit, and a
  pack lives in its own tool's repo — never here.
- ⚠ **Never edit engine source after the user installed it — not even a comment.** The install gate
  compares mtimes, and a rebuilt DLL differs by the baked git revision alone (SourceLink).
- ⚠ A pack **cannot add members to `ScriptApi`** — a `partial class` cannot span assemblies. A pack
  announces its own script-facing type via `ScriptSurface.AddStaticImport`, and the engine appends
  one `using static` to every script it compiles.
- ⚠ A pack's dependency is **HOST-PROVIDED**. The pack compiles against it with
  `ExcludeAssets="runtime"`; **this repo publishes it** (`CopyLocalLockFileAssemblies=true`) into the
  one folder both load paths probe first. See the master spec's HOST-PROVIDED DEPENDENCIES section.
- ⚠ `Packs/{IParacorePack,PackCatalog,PackLoader}.cs`, `Globals/ScriptSurface.cs` and
  `Globals/RibbonSurface.cs` exist **only in this repo** — no other tree has them.

## 4. Not here

- No takeoff rules, no specialist tooling, no pricing data. Those belong to the tool that owns them.
- ⚠ Nothing in this file is private. Keep it that way: this repo may be public.
