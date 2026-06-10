# v4.5.2 — Patch Release: .NET Runtime Resilience

This is a targeted patch for one specific scenario. If you are on v4.5.1
and everything is working fine, there is no urgency to upgrade.

**When this matters:**
Windows occasionally updates the .NET 8 runtime in the background
without any notification. After such an update, the old runtime folder
(e.g. `8.0.27`) gets cleaned up, and Paracore can no longer find
framework assemblies like `System.Linq.dll`. The result:

```
Could not find file 'C:\Program Files\dotnet\shared\Microsoft.NETCore.App\8.0.27\System.Linq.dll'.
```

Every script, every REPL command, every MCP tool call — all fail with
this error. The user did nothing wrong; Windows just swapped the
runtime out from under a running process.

**What changed:**
`ScriptCompiler.cs` and `ReplSessionManager.cs` now verify that the
assembly file actually exists on disk before referencing it. If the
path is stale (old runtime folder removed), they fall back to
`Assembly.Load()` which resolves to the currently installed runtime.
If both fail, the reference is skipped — Roslyn can still compile
LINQ code through the core framework.

**Also:**
- MCP server installer now uses `restartreplace` to handle cases where
  `paracore-mcp.exe` is locked by a running client during reinstall

**Should you upgrade?**
- If you hit the `System.Linq.dll` error → yes, install this patch
- If v4.5.1 is running fine → no rush, this is purely defensive
