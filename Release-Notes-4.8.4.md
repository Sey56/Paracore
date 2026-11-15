# Paracore v4.8.4

**Windows x64 · one .NET 8 payload · Revit 2025, 2026 & 2027**

An accuracy and reliability release. Numbers are exact unless you ask for rounding, a wrong
parameter name tells you instead of silently returning zero, the desktop app no longer needs the
network to draw its icons and text, and an AI-driven gallery run no longer leaves a Revit dialog
unanswered.

> **Supersedes the published v4.8.3 (2026-11-06).** Everything in
> [v4.8.3](https://github.com/Sey56/Paracore/blob/main/Release-Notes-4.8.3.md) is included here,
> including Revit 2027 support. This note covers everything since that tag.

> ⚠ **Two changes affect existing scripts.**
>
> 1. Reading a parameter name that the element's **category does not declare** now **raises**
>    with that category's real parameter names, instead of returning `0` or `""`. Code loaded
>    from a **pack assembly** is exempt — packs ship their own fallbacks and legitimately probe
>    names whose absence is normal.
> 2. **Nothing rounds unless you ask.** Every value accessor that takes `decimals` now defaults
>    to `-1` = exact. `FormatUnit(...)`, `FormatValueOnly(...)`, `RoundTo(...)`, `GetStr(...)`,
>    `GetVal(...)` and their type-level twins no longer round to 2 decimal places behind the
>    caller's back, and `GroupByParam` totals are exact too. Pass `decimals` when you want a
>    rounded value. Scripts that relied on 2-dp output will show more digits.

## Download — one page, four installers

Everything ships on **this release page**. There is no second download location.

| Installer | What it installs | Version |
|---|---|---|
| `Paracore_4.8.4_x64.msi` | Paracore desktop app | 4.8.4 |
| `Paracore_Addin_v4.8.4.exe` | Revit add-in (2025 / 2026 / 2027) | 4.8.4 |
| `corescript-4.8.4.vsix` | VS Code extension | 4.8.4 |
| `Paracore-Gen-v2.1.3.exe` | Paracore-Gen MCP server | 2.1.3 |

The **desktop app** and the **Revit add-in** are the two Paracore components — install both. The
VS Code extension and Paracore-Gen are optional: the extension lets you write C# in VS Code and run
it in Revit; Paracore-Gen generates REPL scripts for an AI assistant and runs them in Revit —
there is no separate run step. Paracore-Gen's own `v2.1.3` tag carries a pointer release with no
assets, so this page stays the single place to download.

## Highlights

- **Exact quantities.** One rounding rule across the engine: nothing rounds unless you pass
  `decimals`. Grouped totals are exact too. A measured 95.2417 m² no longer prints as 95.242 by
  accident.
- **A wrong parameter name is an error, not a zero.** The message names the category's real
  parameters. Pack assemblies keep their own fallbacks, so takeoff exports are unaffected.
- **The desktop app works fully offline for its UI.** Inter is replaced by a self-hosted font and
  FontAwesome by Lucide SVG glyphs; one consistent radius/size scale, reduced-motion support and
  better behaviour at 125–150% Windows scaling.
- **AI gallery runs no longer hang on a Revit dialog.** The `ExecuteScript` path now opens the
  dialog-watcher gate, backed by a new release gate that proves the anchors bite.
- **Paracore-Gen inherits** the shared core's fixes: bulk-write advisories only when the receiver
  really is a collection, no lost dialog notes, separate handling of blocking modals vs persistent
  `Doc.GetWarnings()`, and a helpful hint when the sandbox refuses `GetType().Name`.
- **Public-repo cleanup.** READMEs rewritten, private product names removed, 13 internal
  plan/audit documents deleted. No runtime effect.

## What changed

### Engine / scripting API — breaking

- A parameter name the category does not declare raises with the category's parameter list instead
  of returning `0`/`""` (`_throwIfCategoryLacksParameter`, `_declaredNamesForCategory`). The raise
  is suppressed for code loaded from a pack assembly (`_callerIsPackCode`).
- **One rounding rule**: every `decimals`-taking accessor defaults to `-1` (exact).
  `FormatUnit`, `FormatValueOnly`, `RoundTo`, `GetStr`, `GetVal`, the type-level twins and
  `GroupByParam` totals no longer round implicitly; the palette `GetVal(name)` / `GetStr(name)`
  overloads gained a `decimals` argument. New `_unitToken(ForgeTypeId)` maps a Revit unit to a
  helper token and returns `null` for units it cannot convert exactly, rather than printing a
  converted-looking wrong number.
- `BuiltInCategory` is matched **exactly** in `ParameterOptionsComputer`'s category filter.
- Five parameter attributes in `ValidationAttributes.cs` that the extractor never read are gone.
- `EXTENSION_METHODS.md`, its four shipped mirrors, `REPL_GUIDE.md` and the bundled engine skill
  are regenerated from the new source.

### Gates and tooling

- `execute_script` resolves the dialog watcher through `sys.modules` (never a second copy by path,
  which would own a different `_call_depth`) and wraps the stub call in `revit_call()` when a
  watcher is resident. The desktop `rap-server` / manual Gallery path imports no watcher and stays
  operator-driven. Measured 2026-11-11: a "Highlighted floors overlap" dialog previously stayed up
  through a whole `preview_tool` run because Forge calls `ExecuteScript`, not `ExecuteRepl`.
- New `scripts/check-warning-awareness.py`: 8 subjects, 39 anchors, 3 `create_server` consumers,
  takeoff explicitly excluded, **an empty scan fails**, and `--prove-teeth` proves the anchors bite.
- `scripts/check-installed-addin.py` gained a `_unitToken` anchor, so an installed 4.8.3 engine
  cannot pass the symbol check while reporting numbers the 4.8.4 source no longer produces. The
  earlier anchors were retargeted, not deleted.
- Bundled AI skill examples switched to C# collection expressions.

### Desktop app

81 files. `Icon.tsx` is a compatibility wrapper: call sites keep `<FontAwesomeIcon icon={faBolt}
spin />` but render a Lucide stroke glyph sized in `em`, so `text-*` utilities work and explicit
`w-*`/`h-*` still win; `iconAliases.ts` maps the old `fa*` names. `main.tsx` imports the
self-hosted `@fontsource-variable/geist` and `index.html` drops the three Google Fonts links —
**no network dependency for the UI**. `globals.css` declares one radius scale, one selection
colour, an em-based icon base rule, a `prefers-reduced-motion` opt-out, and tighter panel padding
below 1280px for 125–150% Windows scaling. Per-call-site arbitrary sizes, blurs, glows and
tracking values collapse onto those tokens.

### Public-repo documentation

The README now says what Paracore is and how to install it, and describes Paracore-Gen as code
generation rather than a tool menu. Private product names were removed from public docs. Thirteen
internal plan/audit documents (modularisation, .NET 10 migration, GTM assessment, UI audit, etc.)
were deleted from the public repo. `PROJECT_SPEC.md`, `DEVELOPMENT.md`, `REPL_GUIDE.md` and the
4.8.1 notes were adjusted. **None of this changes runtime behaviour.**

## Versioning

`paracore` versions as **one unit**: engine, Revit add-in, desktop app and VS Code extension all
carry `4.8.4`. `scripts/Set-Version.ps1` is the only writer of that number; the build scripts read
it before building. Paracore-Gen ships **2.1.3** in the same release and versions independently.
`paracore-mcp-core` is a library, not an installer — it is bundled into the gen exe and is not
installed on its own.

## Verification

These rows are measured on the **source tree** before the build. Nothing here is a claim about the
installed 4.8.4 build; installer and live-Revit rows are measured after the install and appear in
the published release body.

| check | result |
|---|---|
| `Set-Version.ps1 -Check` (16 surfaces) | all at 4.8.4 |
| `paracore-gen/Set-Version.ps1 -Check` | all at 2.1.3 |
| `python .repl/gate.py` | PASS — 23 auto green, 1 known-red F5 (`workspace-map`), 16 manual not run |
| `npx tsc -b` / `npx tsc --noEmit` (`rap-web/`) | exit 0, zero diagnostics |
| `scripts/gen-engine-docs.py --check` | 12/12 targets up to date |
| `git diff --check` (all three repos) | clean |
| `EXTENSION_METHODS.md` / `REPL_GUIDE.md` paracore ↔ gen | byte-identical |

⚠ The `workspace-map` gate (F5) is a **pre-existing known-red** about the private workspace map,
not about a shipped artifact. It was open in v4.8.3 too. Ten of its twelve rows were corrected for
this release; the remaining two are private repos deliberately not pushed in a public release.

**Requirements:** Revit 2025, 2026 or 2027 · Windows x64 · .NET 8 Desktop Runtime (Revit 2027
supplies its own .NET 10 host) · ASP.NET Core runtime 8.x, 9.x or 10.x.
