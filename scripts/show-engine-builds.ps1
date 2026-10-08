# show-engine-builds.ps1 - "which CoreScript.Engine is where, and is it current?"
#
# WHY: there are TWO build loops and they write DIFFERENT binaries into the SAME addin folder:
#   inner/dev : dotnet build -c Debug   -> bin\Debug\net8.0-windows\win-x64      (install-engine.cmd copies this)
#   outer/rel : build-addin.ps1         -> bin\Release\...\publish               (the Inno installer copies that)
# The engine has no `#if DEBUG`, so the two differ only in optimization - which means a
# Debug-over-Release swap is invisible and harmless-looking, but it makes "did my change take
# effect?" unanswerable. On 2026-09-17 exactly that cost a full debugging cycle.
#
# This answers three questions in one screen:
#   1. which config is LIVE in Revit right now (by hash, not by hope)
#   2. is the Debug build CURRENT (no source file newer than the DLL)
#   3. what will change if you copy it
#
# Read-only. Safe to run any time, with or without Revit open.
#
# EXIT CODES (install-engine.cmd acts on these):
#   0 = ok        - Debug build exists and is current
#   2 = STALE     - a source file is newer than the Debug build; installing would deploy old code
#   3 = MISSING   - the Debug build does not exist
#
# ⚠ A HASH MISMATCH AFTER A COMMIT IS EXPECTED - DO NOT REINSTALL ON THAT ALONE
# -----------------------------------------------------------------------------
# The SDK bakes the git revision into every assembly as
# `AssemblyInformationalVersion = <version>+<40-hex-commit>` (SourceLink /
# IncludeSourceRevisionInInformationalVersion, on by default). So the moment you commit -
# even with the engine source byte-identical - the next build produces a DLL whose SHA256
# differs from the installed one. That also perturbs the MVID, so it is NOT something you can
# normalise away by hashing a scrubbed copy.
#
# Measured 2026-09-22: Debug and INSTALLED differed in exactly 149 bytes of 1,060,864, and a
# printable-string diff showed a single differing line:
#     Debug     ...1.0.0+6741eb39e818a9c767f423312f60271c1218bed7
#     INSTALLED ...1.0.0+712d72c6a85e43aa9c7ea6ce0d2fe5f59922c1a2
# The CODE was identical. Only the commit string differed.
#
# => The revision is printed below, and the "installed vs newest source" line is the
#    hash-independent answer to "is the live engine current?". Trust THAT, not the hash.
#
# NB: Windows client defaults every execution-policy scope to Undefined, i.e. Restricted, so a
# bare `& script.ps1` FAILS with "running scripts is disabled on this system". Callers must use
#   powershell -NoProfile -ExecutionPolicy Bypass -File "<this>"

$ErrorActionPreference = 'Stop'

$Root      = Split-Path -Parent $PSScriptRoot
$DebugDll  = Join-Path $Root 'CoreScript.Engine\bin\Debug\net8.0-windows\win-x64\CoreScript.Engine.dll'
$RelDll    = Join-Path $Root 'CoreScript.Engine\bin\Release\net8.0-windows\win-x64\CoreScript.Engine.dll'
$Installed = 'C:\ProgramData\Autodesk\Revit\Addins\2025\Paracore\CoreScript.Engine.dll'

function Get-EngineInfo([string]$Path) {
    if (-not (Test-Path $Path)) { return $null }
    $f = Get-Item $Path

    # The embedded commit, e.g. "...4.7.0.0+6741eb39e818...". Encoding.ASCII maps one byte to
    # exactly one char (non-ASCII becomes '?'), so a regex index IS a byte offset - good enough
    # to find the string, which is all we need it for.
    $rev = '(none)'
    try {
        $text = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($Path))
        $m = [regex]::Match($text, '\+([0-9a-f]{40})')
        if ($m.Success) { $rev = $m.Groups[1].Value.Substring(0, 12) }
    } catch { }

    [pscustomobject]@{
        Size = $f.Length
        Time = $f.LastWriteTime
        Hash = (Get-FileHash $Path -Algorithm SHA256).Hash.Substring(0, 16)
        Rev  = $rev
    }
}

