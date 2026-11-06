# Paracore v4.8.3

**Windows x64 · one .NET 8 payload · Revit 2025, 2026 & 2027**

The release that adds Revit 2027, and closes the holes an agent could walk a script through.

One `net8.0-windows` payload, still compiled against the Revit 2025 API, now runs in **Revit 2025,
2026 and 2027**. Revit 2027 hosts .NET 10, and .NET 10 loads .NET 8 assemblies — so **no retarget
was needed**. The 2027 work was a loader fix and an installer fix, not a framework migration. The
parked .NET 10 migration plan stays a historical record.

Release with **Paracore-Gen v2.1.2**. Install both together.

> **Supersedes the published v4.8.2 (2026-10-29).** Everything in
> [v4.8.2](Release-Notes-4.8.2.md) is included here. ⚠ v4.8.2 is already a **published GitHub
> release** — the 2027 work landed after that tag, so it is **not** part of 4.8.2 and must not be
> shipped under that number. This note covers the 21 commits since the tag.

## Highlights

- **Revit 2027 works.** One installer, three registry-detected checkboxes (2025 / 2026 / 2027). Verified live: `GetElements("Rooms")` returned a six-room pipeline, and the gallery `NewDemo/MassEdit` script changed room numbers in the 2027 sample file.
- **A script cannot ask the machine for capabilities it was never given.** Dangerous constructs are refused at compile time, and file access is confined to one workspace.
- **The shared MCP core is no longer inside the free engine repo.** It lives in its own MIT repo, and each frozen MCP exe now carries the identity of the core and the hash of its own source.
- **Desktop sign-in moved to the Cloudflare Worker.** Railway is gone.
- **`ElementId.IntegerValue` is gone from every live runtime source.** Revit 2027 removed `get_IntegerValue()`; `.Value` is the API on 2025, 2026 and 2027.

## Revit 2027 — what actually had to change

### The all-users `.addin` path moved

In 2027, all-users manifests must be installed to `C:\Program Files\Autodesk\Revit\Addins\2027`,
**not** `C:\ProgramData\Autodesk\Revit\Addins\2027`. Revit 2027's own journal said so outright:

> `Add-in manifest file from: C:\ProgramData\Autodesk\Revit\Addins\2027\Paracore.Addin.addin, won't be loaded. All-users Add-in manifest files must be installed to: C:\Program Files\Autodesk\Revit\Addins\2027`

That was verified against Autodesk's own 2027 *Add-in Registration* developer guide before the
installer was touched. The installer targets the new path for **2027 only**; 2025 and 2026 keep
`{commonappdata}`. A build-time regression gate now fails if any 2027 `[Files]` row still targets
`{commonappdata}`, and fails unless exactly two rows target `{commonpf64}` — an empty or partial
scan is a failure.

### A second engine could be loaded into `Default`

On .NET 10 a host resolver can answer `Default.Resolving` before Roslyn's interactive loader,
loading a second `CoreScript.Engine.dll` into the default `AssemblyLoadContext`.
`ExecutionGlobals.Current` is an `AsyncLocal` static — **statics are per-ALC** — so the duplicated
engine saw `null` and threw *"Script context is not available"*.

`Paracore.Shim` now installs a one-name `Default.Resolving` guard and promotes it to the **front**
of the handler chain, using the public event accessors and preserving every existing host handler
and its relative order. The guard serves `CoreScript.Engine` from the `ParacoreIsolated` bubble, so
the script binds to the engine that owns the context. **Isolation stays on for every Revit
version** — dropping the bubble would reintroduce the `Microsoft.CodeAnalysis` collisions the shim
exists to prevent.

### `ElementId.IntegerValue` was removed

