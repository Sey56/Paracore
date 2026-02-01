# Verify-Release.ps1
# Run this to confirm everything is perfect before starting a long build.

$ProjectRoot = Get-Location
$VersionFile = Join-Path $ProjectRoot "VERSION"
$Version = (Get-Content $VersionFile).Trim()

Write-Host "--- Paracore Release Verification (Target: v$Version) ---" -ForegroundColor Cyan

$Success = $true

# 1. Check MSI Path construction
$buildMode = "release" # Simulate -Release flag
$tauriMsiSource = Join-Path -Path $ProjectRoot -ChildPath ("rap-web\src-tauri\target\" + $buildMode + "\bundle\msi\Paracore_" + $Version + "_x64_en-US.msi")

Write-Host "`n[1/3] Checking MSI path construction..."
Write-Host "Expected MSI Path: $tauriMsiSource"
if ($tauriMsiSource -match "__") {
    Write-Host "ERROR: MSI Path is broken (double underscore detected). Version was empty." -ForegroundColor Red
    $Success = $false
} else {
    Write-Host "MSI Path format looks correct." -ForegroundColor Green
}

# 2. Check UI Metadata (TopBar.tsx)
Write-Host "`n[2/3] Checking UI Metadata (TopBar.tsx)..."
$TopBarPath = Join-Path $ProjectRoot "rap-web/src/components/layout/TopBar/TopBar.tsx"
if (Test-Path $TopBarPath) {
    $content = Get-Content $TopBarPath -Raw
    
    # Check Version
    $versionTag = "<span[^>]*>Version:</span>\s*<span[^>]*>" + [regex]::Escape($Version) + "</span>"
    if ($content -match $versionTag) {
        Write-Host "UI Version: Correct ($Version)" -ForegroundColor Green
    } else {
        Write-Host "UI Version: WRONG or not updated." -ForegroundColor Red
        $Success = $false
    }
    
    # Check Developer
    if ($content -match "Paras Codarch") {
        Write-Host "UI Developer: Correct (Paras Codarch)" -ForegroundColor Green
    } else {
        Write-Host "UI Developer: CORRUPTED or missing." -ForegroundColor Red
        $Success = $false
    }

    # Check Contact
    if ($content -match "codarch46@gmail.com") {
        Write-Host "UI Contact: Correct (codarch46@gmail.com)" -ForegroundColor Green
    } else {
        Write-Host "UI Contact: CORRUPTED or missing." -ForegroundColor Red
        $Success = $false
    }
}

# 3. Check Project Version Strings
Write-Host "`n[3/3] Checking Project Files..."
$PackagePath = Join-Path $ProjectRoot "rap-web/package.json"
if (Test-Path $PackagePath) {
    $packageContent = Get-Content $PackagePath -Raw
    $versionRegex = '"version":\s*"' + [regex]::Escape($Version) + '"'
    if ($packageContent -match $versionRegex) {
        Write-Host "rap-web/package.json: Correct" -ForegroundColor Green
    } else {
         Write-Host "rap-web/package.json: Incorrect" -ForegroundColor Red
         $Success = $false
    }
}

# 5. Frontend Build Check (CRITICAL)
$FrontendPath = Join-Path $ProjectRoot "rap-web"
if (Test-Path $FrontendPath) {
    Write-Host "`n[🧪] Building Frontend..." -ForegroundColor Cyan
    Push-Location $FrontendPath
    npm run build -- --quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Host "FATAL: Frontend build failed! Stop for safety." -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Pop-Location
    Write-Host "Frontend build successful." -ForegroundColor Green
} else {
    Write-Host "WARNING: Frontend path not found, skipping build check." -ForegroundColor Yellow
}

Write-Host "`n-------------------------------------------"
if ($Success) {
    Write-Host "------------------------------------------------" -ForegroundColor Cyan
    Write-Host "READY FOR RELEASE. ALL SHIELDS AT 100%." -ForegroundColor Green
    Write-Host "------------------------------------------------" -ForegroundColor Cyan
} else {
    Write-Host "STOP! Errors found. Do not start the build." -ForegroundColor White -BackgroundColor Red
}
Write-Host "-------------------------------------------"
