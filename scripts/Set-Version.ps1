<#
.SYNOPSIS
    Set / check / show the ONE version for the whole `paracore` repo.

.DESCRIPTION
    `paracore` ships four components that must ALWAYS carry the same number:
    the engine, the Revit add-in, the desktop app and the VS Code extension.
    This script is the only thing that writes that number.

    `VERSION` at the repo root is the AUTHORITY. `build-addin.ps1` and
    `build-frontend.ps1` call this script automatically before they build, so a
    normal build can never ship a half-bumped tree.

    NOTE: the sibling MCPs (`paracore-gen`, `-model`, `-family`, `-forge`,
    `-takeoff`) are SEPARATE repos with SEPARATE versions. Each carries its own
    `Set-Version.ps1` at its root and is bumped on its own schedule. Never
    version a sibling from here.

    NOTE: surfaces that are DERIVED, not stored, and so are absent from the
    list below: `rap-web/src/components/layout/TopBar/TopBar.tsx` reads
    `packageJson.version` at runtime, and each sibling's `version-info.txt` is
    written by its own `build-*.ps1`. Editing either by hand is a no-op.

    IMPORTANT: keep this file ASCII-ONLY. Every .ps1 in this repo is stored
    WITHOUT a BOM, so Windows PowerShell 5.1 decodes it as ANSI. A non-ASCII
    character such as an em-dash inside a double-quoted string then mojibakes
    into a smart-quote, which PowerShell treats as a string delimiter, and the
    script fails to parse with a misleading "Missing closing '}'". Comments are
    safe; STRINGS are not. ASCII costs nothing here.

.PARAMETER Version
    The new version, `MAJOR.MINOR.PATCH`. Defaults to the current `VERSION`.

.PARAMETER Check
    Verify every surface already equals `VERSION`. Writes NOTHING.
    Exit code 1 on any mismatch - this is the CI / pre-release gate.

.PARAMETER Show
    Print the current value of every surface. Writes nothing.

.PARAMETER Commit
    `git add` exactly the files this script owns, then commit them.
    Never `git add -A`.

.EXAMPLE
    ./scripts/Set-Version.ps1 4.8.0
.EXAMPLE
    ./scripts/Set-Version.ps1 -Check
.EXAMPLE
    ./scripts/Set-Version.ps1 -Show
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)][string]$Version = "",
    [switch]$Check,
    [switch]$Show,
    [switch]$Commit
)

$ErrorActionPreference = 'Stop'

# scripts/ -> the paracore repo root
$Root = Split-Path -Parent $PSScriptRoot
# CAUTION: read AND write every surface as UTF-8 with NO BOM.
#   `Get-Content -Raw` with no -Encoding decodes a BOM-less file with the ANSI
#   code page, so writing the result back as UTF-8 double-encodes every
#   non-ASCII character: an em-dash in a comment returned as three mojibake
#   characters (repaired 2026-10-10). Both halves must share one codec.
$Utf8 = New-Object System.Text.UTF8Encoding($false)

# =============================================================================
# The authority
# =============================================================================

$VersionFile = Join-Path $Root 'VERSION'
if (-not (Test-Path $VersionFile)) {
    Write-Host "ERROR: VERSION file not found at $VersionFile" -ForegroundColor Red
    exit 1
}
$Authority = ([System.IO.File]::ReadAllText($VersionFile, $Utf8)).Trim()

if (-not $Version) { $Version = $Authority }

if ($Version -notmatch '^\d+\.\d+\.\d+$') {
    Write-Host "ERROR: version must be MAJOR.MINOR.PATCH (got '$Version')" -ForegroundColor Red
    exit 1
}

# .NET AssemblyVersion / FileVersion are 4-part: X.Y.Z.0
$V4 = "$Version.0"

# =============================================================================
# The surfaces - every place the number is STORED
# =============================================================================
# Path   - repo-relative file
# Rx     - the pattern that HOLDS the number
# Rep    - what the MATCHED value must become; {V} -> X.Y.Z, {V4} -> X.Y.Z.0
# Add    - optional anchor regex, used only when Rx does NOT match at all
#          (a brand-new surface)
# Insert - optional; the line to INSERT after the anchor. Defaults to Rep.
#          Keep the indentation HERE, not in Rep - a Rep that carries leading
#          whitespace makes every later check report the surface as stale.
#
# A surface is STALE when applying Rep to the file changes it.

