<#
.SYNOPSIS
    Detect zero-filled files - the fingerprint of an interrupted write after power loss.

.DESCRIPTION
    When the machine loses power (or is force-powered-off) while a build or package
    manager is writing a file, NTFS can commit the file's LENGTH to the MFT but never
    flush its DATA. On the next boot the file reads back at its correct size with every
    byte = 0x00. Measured 2026-11-18: a power cut during build-frontend.ps1 left
    tauri.conf.json, Cargo.toml and 24 .venv RECORD manifests zero-filled, which then
    surfaced as an unrelated-looking Set-Version.ps1 Regex cast error and a uv CSV
    deserialize error.

    This script scans git-tracked text files for that signature and fails loudly.
    Recovery for a tracked file:  git checkout -- <path>   (or re-run Set-Version.ps1)
    Recovery for .venv:            uv sync --reinstall

    NOTE: keep ASCII-ONLY and BOM-less, like every other .ps1 in this repo.

.PARAMETER Root
    Repo root. Defaults to the current location.
#>
param([string]$Root = (Get-Location).Path)

$ErrorActionPreference = 'Stop'

# Binary formats can legitimately contain long zero runs; skip them by extension.
$skipExt = @(
    '.png','.jpg','.jpeg','.gif','.bmp','.ico','.svgz',
    '.zip','.gz','.7z','.tar','.whl',
    '.dll','.exe','.pdb','.snk','.pfx','.lib','.obj',
    '.woff','.woff2','.ttf','.eot','.mp3','.mp4','.pdf'
)

# -z emits NUL-separated raw paths. Without it git QUOTES paths containing non-ASCII
# characters (an em-dash here becomes "\357\200\272"), which then breaks GetExtension
# with "Illegal characters in path" and makes the whole check abort.
$raw = & git -C $Root ls-files -z
if ($LASTEXITCODE -ne 0) {
    Write-Host "INTEGRITY CHECK: 'git ls-files' failed in $Root" -ForegroundColor Red
    exit 2
}
$files = @()
if ($null -ne $raw) {
    $files = @($raw -join "`0").Split([char]0) | Where-Object { $_.Length -gt 0 }
}

$bad = @()
$latin1 = [System.Text.Encoding]::GetEncoding(28591)

foreach ($rel in $files) {
    $ext = ''
    try { $ext = [System.IO.Path]::GetExtension($rel).ToLowerInvariant() } catch { continue }
    if ($skipExt -contains $ext) { continue }

    $p = Join-Path $Root $rel
    if (-not (Test-Path -LiteralPath $p)) { continue }

    $fi = Get-Item -LiteralPath $p -ErrorAction SilentlyContinue
    if ($null -eq $fi -or $fi.Length -eq 0 -or $fi.Length -gt 1048576) { continue }

    $bytes = [System.IO.File]::ReadAllBytes($p)
    if ($latin1.GetString($bytes).Trim([char]0).Length -eq 0) {
        $bad += $rel
    }
}

if ($bad.Count -gt 0) {
    Write-Host ""
    Write-Host "INTEGRITY CHECK FAILED - $($bad.Count) zero-filled file(s) detected:" -ForegroundColor Red
    foreach ($f in $bad) { Write-Host "  - $f" -ForegroundColor Red }
    Write-Host ""
    Write-Host "  This is the fingerprint of a power loss during a write, not a code bug." -ForegroundColor Yellow
    Write-Host "  A file at its correct size with every byte 0x00 cannot be trusted." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Recover tracked files:" -ForegroundColor Yellow
    foreach ($f in $bad) { Write-Host "    git checkout -- `"$f`"" -ForegroundColor Yellow }
    Write-Host "  Then re-run Set-Version.ps1 and the build." -ForegroundColor Yellow
    Write-Host "  For a damaged .venv:  uv sync --reinstall" -ForegroundColor Yellow
    Write-Host ""
    exit 1
}

Write-Host "  [+] Integrity check: no zero-filled tracked files ($($files.Count) scanned)" -ForegroundColor Green
exit 0
