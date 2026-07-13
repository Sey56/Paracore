# Build Paracore Desktop App (Tauri + Python sidecar)
# Usage: ./build-frontend.ps1
# For live testing without building: cd rap-web && npm run tauri dev

$ErrorActionPreference = 'Stop'

# --- Configuration ---
$ProjectRoot = Get-Location
$ParacoreRoot = Split-Path -Path $ProjectRoot -Parent
$webDir = Join-Path -Path $ProjectRoot -ChildPath 'rap-web'

# --- Auto-Sync Version ---
$VersionFile = Join-Path $ProjectRoot "VERSION"
if (-not (Test-Path $VersionFile)) {
    Write-Error "VERSION file not found at $VersionFile"
    exit 1
}
$Version = (Get-Content $VersionFile).Trim()
$SyncScript = Join-Path $ProjectRoot "..\Versioning\Set-Version.ps1"
if (Test-Path $SyncScript) {
    Write-Host "Syncing versions to $Version..." -ForegroundColor Cyan
    & $SyncScript $Version
} else {
    Write-Warning "Set-Version.ps1 not found, skipping auto-sync."
}

# --- Banner ---
Write-Host '=================================' -ForegroundColor Cyan
Write-Host '   Building Paracore Installer   '
Write-Host '=================================' -ForegroundColor Cyan

# --- Prerequisite Check ---
Write-Host "`n[0/2] Checking prerequisites..."
$uvCommand = Get-Command uv -ErrorAction SilentlyContinue
if (-not $uvCommand) {
    Write-Host "Error: 'uv' is required. Install from https://docs.astral.sh/uv/" -ForegroundColor Red
    exit 1
}
Write-Host "Found uv at: $($uvCommand.Source)" -ForegroundColor Green

# --- 1. Build rap-web (Tauri) ---
Write-Host "`n[1/2] Building rap-web..."
Push-Location $webDir

$tauriConfigPath = Join-Path -Path $webDir -ChildPath 'src-tauri\tauri.conf.json'
$originalConfig = Get-Content -Path $tauriConfigPath -Raw
$configObject = $originalConfig | ConvertFrom-Json