$Surfaces = @(
    # -- .NET assemblies (4-part) ---------------------------------------------
    @{ Path = 'CoreScript.Engine/CoreScript.Engine.csproj'
       Rx   = '<AssemblyVersion>[^<]*</AssemblyVersion>'
       Rep  = '<AssemblyVersion>{V4}</AssemblyVersion>' }
    @{ Path = 'CoreScript.Engine/CoreScript.Engine.csproj'
       Rx   = '<FileVersion>[^<]*</FileVersion>'
       Rep  = '<FileVersion>{V4}</FileVersion>' }
    @{ Path = 'Paracore.Addin/Paracore.Addin.csproj'
       Rx   = '<AssemblyVersion>[^<]*</AssemblyVersion>'
       Rep  = '<AssemblyVersion>{V4}</AssemblyVersion>' }
    @{ Path = 'Paracore.Addin/Paracore.Addin.csproj'
       Rx   = '<FileVersion>[^<]*</FileVersion>'
       Rep  = '<FileVersion>{V4}</FileVersion>' }
    @{ Path = 'Paracore.Server/Paracore.Server.csproj'
       Rx     = '<AssemblyVersion>[^<]*</AssemblyVersion>'
       Rep    = '<AssemblyVersion>{V4}</AssemblyVersion>'
       Add    = '<PropertyGroup>'
       Insert = '    <AssemblyVersion>{V4}</AssemblyVersion>' }
    @{ Path = 'Paracore.Server/Paracore.Server.csproj'
       Rx     = '<FileVersion>[^<]*</FileVersion>'
       Rep    = '<FileVersion>{V4}</FileVersion>'
       Add    = '<PropertyGroup>'
       Insert = '    <FileVersion>{V4}</FileVersion>' }
    @{ Path = 'Paracore.Shim/Paracore.Shim.csproj'
       Rx     = '<AssemblyVersion>[^<]*</AssemblyVersion>'
       Rep    = '<AssemblyVersion>{V4}</AssemblyVersion>'
       Add    = '<PropertyGroup>'
       Insert = '    <AssemblyVersion>{V4}</AssemblyVersion>' }
    @{ Path = 'Paracore.Shim/Paracore.Shim.csproj'
       Rx     = '<FileVersion>[^<]*</FileVersion>'
       Rep    = '<FileVersion>{V4}</FileVersion>'
       Add    = '<PropertyGroup>'
       Insert = '    <FileVersion>{V4}</FileVersion>' }

    # -- JavaScript / Tauri ---------------------------------------------------
    # anchor to the 2-space root key, so a dependency's nested "version" is safe
    @{ Path = 'rap-web/package.json'
       Rx   = '(?m)^(\s{2}"version":\s*)"[^"]*"'
       Rep  = '$1"{V}"' }
    @{ Path = 'corescript-vscode/package.json'
       Rx   = '(?m)^(\s{2}"version":\s*)"[^"]*"'
       Rep  = '$1"{V}"' }
    @{ Path = 'rap-web/src-tauri/tauri.conf.json'
       Rx   = '(?m)^(\s*"version":\s*)"[^"]*"'
       Rep  = '$1"{V}"' }
    # ^version at column 0 - the [package] table; deps are indented
    @{ Path = 'rap-web/src-tauri/Cargo.toml'
       Rx   = '(?m)^version\s*=\s*"[^"]*"'
       Rep  = 'version = "{V}"' }

    # -- Inno Setup -----------------------------------------------------------
    # One managed spot per installer: the MyAppVersion define. The [Setup]
    # fields read {#MyAppVersion} so they cannot drift from it.
    @{ Path = 'paracore-addin.iss'
       Rx   = '(?m)^(\s*#define\s+MyAppVersion\s+)"[^"]*"'
       Rep  = '$1"{V}"' }
    @{ Path = 'paracore-frontend.iss'
       Rx   = '(?m)^(\s*#define\s+MyAppVersion\s+)"[^"]*"'
       Rep  = '$1"{V}"' }

    # -- the add-in's gRPC handshake ------------------------------------------
    @{ Path = 'Paracore.Addin/Services/CoreScriptClient.cs'
       Rx   = 'AddinVersion\s*=\s*"[^"]*"'
       Rep  = 'AddinVersion = "{V}"' }
)

function Get-SurfaceText {
    param($S)
    $p = Join-Path $Root $S.Path
    if (-not (Test-Path $p)) { return $null }
    return ([System.IO.File]::ReadAllText($p, $Utf8))
}

function Get-SurfaceCurrent {
    param($S)
    $text = Get-SurfaceText $S
    if ($null -eq $text) { return '<file missing>' }
    $rx = [regex]$S.Rx
    if ($rx.IsMatch($text)) { return $rx.Match($text).Value.Trim() }
    if ($S.Add -and ([regex]$S.Add).IsMatch($text)) { return '<absent - will be added>' }
    return '<pattern not found>'
}

