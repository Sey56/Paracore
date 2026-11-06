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
$SyncScript = Join-Path $ProjectRoot (Join-Path "scripts" "Set-Version.ps1")
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
$originalConfig = Get-Content -Path $tauriConfigPath -Raw -Encoding UTF8
$configObject = $originalConfig | ConvertFrom-Json

try {
    # --- Rebrand to Paracore ---
    Write-Host "Rebranding to 'Paracore'..." -ForegroundColor Yellow
    if (-not ($configObject.PSObject.Properties.Name -contains 'package') -or $null -eq $configObject.package) {
        Add-Member -InputObject $configObject -MemberType NoteProperty -Name 'package' -Value @{ productName = "Paracore"; version = $Version } -Force
    } else {
        $configObject.package.productName = "Paracore"
    }
    $configObject.tauri.bundle.identifier = "com.paracore.dev"

    # --- WiX Cleanup Fragment ---
    if (-not ($configObject.tauri.bundle.PSObject.Properties.Name -contains 'windows')) {
        Add-Member -InputObject $configObject.tauri.bundle -MemberType NoteProperty -Name 'windows' -Value @{ wix = @{ fragmentPaths = @() } }
    } elseif (-not ($configObject.tauri.bundle.windows.PSObject.Properties.Name -contains 'wix')) {
        Add-Member -InputObject $configObject.tauri.bundle.windows -MemberType NoteProperty -Name 'wix' -Value @{ fragmentPaths = @() }
    }
    $configObject.tauri.bundle.windows.wix.fragmentPaths = @("wix/cleanup.wxs")

    # --- Ensure Windows resource icons exist ---
    $iconsDir = Join-Path -Path $webDir -ChildPath 'src-tauri\icons'
    $rapIco = Join-Path -Path $iconsDir -ChildPath 'rap-icon.ico'
    $iconIco = Join-Path -Path $iconsDir -ChildPath 'icon.ico'
    if (Test-Path $rapIco) {
        if (-not (Test-Path $iconIco)) { Copy-Item -Path $rapIco -Destination $iconIco -Force }
        Copy-Item -Path (Join-Path $iconsDir 'rap-icon-32.png') -Destination (Join-Path $iconsDir '32x32.png') -Force -ErrorAction SilentlyContinue
        Copy-Item -Path (Join-Path $iconsDir 'rap-icon-128.png') -Destination (Join-Path $iconsDir '128x128.png') -Force -ErrorAction SilentlyContinue
        Copy-Item -Path (Join-Path $iconsDir 'rap-icon-256.png') -Destination (Join-Path $iconsDir '128x128@2x.png') -Force -ErrorAction SilentlyContinue
    }

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
    uv sync --native-tls --no-dev
    Pop-Location

    # Patch logfire_api resilience
    $logfireApiInit = Join-Path -Path $ProjectRoot -ChildPath "rap-server\server\.venv\Lib\site-packages\logfire_api\__init__.py"
    if (Test-Path $logfireApiInit) {
        $rawLogfire = [System.IO.File]::ReadAllText($logfireApiInit)
        if (-not $rawLogfire.Contains('hasattr(logfire_module')) {
            $logfireTarget = 'sys.modules[__name__] = logfire_module'
            $logfireReplacement = "if hasattr(logfire_module, 'Logfire') and hasattr(logfire_module, 'LogfireSpan'):`r`n    sys.modules[__name__] = logfire_module`r`nelse:`r`n    raise ImportError('Found logfire module but it lacks the expected API (stale install?)')"
            $rawLogfire = $rawLogfire.Replace($logfireTarget, $logfireReplacement)
            [System.IO.File]::WriteAllText($logfireApiInit, $rawLogfire)
        }
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
    uv sync --native-tls
    Pop-Location

    # Copy application source
    Write-Host "Copying application source..."
    $serverSourceDir = Join-Path -Path $ProjectRoot -ChildPath 'rap-server'
    Copy-Item -Path (Join-Path $serverSourceDir "run_server.py") -Destination $serverReleaseDir
    robocopy (Join-Path $serverSourceDir "server") (Join-Path $serverReleaseDir "server") /E /XD .venv __pycache__ .ruff_cache build dist /XF test_*.py reproduce_*.py /NJH /NJS /NDL /NC /NS /NP | Out-Null

    # Bundle the SHARED MCP CORE's gRPC layer - `grpc_client` + the proto stubs.
    # This used to bundle `paracore-gen`, which owned the core until 2026-10-13. The core
    # now lives in THIS repo at `mcp/` (see mcp/mcp_core/domain.py), and rap-server is a
    # plain CLIENT of the same gRPC service the MCPs talk to (`Paracore.Server`, the
    # in-Revit sidecar on :50051). So it needs only that layer - never `mcp_core/`, which
    # is the MCP's own tools, prompts and skills.
    # The destination MIRRORS the dev layout, so `server/main.py` finds it with ONE rule:
    #   dev -> Paracore/paracore/mcp ; release -> server-release/paracore/mcp.
    # A missing core must FAIL the build. The old `if (Test-Path ...)` silently skipped,
    # which ships an installer whose sidecar cannot import grpc_client at all.
    $coreSource = Join-Path -Path $ProjectRoot -ChildPath 'mcp'
    if (-not (Test-Path (Join-Path $coreSource "grpc_client.py"))) {
        throw "Shared MCP core not found at $coreSource - the desktop sidecar cannot import grpc_client."
    }
    robocopy $coreSource (Join-Path $serverReleaseDir "paracore\mcp") /E /XD mcp_core __pycache__ .ruff_cache .git build dist /XF *.pyc /NJH /NJS /NDL /NC /NS /NP | Out-Null
    Write-Host "Bundled the shared MCP core (gRPC layer)" -ForegroundColor Gray

    # JWT public key for offline auth.
    # A MISSING KEY MUST FAIL THE BUILD, for the same reason the core above must: the old
    # `if (Test-Path ...)` silently skipped, so the app shipped with no fallback and
    # config.py printed "WARNING: JWT Public Key NOT LOADED" and carried on - offline auth
    # then dies at the customer's machine instead of here.
    # TWO SOURCES, in order: the auth-server repo (AUTHORITY - it rotates with the private
    # key) and this repo's TRACKED copy (a fallback, so a clone without the sibling still
    # builds). scripts/check-jwt-key.py fails when the two disagree.
    $jwtKeyCandidates = @(
        (Join-Path -Path $ParacoreRoot -ChildPath 'rap-auth-server\server\jwt_public.pem'),
        (Join-Path -Path $ProjectRoot  -ChildPath 'rap-server\server\keys\jwt_public.pem')
    )
    $jwtKeySource = $null
    foreach ($candidate in $jwtKeyCandidates) {
        if (Test-Path $candidate) { $jwtKeySource = $candidate; break }
    }
    if (-not $jwtKeySource) {
        throw "JWT public key not found. Looked in:`n  $($jwtKeyCandidates -join "`n  ")"
    }
    if ($jwtKeySource -ne $jwtKeyCandidates[0]) {
        Write-Warning "Bundling the TRACKED key copy, not the auth-server repo. If the key was rotated, offline auth will reject every token. Run scripts/check-jwt-key.py."
    }
    # Two destinations: `server\keys\` is the shape config.py looks for FIRST; the legacy
    # `rap-auth-server\server\` shape keeps an already-installed layout resolving.
    foreach ($jwtDest in @(
        (Join-Path -Path $serverReleaseDir -ChildPath 'server\keys'),
        (Join-Path -Path $serverReleaseDir -ChildPath 'rap-auth-server\server')
    )) {
        New-Item -ItemType Directory -Path $jwtDest -Force | Out-Null
        Copy-Item -Path $jwtKeySource -Destination $jwtDest -Force
    }
    Write-Host "Bundled the JWT public key from $jwtKeySource" -ForegroundColor Gray

    # Configure Tauri resources
    if (-not ($configObject.tauri.bundle.PSObject.Properties.Name -contains 'resources')) {
        Add-Member -InputObject $configObject.tauri.bundle -MemberType NoteProperty -Name 'resources' -Value $null
    }
    $configObject.tauri.bundle.resources = @("server-release")

    Write-Host 'Python server bundled.' -ForegroundColor Green

    # Write modified config.
    # ⚠ BOM-LESS, ALWAYS. Windows PowerShell 5.1's `Set-Content -Encoding UTF8` writes a
    #   UTF-8 BOM; Tauri's Rust build script then dies with "unable to parse JSON Tauri
    #   config file ... expected value at line 1 column 1" (measured 2026-11-06 while
    #   building 4.8.3). PowerShell 7 does NOT add the BOM, which is why this only bites
    #   on 5.1. Same rule as Set-Version.ps1: read AND write with one explicit codec.
    $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($tauriConfigPath, ($configObject | ConvertTo-Json -Depth 10), $Utf8NoBom)

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
        # `throw`, not `exit`: exit would skip the finally block and leave the tree
        # holding a REBRANDED tauri.conf.json with a BOM. Measured 2026-11-06 — a
        # failed 4.8.3 build left 133 lines of spurious diff behind.
        throw "Build failed - MSI not produced at: $tauriMsiSource"
    }
    Write-Host "Tauri build finished - MSI produced."
}
finally {
    # ⚠ ALWAYS restore, success OR failure. Byte-exact and BOM-less: the source
    #   file is read with -Raw (its own CRLF preserved) and written back through
    #   one explicit codec. The old `Set-Content -Encoding UTF8` added a BOM and
    #   made a whitespace-only diff reappear on every build (the trap documented
    #   in the repo-commit skill).
    Write-Host "Restoring tauri.conf.json..." -ForegroundColor Gray
    $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($tauriConfigPath, $originalConfig, $Utf8NoBom)

    # Remove any server-modules debris
    $bundleDir = Join-Path -Path $webDir -ChildPath 'server-modules'
    if (Test-Path $bundleDir) { Remove-Item -Path $bundleDir -Recurse -Force }

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