Four surviving reads in `CoreScript.Engine` (`GetStr`, `GetNum`, `_describeElement`) made
`NewDemo/MassEdit` fail in 2027 with *"Method not found: `Int32
Autodesk.Revit.DB.ElementId.get_IntegerValue()`"* — even though the gallery script itself had **no**
`.IntegerValue` text, because the failing reference was inside the compiled engine DLL. All are now
`.Value` (a `long`). The new `no-integervalue` gate scans 186 live C# files across seven roots,
fails on an empty or partial scan, and has a `--prove-teeth` mode.

### One installer, one payload

`paracore-addin.iss` now declares `Revit2025`, `Revit2026` and `Revit2027` tasks, each shown only
when `IsRevitVersionInstalled('<year>')` finds that Revit in the registry. The build compares the
SHA256 of the shim it just built against the shim copied into the publish folder, so an old
`Paracore.Shim.dll` cannot silently ship. The ASP.NET Core runtime preflight accepts **8.x, 9.x or
10.x** instead of only 8.x.

## Security and correctness

- **Compile-time capability refusal.** `ScriptSandbox` and `ScriptApi.Files` confine machine access to one workspace; the script cannot name capabilities it was not granted.
- **The add-in's instance-form scan bypasses are closed**, and a refused script no longer hands out the recipe it was refused for.
- **A `SOURCE_HASH` per MCP repo** is baked into each frozen exe, so the exe check can detect edits to its own `.py` sources that a core pin and asset checks are blind to. Only **tracked** `.py` files are hashed.
- **The JWT public key has a tracked home** and is asserted.
- **Nested categories resolve**, and a parameter-options result no longer certifies a zero that never happened.
- **Duplicate `TxReport` output on success is silenced.**
- **Revit Addins folders are ACL-hardened**, the one layer that covers every manifest channel.

## Other changes since v4.8.2

- Desktop sign-in moved to the Cloudflare Worker (`AUTH_SERVER_URL` defaults to `https://rap-auth.seyoumhgs.workers.dev`); Python `urllib` sends an explicit `User-Agent` because Cloudflare Bot Fight Mode blocks the default.
- The shared MCP core moved out of the free engine repo; the engine is generic and neutral — a **pack** is how a tool adds to it.
- Two gates that could report a green they could not have known were fixed; one now refuses to claim it compared a server's own source.
- `ScriptApi.Files` added to the generated `EXTENSION_METHODS.md` surface.
- `Verify-Release.ps1` repaired: it was BOM-less with a non-ASCII character inside a string (a PowerShell 5.1 parse trap), its UI-version check could never pass, its contact anchor had rotted, and it printed "STOP!" while exiting 0. It now proves the UI version is **derived** from `package.json`, exits 1 on failure, and builds the frontend.
- The go-to-market assessment and the next ninety days are recorded in `Docs/GTM_ASSESSMENT_2026-11-02.md`.

## Versioning

`paracore` versions as **one unit**: engine, Revit add-in, desktop app and VS Code extension all
carry `4.8.3`. `scripts/Set-Version.ps1` is the only writer of that number; `build-addin.ps1` and
`build-frontend.ps1` call it before building. The sibling MCPs version independently —
`paracore-gen` ships **2.1.2** in this release; `paracore-model`, `-family`, `-forge` and
`-takeoff` stay at **2.0.0**.

## Verification

| check | result |
|---|---|
| `Set-Version.ps1 -Check` (16 surfaces) | all at 4.8.3 |
| `Verify-Release.ps1` (incl. frontend build) | READY FOR RELEASE |
| live Revit 2027 · `GetElements("Rooms")` | 6-room pipeline |
| live Revit 2027 · gallery `MassEdit` | room numbers changed in the 2027 sample |
| live Revit 2025 · same REPL script | ran against the active 2025 project |
| `no-integervalue` gate | 186 files scanned, zero hits · teeth proven |

⚠ With two Revit versions open at once, the desktop connection follows whichever Revit is active.
If you then close that instance, the connection goes stale until the Paracore server is toggled
off/on in the remaining Revit. This is a connection-lifecycle behaviour, not a 2027 defect.

**Requirements:** Revit 2025, 2026 or 2027 · Windows x64 · .NET 8 Desktop Runtime (Revit 2027
supplies its own .NET 10 host) · ASP.NET Core runtime 8.x, 9.x or 10.x.