try {
    # --- Rebrand to Paracore ---
    Write-Host "Rebranding to 'Paracore'..." -ForegroundColor Yellow
    $configObject.package.productName = "Paracore"
    $configObject.tauri.bundle.identifier = "com.paracore.dev"

    # --- WiX Cleanup Fragment ---
    if (-not ($configObject.tauri.bundle.PSObject.Properties.Name -contains 'windows')) {
        Add-Member -InputObject $configObject.tauri.bundle -MemberType NoteProperty -Name 'windows' -Value @{ wix = @{ fragmentPaths = @() } }
    } elseif (-not ($configObject.tauri.bundle.windows.PSObject.Properties.Name -contains 'wix')) {
        Add-Member -InputObject $configObject.tauri.bundle.windows -MemberType NoteProperty -Name 'wix' -Value @{ fragmentPaths = @() }
    }
    $configObject.tauri.bundle.windows.wix.fragmentPaths = @("wix/cleanup.wxs")

    # ── Embedded Python Environment ──
    Write-Host "Preparing embedded Python environment..." -ForegroundColor Yellow

    $serverReleaseDir = Join-Path -Path $webDir -ChildPath 'src-tauri\server-release'
    if (Test-Path $serverReleaseDir) { Remove-Item -Path $serverReleaseDir -Recurse -Force }
    New-Item -ItemType Directory -Path $serverReleaseDir | Out-Null

    $assetsDir = Join-Path -Path $webDir -ChildPath 'src-tauri\assets'
    $embeddableZip = Join-Path -Path $assetsDir -ChildPath 'python-3.12.3-embed-amd64.zip'
    Write-Host "Unzipping $embeddableZip..."
    Expand-Archive -Path $embeddableZip -DestinationPath $serverReleaseDir -Force

    # .pth file
    $pthFile = Join-Path -Path $serverReleaseDir -ChildPath 'python312._pth'
    Set-Content -Path $pthFile -Value "python312.zip`n.`nLib/site-packages" -Force

    # Strip dev packages, bundle site-packages, then restore dev packages
    Write-Host "Stripping dev packages..." -ForegroundColor Cyan
    $serverProjectDir = Join-Path -Path $ProjectRoot -ChildPath "rap-server\server"
    Push-Location $serverProjectDir
    uv sync --no-dev
    Pop-Location

    # Patch logfire_api resilience
    $logfireApiInit = Join-Path -Path $ProjectRoot -ChildPath "rap-server\server\.venv\Lib\site-packages\logfire_api\__init__.py"
    if (Test-Path $logfireApiInit) {
        $original = @'
    logfire_module = importlib.import_module('logfire')
    sys.modules[__name__] = logfire_module
'@
        $patched = @'
    logfire_module = importlib.import_module('logfire')
    if hasattr(logfire_module, 'Logfire') and hasattr(logfire_module, 'LogfireSpan'):
        sys.modules[__name__] = logfire_module
    else:
        raise ImportError('Found logfire module but it lacks the expected API (stale install?)')
'@
        (Get-Content -Path $logfireApiInit -Raw).Replace($original, $patched) | Set-Content -Path $logfireApiInit -NoNewline
    }

    Write-Host "Bundling runtime dependencies..." -ForegroundColor Cyan
    $venvSitePackages = Join-Path -Path $ProjectRoot -ChildPath "rap-server\server\.venv\Lib\site-packages"
    $destSitePackages = Join-Path -Path $serverReleaseDir -ChildPath "Lib\site-packages"

    # Purge stale logfire
    $staleLogfire = Join-Path -Path $venvSitePackages -ChildPath "logfire"
    if (Test-Path $staleLogfire) { Remove-Item -Recurse -Force $staleLogfire }

    New-Item -ItemType Directory -Path $destSitePackages -Force | Out-Null
    robocopy $venvSitePackages $destSitePackages /E /XD "__pycache__" "tests" "docs" "examples" /NJH /NJS /NDL /NC /NS /NP | Out-Null

    $destLogfire = Join-Path -Path $destSitePackages -ChildPath "logfire"
    if (Test-Path $destLogfire) { Remove-Item -Recurse -Force $destLogfire }

    # Restore dev packages
    Write-Host "Restoring dev packages..." -ForegroundColor Gray
    Push-Location $serverProjectDir
    uv sync
    Pop-Location

    # Copy application source
    Write-Host "Copying application source..."
    $serverSourceDir = Join-Path -Path $ProjectRoot -ChildPath 'rap-server'
    Copy-Item -Path (Join-Path $serverSourceDir "run_server.py") -Destination $serverReleaseDir
    robocopy (Join-Path $serverSourceDir "server") (Join-Path $serverReleaseDir "server") /E /XD .venv __pycache__ .ruff_cache build dist /XF test_*.py reproduce_*.py /NJH /NJS /NDL /NC /NS /NP | Out-Null

    # Bundle paracore-agent
    $agentSource = Join-Path $ParacoreRoot "paracore-agent"
    if (Test-Path $agentSource) {
        robocopy $agentSource (Join-Path $serverReleaseDir "paracore-agent") /E /XD .venv __pycache__ .ruff_cache .git mcp-build build dist installers /XF *.spec *.pyc /NJH /NJS /NDL /NC /NS /NP | Out-Null
        Write-Host "Bundled paracore-agent" -ForegroundColor Gray
    }

    # Optional: JWT public key for offline auth
    $jwtKeySource = "$ParacoreRoot\rap-auth-server\server\jwt_public.pem"
    $releaseAuthDest = Join-Path -Path $serverReleaseDir -ChildPath 'rap-auth-server\server'
    if (Test-Path $jwtKeySource) {
        New-Item -ItemType Directory -Path $releaseAuthDest -Force | Out-Null
        Copy-Item -Path $jwtKeySource -Destination $releaseAuthDest -Force
    }

    # Configure Tauri resources
    if (-not ($configObject.tauri.bundle.PSObject.Properties.Name -contains 'resources')) {
        Add-Member -InputObject $configObject.tauri.bundle -MemberType NoteProperty -Name 'resources' -Value $null
    }
    $configObject.tauri.bundle.resources = @("server-release")

    Write-Host 'Python server bundled.' -ForegroundColor Green

    # Write modified config
    $configObject | ConvertTo-Json -Depth 10 | Set-Content -Path $tauriConfigPath

    # Clean build artifacts that break WiX (colon in filename)
    $badFiles = Get-ChildItem -Path $serverReleaseDir -Recurse -Filter "*_all_files.txt" -ErrorAction SilentlyContinue
    $badFiles | ForEach-Object { Remove-Item $_.FullName -Force; Write-Host "Removed: $($_.Name)" -ForegroundColor Gray }

    # Clean stale MSI to force regeneration
    $tauriMsiSource = Join-Path -Path $ProjectRoot -ChildPath "rap-web\src-tauri\target\release\bundle\msi\Paracore_$($Version)_x64_en-US.msi"
    if (Test-Path $tauriMsiSource) {
        Write-Host "Cleaning stale MSI..." -ForegroundColor Gray
        Remove-Item -Path $tauriMsiSource -Force
    }

    # --- Build Tauri ---
    Write-Host "Running tauri build..." -ForegroundColor Cyan
    npx tauri build --features "bundle-server"

    # Tauri sometimes returns exit 1 for WiX warnings even on success
    if (-not (Test-Path $tauriMsiSource)) {
        Write-Error "Build failed — MSI not produced at: $tauriMsiSource"
        exit 1
    }
    Write-Host "Tauri build finished — MSI produced."

    # --- Cleanup ---
    Write-Host "Restoring tauri.conf.json..." -ForegroundColor Gray
    Set-Content -Path $tauriConfigPath -Value $originalConfig

    # Remove any server-modules debris
    $bundleDir = Join-Path -Path $webDir -ChildPath 'server-modules'
    if (Test-Path $bundleDir) { Remove-Item -Path $bundleDir -Recurse -Force }
}
finally {
    Pop-Location
}

