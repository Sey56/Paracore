# v4.5.2 — .NET Runtime Resilience

Fixes a crash that could occur after Windows Update patches the .NET 8
shared framework. Script execution would fail with "Could not find file
System.Linq.dll" if the old runtime folder was cleaned up.

**What changed:**
- Assembly references now survive missing framework DLLs — falls back to
  the current runtime instead of crashing
- MCP server installer now uses `restartreplace` to handle locked files
  during reinstall

No user action needed — just reinstall the addin.
