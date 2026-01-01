# Verify-Release.ps1
# Run this to confirm everything is perfect before starting a long build.

$ProjectRoot = Get-Location
$VersionFile = Join-Path $ProjectRoot "VERSION"
$Version = (Get-Content $VersionFile).Trim()

Write-Host "--- 🔍 Paracore Release Verification (Target: v$Version) ---" -ForegroundColor Cyan

$Success = $true

# 1. 📂 Check MSI Path construction
$buildMode = "release" # Simulate -Release flag
$tauriMsiSource = Join-Path -Path $ProjectRoot -ChildPath "rap-web\src-tauri\target\$buildMode\bundle\msi\Paracore_$($Version)_x64_en-US.msi"

Write-Host "`n[1/3] Checking MSI path construction..."
Write-Host "Expected MSI Path: $tauriMsiSource"
if ($tauriMsiSource -match "__") {
    Write-Host "❌ ERROR: MSI Path is broken (double underscore detected). `$Version was empty." -ForegroundColor Red
    $Success = $false
} else {
    Write-Host "✅ MSI Path format looks correct." -ForegroundColor Green
}

# 2. 🖥️ Check UI Metadata (TopBar.tsx)
Write-Host "`n[2/3] Checking UI Metadata (TopBar.tsx)..."
$TopBarPath = Join-Path $ProjectRoot "rap-web/src/components/layout/TopBar/TopBar.tsx"
if (Test-Path $TopBarPath) {
    $content = Get-Content $TopBarPath -Raw
    
    # Check Version
    if ($content -match "<span[^>]*>Version:</span>\s*<span[^>]*>$Version</span>") {
        Write-Host "✅ UI Version: Correct ($Version)" -ForegroundColor Green
    } else {
        Write-Host "❌ UI Version: WRONG or not updated." -ForegroundColor Red
        $Success = $false
    }
    
    # Check Developer (should NOT be 1.1.1)
    if ($content -match "<span[^>]*>Developer:</span>\s*<span[^>]*>Paras Codarch") {
        Write-Host "✅ UI Developer: Correct (Paras Codarch)" -ForegroundColor Green
    } else {
        Write-Host "❌ UI Developer: CORRUPTED (likely says $Version)" -ForegroundColor Red
        $Success = $false
    }

    # Check Contact (should NOT be 1.1.1)
    if ($content -match "<span[^>]*>Contact:</span>\s*<span[^>]*>codarch46@gmail.com") {
        Write-Host "✅ UI Contact: Correct (codarch46@gmail.com)" -ForegroundColor Green
    } else {
        Write-Host "❌ UI Contact: CORRUPTED (likely says $Version)" -ForegroundColor Red
        $Success = $false
    }
}

# 3. 📄 Check Project Version Strings
Write-Host "`n[3/3] Checking Project Files..."
$PackagePath = Join-Path $ProjectRoot "rap-web/package.json"
if (Test-Path $PackagePath) {
    if ((Get-Content $PackagePath -Raw) -match "`"version`":\s*`"$Version`"") {
        Write-Host "✅ rap-web/package.json: Correct" -ForegroundColor Green
    } else {
         Write-Host "❌ rap-web/package.json: Incorrect" -ForegroundColor Red
         $Success = $false
    }
}

Write-Host "`n-------------------------------------------"
if ($Success) {
    Write-Host "🚀 ALL CLEAR! It is safe to run the build." -ForegroundColor Green -BackgroundColor Black
} else {
    Write-Host "🛑 STOP! Errors found. Do not start the build." -ForegroundColor White -BackgroundColor Red
}
Write-Host "-------------------------------------------"