function Show-Row([string]$Label, $Info) {
    if ($null -eq $Info) {
        Write-Host ("  {0,-10} {1}" -f $Label, '(not built)')
        return
    }
    Write-Host ("  {0,-10} {1,10:N0} B   {2:yyyy-MM-dd HH:mm:ss}   {3}   rev {4}" -f `
        $Label, $Info.Size, $Info.Time, $Info.Hash, $Info.Rev)
}

$dbg = Get-EngineInfo $DebugDll
$rel = Get-EngineInfo $RelDll
$ins = Get-EngineInfo $Installed

Write-Host ''
Write-Host '=== CoreScript.Engine builds ===' -ForegroundColor Cyan
Show-Row 'Debug'     $dbg
Show-Row 'Release'   $rel
Show-Row 'INSTALLED' $ins

# --- newest engine source, excluding build output ---------------------------
$newestSrc = Get-ChildItem (Join-Path $Root 'CoreScript.Engine') -Recurse -Filter *.cs -ErrorAction SilentlyContinue |
             Where-Object { $_.FullName -notmatch '\\(obj|bin)\\' } |
             Sort-Object LastWriteTime -Descending |
             Select-Object -First 1

# --- which config is live in Revit? -----------------------------------------
if ($null -ne $ins) {
    $live = 'unknown (installed DLL matches neither build output)'
    $liveColor = 'Red'
    if ($null -ne $dbg -and $ins.Hash -eq $dbg.Hash) {
        $live = 'Debug'
        $liveColor = 'Green'
    } elseif ($null -ne $rel -and $ins.Hash -eq $rel.Hash) {
        $live = 'Release'
        $liveColor = 'Yellow'
    }
    Write-Host ''
    Write-Host ("  LIVE IN REVIT: {0}" -f $live) -ForegroundColor $liveColor

    # A hash mismatch is the NORMAL state after any commit (see the header). Say so, loudly,
    # instead of leaving the operator to conclude that the wrong engine is deployed.
    if ($liveColor -eq 'Red' -and $null -ne $dbg -and $ins.Size -eq $dbg.Size `
        -and $ins.Rev -ne $dbg.Rev) {
        Write-Host '    (expected: same size, different embedded revision - see "installed vs newest source" below)' -ForegroundColor DarkGray
    }
}

# --- is the Debug build current w.r.t. its sources? -------------------------
$exitCode = 0

if ($null -eq $dbg) {
    $exitCode = 3
    Write-Host ''
    Write-Host '  *** Debug build is MISSING. Run:' -ForegroundColor Red
    Write-Host '      dotnet build CoreScript.Engine\CoreScript.Engine.csproj -c Debug --no-restore' -ForegroundColor Red
} elseif ($null -ne $newestSrc -and $newestSrc.LastWriteTime -gt $dbg.Time) {
    $exitCode = 2
    Write-Host ''
    Write-Host ("  *** STALE: {0}" -f $newestSrc.Name) -ForegroundColor Red
    Write-Host ("      source edited {0:yyyy-MM-dd HH:mm:ss}, Debug build is {1:yyyy-MM-dd HH:mm:ss}" -f `
        $newestSrc.LastWriteTime, $dbg.Time) -ForegroundColor Red
    Write-Host '      Installing now would deploy OLD code.' -ForegroundColor Red
} else {
    Write-Host ''
    Write-Host '  Debug build is CURRENT (no source file newer than the DLL).' -ForegroundColor Green
}

# --- ⚠ the hash-independent answer: does the INSTALLED engine contain the newest source? ----
# This is the line to trust for "did my change take effect?". A hash comparison cannot answer
# it, because the commit string changes on every commit even when the code does not.
if ($null -ne $ins -and $null -ne $newestSrc) {
    Write-Host ''
    if ($newestSrc.LastWriteTime -gt $ins.Time) {
        Write-Host ("  INSTALLED is OLDER than {0} - the live engine does NOT contain the newest source." -f $newestSrc.Name) -ForegroundColor Yellow
    } else {
        Write-Host '  INSTALLED includes every current source file (no .cs is newer than the installed DLL).' -ForegroundColor Green
    }
}

# --- what will copying change? ---------------------------------------------
if ($null -ne $ins -and $null -ne $dbg) {
    Write-Host ''
    if ($ins.Hash -eq $dbg.Hash) {
        Write-Host '  Copying would be a NO-OP (installed already == Debug build).' -ForegroundColor DarkGray
    } elseif ($ins.Size -eq $dbg.Size -and $ins.Rev -ne $dbg.Rev) {
        Write-Host '  Copying would rewrite the installed engine with a Debug build whose CODE is' -ForegroundColor DarkGray
        Write-Host ("  the same but whose embedded revision differs ({0} -> {1}). Harmless either way." -f $ins.Rev, $dbg.Rev) -ForegroundColor DarkGray
    } else {
        Write-Host ("  Copying would replace the live {0} engine with the Debug engine." -f $live) -ForegroundColor Yellow
    }
}
Write-Host ''

exit $exitCode
