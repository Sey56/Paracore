# Build and install the CoreScript VS Code extension (.vsix)
#
# Usage:
#   ./build-extension.ps1                 # package, copy to installers/, reload in VS Code
#   ./build-extension.ps1 -SkipInstall    # package and copy only (leaves VS Code untouched)
#
# What it does:
#   1. removes the previous .vsix from corescript-vscode/
#   2. runs `vsce package`, which fires the manifest's `vscode:prepublish` hook
#      -> `npm run package` -> `webpack --mode production`  (the production bundle)
#   3. copies the fresh .vsix into installers/
#   4. uninstalls and reinstalls the extension in VS Code
#
# Replaces build_extension.sh, which needed Git Bash. Everything else in this
# ecosystem is PowerShell, so this is PowerShell.
#
# NOTE: keep this file pure ASCII. Windows PowerShell 5.1 reads a BOM-less .ps1
# as CP1252, so a UTF-8 em-dash would decode to mojibake and break parsing.

[CmdletBinding()]
param(
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

# --- Paths: resolved from the script location, so the working directory is irrelevant ---
$RepoRoot      = $PSScriptRoot
$ExtensionDir  = Join-Path $RepoRoot 'corescript-vscode'
$InstallersDir = Join-Path $RepoRoot 'installers'
$ManifestPath  = Join-Path $ExtensionDir 'package.json'

Write-Host '--- Starting CoreScript Extension Build & Deployment ---' -ForegroundColor Cyan

# --- Prerequisite checks ---
if (-not (Test-Path $ManifestPath)) {
    Write-Error "package.json not found at $ManifestPath"
    exit 1
}

$vsceCommand = Get-Command vsce -ErrorAction SilentlyContinue
if (-not $vsceCommand) {
    Write-Error "'vsce' was not found on PATH. Install it with: npm install -g @vscode/vsce"
    exit 1
}
Write-Host "Found vsce at: $($vsceCommand.Source)" -ForegroundColor Green

if (-not (Test-Path (Join-Path $ExtensionDir 'node_modules'))) {
    Write-Error "node_modules is missing in $ExtensionDir - run 'npm install' there first."
    exit 1
}

$Manifest     = Get-Content -Path $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$ExtensionId  = "$($Manifest.publisher).$($Manifest.name)"
$ExtensionVer = $Manifest.version

Push-Location $ExtensionDir
try {
    # --- 1. Clear the previous package so the newest .vsix is unambiguous ---
    Get-ChildItem -Path $ExtensionDir -Filter 'corescript-*.vsix' -ErrorAction SilentlyContinue |
        ForEach-Object {
            Write-Host "Removing stale package: $($_.Name)" -ForegroundColor Gray
            Remove-Item -Path $_.FullName -Force
        }

    # --- 2. Package (this also runs the production webpack build) ---
    Write-Host 'Packaging VS Code extension...' -ForegroundColor Yellow
    # `vsce` prompts y/N about the missing `repository` field in package.json.
    # The old bash script answered with `yes |`; feed the same stream of lines here.
    $yesLines = @('y') * 100
    $yesLines | & vsce package
    if ($LASTEXITCODE -ne 0) {
        Write-Error "vsce package failed with exit code $LASTEXITCODE"
        exit 1
    }

    $vsixFile = Get-ChildItem -Path $ExtensionDir -Filter 'corescript-*.vsix' |
        Select-Object -First 1
    if (-not $vsixFile) {
        Write-Error 'Could not find the packaged .vsix file.'
        exit 1
    }
    Write-Host "Extension packaged: $($vsixFile.Name)" -ForegroundColor Green

    # --- 3. Copy into installers/ ---
    if (-not (Test-Path $InstallersDir)) {
        New-Item -ItemType Directory -Path $InstallersDir | Out-Null
    }
    Copy-Item -Path $vsixFile.FullName -Destination $InstallersDir -Force
    Write-Host "Copied to installers\" -ForegroundColor Green

    # Report (do not delete) any older .vsix versions still sitting in installers/
    $stalePackages = Get-ChildItem -Path $InstallersDir -Filter 'corescript-*.vsix' -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -ne $vsixFile.Name }
    foreach ($stale in $stalePackages) {
        Write-Host "Note: an older package is still present: installers\$($stale.Name)" -ForegroundColor DarkYellow
    }
}
finally {
    Pop-Location
}

# --- 4. Reload the extension in VS Code ---
if ($SkipInstall) {
    Write-Host 'Skipping VS Code install (-SkipInstall).' -ForegroundColor Yellow
}
else {
    $codeCommand = Get-Command code -ErrorAction SilentlyContinue
    if (-not $codeCommand) {
        Write-Warning "'code' was not found on PATH - skipping the VS Code install step."
        Write-Warning "Install the package manually: code --install-extension installers\$($vsixFile.Name)"
    }
    else {
        Write-Host 'Installing VS Code extension...' -ForegroundColor Yellow
        & code --uninstall-extension $ExtensionId 2>&1 | Out-Null
        & code --install-extension (Join-Path $InstallersDir $vsixFile.Name) --force
        Write-Host 'Extension installed.' -ForegroundColor Green
    }
}

Write-Host '--- Build & Deployment Complete ---' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Next steps:'
Write-Host '  1. Restart VS Code if it is open.'
Write-Host '  2. Open your workspace folder.'
Write-Host "  3. Run 'CoreScript: Initialize Workspace' from the Command Palette."
Write-Host ''
Write-Host "Packaged version: $ExtensionVer  ($ExtensionId)" -ForegroundColor Gray
