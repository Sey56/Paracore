# Verify-Release.ps1
# Run this to confirm everything is perfect before starting a long build.
#
# IMPORTANT: keep this file ASCII-ONLY. Every .ps1 in this repo is stored
# WITHOUT a BOM, so Windows PowerShell 5.1 decodes it as ANSI. A non-ASCII
# character inside a double-quoted string then mojibakes into a smart-quote,
# which PowerShell treats as a string delimiter, and the script fails to parse
# with a misleading "Missing closing '}'". An earlier version carried an emoji
# in a Write-Host string; removed 2026-11-06.
#
# The authoritative version-sync check is scripts/Set-Version.ps1 -Check.
# This script checks the surfaces that are NOT stored version numbers: the
# derived UI, the release metadata, and that the frontend actually builds.

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$VersionFile = Join-Path $ProjectRoot "VERSION"
if (-not (Test-Path $VersionFile)) {
    Write-Host "FATAL: VERSION file not found at $VersionFile" -ForegroundColor Red
    exit 1
}
$Version = ([System.IO.File]::ReadAllText($VersionFile)).Trim()

Write-Host "--- Paracore Release Verification (Target: v$Version) ---" -ForegroundColor Cyan

$Success = $true

# 1. Check MSI Path construction
$buildMode = "release" # Simulate -Release flag
$tauriMsiSource = Join-Path -Path $ProjectRoot -ChildPath ("rap-web\src-tauri\target\" + $buildMode + "\bundle\msi\Paracore_" + $Version + "_x64_en-US.msi")

Write-Host "`n[1/4] Checking MSI path construction..."
Write-Host "Expected MSI Path: $tauriMsiSource"
if ($tauriMsiSource -match "__") {
    Write-Host "ERROR: MSI Path is broken (double underscore detected). Version was empty." -ForegroundColor Red
    $Success = $false
} else {
    Write-Host "MSI Path format looks correct." -ForegroundColor Green
}

# 2. Check UI Metadata (TopBar.tsx)
# The version shown in the UI is DERIVED, not stored: TopBar.tsx renders
# `v{packageJson.version}` at runtime. A hard-coded number here would be a
# BUG, not a correct value - the old check looked for that hard-coded span
# and therefore could never pass (false red, fixed 2026-11-06). Proving the
# derived link is wired, plus checking package.json in step 3, is what
# actually establishes that the UI shows v$Version.
Write-Host "`n[2/4] Checking UI Metadata (TopBar.tsx)..."
$TopBarPath = Join-Path $ProjectRoot "rap-web/src/components/layout/TopBar/TopBar.tsx"
if (Test-Path $TopBarPath) {
    $content = Get-Content $TopBarPath -Raw

    # Both displayed rows must read the package version, not a literal.
    $derived = [regex]::Matches($content, 'v\{packageJson\.version\}')
    if ($derived.Count -ge 2) {
        Write-Host "UI Version: Derived from package.json ($($derived.Count) rows) - correct" -ForegroundColor Green
    } else {
        Write-Host "UI Version: WRONG - TopBar must render v{packageJson.version}, not a literal." -ForegroundColor Red
        $Success = $false
    }
    if ($content -match '[0-9]+\.[0-9]+\.[0-9]+') {
        Write-Host "UI Version: WRONG - a hard-coded version literal is present in TopBar.tsx." -ForegroundColor Red
        $Success = $false
    }

    # Check Developer
    if ($content -match "Paras Codarch") {
        Write-Host "UI Developer: Correct (Paras Codarch)" -ForegroundColor Green
    } else {
        Write-Host "UI Developer: CORRUPTED or missing." -ForegroundColor Red
        $Success = $false
    }

    # Check the help/contact destination. This used to assert the literal
    # `codarch46@gmail.com`, which was removed from the About modal and replaced
    # by a Documentation link. RETARGETED 2026-11-06 rather than deleted: the
    # claim "the user can always reach help" still needs an anchor.
    if ($content -match 'shell\.open\(''https://sey56\.github\.io/paracore-help''\)') {
        Write-Host "UI Help: Correct (Documentation link)" -ForegroundColor Green
    } else {
        Write-Host "UI Help: CORRUPTED or missing - the About modal must link to paracore-help." -ForegroundColor Red
        $Success = $false
    }
} else {
    Write-Host "ERROR: TopBar.tsx not found - cannot verify the UI." -ForegroundColor Red
    $Success = $false
}

# 3. Check Project Version Strings
Write-Host "`n[3/4] Checking Project Files..."
$PackagePath = Join-Path $ProjectRoot "rap-web/package.json"
if (Test-Path $PackagePath) {
    $packageContent = Get-Content $PackagePath -Raw
    $versionRegex = '"version":\s*"' + [regex]::Escape($Version) + '"'
    if ($packageContent -match $versionRegex) {
        Write-Host "rap-web/package.json: Correct ($Version)" -ForegroundColor Green
    } else {
         Write-Host "rap-web/package.json: Incorrect" -ForegroundColor Red
         $Success = $false
    }
} else {
    Write-Host "ERROR: rap-web/package.json not found." -ForegroundColor Red
    $Success = $false
}

# 4. Frontend Build Check (CRITICAL)
$FrontendPath = Join-Path $ProjectRoot "rap-web"
if (Test-Path $FrontendPath) {
    Write-Host "`n[4/4] Building Frontend..." -ForegroundColor Cyan
    Push-Location $FrontendPath
    # No `-- --quiet`: vite build rejects that flag (CACError: Unknown option
    # `--quiet`), so the old invocation made this script fail on every run.
    # `npm run build` is already `tsc -b && vite build`.
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FATAL: Frontend build failed! Stop for safety." -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-Host "Frontend build successful." -ForegroundColor Green
} else {
    Write-Host "ERROR: Frontend path not found - refusing a green without a build." -ForegroundColor Red
    $Success = $false
}

Write-Host "`n-------------------------------------------"
if ($Success) {
    Write-Host "------------------------------------------------" -ForegroundColor Cyan
    Write-Host "READY FOR RELEASE. ALL SHIELDS AT 100%." -ForegroundColor Green
    Write-Host "------------------------------------------------" -ForegroundColor Cyan
    exit 0
}
Write-Host "STOP! Errors found. Do not start the build." -ForegroundColor White -BackgroundColor Red
exit 1
