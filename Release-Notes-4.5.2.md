# v4.5.2 — .NET Runtime Resilience

Fixes a crash that could occur after Windows Update patches the .NET 8
shared framework.

**The error:**
```
Could not find file 'C:\Program Files\dotnet\shared\Microsoft.NETCore.App\8.0.27\System.Linq.dll'.
```

**Why it happened:**
Windows Update sometimes bumps the .NET runtime to a newer patch version
(e.g. 8.0.27 → 8.0.28) and removes the old folder during cleanup. When
Paracore tried to reference `System.Linq.dll` (and other framework
assemblies), it used the path that was reported when the assembly was
first loaded — which no longer existed. This caused all script execution
to fail, even for simple queries.

**How we solved it:**
`ScriptCompiler.cs` and `ReplSessionManager.cs` now check that the file
actually exists before referencing it. If the old path is gone, they
fall back to `Assembly.Load()` which resolves to the current runtime.
If both fail, the reference is skipped gracefully — Roslyn can still
compile LINQ code through `System.Runtime`.

**Also:**
- MCP server installer now uses `restartreplace` to handle locked files
  during reinstall

No user action needed — just reinstall the addin.