Write-Host 'rap-web build complete.' -ForegroundColor Green

# --- 2. Copy MSI to installers ---
Write-Host "`n[2/2] Copying installer..."
$finalInstallDir = Join-Path -Path $ProjectRoot -ChildPath 'installers'
if (-not (Test-Path $finalInstallDir)) { New-Item -ItemType Directory -Path $finalInstallDir | Out-Null }

$tauriMsiSource = Join-Path -Path $ProjectRoot -ChildPath "rap-web\src-tauri\target\release\bundle\msi\Paracore_$($Version)_x64_en-US.msi"
$tauriMsiDestination = Join-Path -Path $finalInstallDir -ChildPath "Paracore_$($Version)_x64.msi"

if (Test-Path $tauriMsiDestination) {
    try { Remove-Item -Path $tauriMsiDestination -Force } catch {
        Write-Warning "Could not remove old installer — it may be locked."
    }
}
$extraMsi = Join-Path -Path $finalInstallDir -ChildPath "Paracore_$($Version)_x64_en-US.msi"
if (Test-Path $extraMsi) { Remove-Item -Path $extraMsi -Force -ErrorAction SilentlyContinue }

try {
    Copy-Item -Path $tauriMsiSource -Destination $tauriMsiDestination -Force -ErrorAction Stop
    Write-Host "Installer: $tauriMsiDestination" -ForegroundColor Yellow
} catch {
    Write-Error "Could not copy installer. Source: $tauriMsiSource"
}

Write-Host "`n=================================" -ForegroundColor Cyan
Write-Host '   Build Complete!   '
Write-Host '=================================' -ForegroundColor Cyan