# Returns the new file text, or $null when the surface cannot be located.
function Set-SurfaceValue {
    param($S, [string]$Rep, [string]$Ins)
    $p = Join-Path $Root $S.Path
    $text = [System.IO.File]::ReadAllText($p, $Utf8)
    $rx = [regex]$S.Rx
    if ($rx.IsMatch($text)) {
        return $rx.Replace($text, $Rep, 1)
    }
    if ($S.Add) {
        $arx = [regex]$S.Add
        if ($arx.IsMatch($text)) {
            # insert the new line directly after the anchor
            $m = $arx.Match($text)
            $idx = $m.Index + $m.Length
            return $text.Substring(0, $idx) + "`n" + $Ins + $text.Substring($idx)
        }
    }
    return $null
}

# =============================================================================
# Show
# =============================================================================

if ($Show) {
    Write-Host ""
    Write-Host "  paracore version surfaces  (authority: VERSION = $Authority)" -ForegroundColor Cyan
    Write-Host "  ------------------------------------------------------------------"
    Write-Host ("  {0,-52} {1}" -f 'VERSION', $Authority)
    foreach ($s in $Surfaces) {
        Write-Host ("  {0,-52} {1}" -f $s.Path, (Get-SurfaceCurrent $s))
    }
    Write-Host ""
    return
}

# =============================================================================
# Check  - the gate. Writes nothing.
# =============================================================================

if ($Check) {
    $stale = @()
    if ($Authority -ne $Version) {
        $stale += "VERSION -> '$Authority' (want '$Version')"
    }
    foreach ($s in $Surfaces) {
        $text = Get-SurfaceText $s
        if ($null -eq $text) { $stale += "$($s.Path)  <file missing>"; continue }
        $rep = $s.Rep.Replace('{V}', $Version).Replace('{V4}', $V4)
        $new = Set-SurfaceValue $s $rep $rep
        if ($null -eq $new) { $stale += "$($s.Path)  <pattern not found>"; continue }
        if ($new -ne $text) {
            $stale += ("{0}  now: {1}" -f $s.Path, (Get-SurfaceCurrent $s))
        }
    }

    Write-Host ""
    if ($stale.Count -eq 0) {
        Write-Host "  VERSION CHECK OK - all surfaces at $Version" -ForegroundColor Green
        Write-Host ""
        exit 0
    }
    Write-Host "  VERSION CHECK FAILED - $($stale.Count) surface(s) disagree with $Version" -ForegroundColor Red
    foreach ($x in $stale) { Write-Host "    - $x" -ForegroundColor Red }
    Write-Host ""
    Write-Host "  Fix:  ./scripts/Set-Version.ps1 $Version" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

# =============================================================================
# Write
# =============================================================================

Write-Host ""
Write-Host "  Setting the paracore version to $Version  (was $Authority)" -ForegroundColor Cyan
Write-Host ""

$touched = @()
$failed  = @()

if ($Authority -ne $Version) {
    [System.IO.File]::WriteAllText($VersionFile, $Version, $Utf8)
    Write-Host ("  {0,-52} {1}" -f 'VERSION', $Version)
    $touched += 'VERSION'
} else {
    Write-Host ("  {0,-52} {1}" -f 'VERSION', "$Version  (unchanged)")
}

foreach ($s in $Surfaces) {
    $text = Get-SurfaceText $s
    if ($null -eq $text) { $failed += "$($s.Path)  <file missing>"; continue }
    $rep = $s.Rep.Replace('{V}', $Version).Replace('{V4}', $V4)
    $ins = $rep
    if ($s.ContainsKey('Insert')) {
        $ins = $s.Insert.Replace('{V}', $Version).Replace('{V4}', $V4)
    }
    $new = Set-SurfaceValue $s $rep $ins
    if ($null -eq $new) { $failed += "$($s.Path)  <pattern not found>"; continue }
    if ($new -eq $text) {
        Write-Host ("  {0,-52} {1}" -f $s.Path, "unchanged")
        continue
    }
    # NOTE: byte-level write, to preserve the file's own line endings. A
    # text-mode write would rewrite CRLF to LF and produce a whole-file diff.
    [System.IO.File]::WriteAllText((Join-Path $Root $s.Path), $new, $Utf8)
    Write-Host ("  {0,-52} {1}" -f $s.Path, "-> $Version") -ForegroundColor Green
    if ($touched -notcontains $s.Path) { $touched += $s.Path }
}

Write-Host ""
if ($failed.Count -gt 0) {
    Write-Host "  WARNING - $($failed.Count) surface(s) could not be located:" -ForegroundColor Yellow
    foreach ($x in $failed) { Write-Host "    - $x" -ForegroundColor Yellow }
    Write-Host ""
}

if ($Commit -and $touched.Count -gt 0) {
    Write-Host "  Committing $($touched.Count) file(s)..." -ForegroundColor Cyan
    Push-Location $Root
    # explicit paths only - never 'git add -A'
    & git add -- $touched
    & git commit -m "Bump paracore to $Version"
    Pop-Location
}

Write-Host "  Done. Every surface is at $Version." -ForegroundColor Cyan
Write-Host ""
