# PowerShell Build Script for RAP Installer

# Define script parameters
param(
    [switch]$Release
)

# Exit on any error
$ErrorActionPreference = 'Stop'

# --- Configuration ---
$ProjectRoot = Get-Location
$webDir = Join-Path -Path $ProjectRoot -ChildPath 'rap-web'
$distDir = "rap-server-dist" # Define distDir at a higher scope

# --- Auto-Sync Version ---
$VersionFile = Join-Path $ProjectRoot "VERSION"
if (-not (Test-Path $VersionFile)) {
    Write-Error "CRITICAL: VERSION file not found at $VersionFile"
    exit 1
}
$Version = (Get-Content $VersionFile).Trim()
$SyncScript = Join-Path $ProjectRoot "scripts" "Set-Version.ps1"

if (Test-Path $SyncScript) {
    Write-Host "Syncing versions to $Version..." -ForegroundColor Cyan
    & $SyncScript
} else {
    Write-Warning "Set-Version.ps1 not found, skipping auto-sync."
}

# --- Banner ---
Write-Host '=================================' -ForegroundColor Cyan
Write-Host '   Building Paracore Installer   '
Write-Host '=================================' -ForegroundColor Cyan

# --- Prerequisite Check ---
Write-Host "`n[0/2] Checking for prerequisites..."

# Check for uv
$uvCommand = Get-Command uv -ErrorAction SilentlyContinue
if (-not $uvCommand) {
    Write-Host "Error: 'uv' is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install uv from https://docs.astral.sh/uv/getting-started/installation/" -ForegroundColor Red
    Write-Host "Note: uv will automatically download Python 3.12+ if needed for the build." -ForegroundColor Yellow
    exit 1
}

Write-Host "Found uv at: $($uvCommand.Source)" -ForegroundColor Green

# --- 1. Build rap-web (Tauri) ---
Write-Host "`n[1/2] Building rap-web..."
Push-Location $webDir

# --- Compile Python Server (Conditional Build) ---
# Use absolute path to avoid issues in finally block
$tauriConfigPath = Join-Path -Path $webDir -ChildPath 'src-tauri\tauri.conf.json'
$originalConfig = Get-Content -Path $tauriConfigPath -Raw
$configObject = $originalConfig | ConvertFrom-Json

try {
    # --- Rebrand to Paracore ---
    Write-Host "Rebranding application to 'Paracore' for this build..." -ForegroundColor Yellow
    $configObject.package.productName = "Paracore"
    $configObject.tauri.bundle.identifier = "com.paracore.dev"

    if ($Release) {
        # --- RELEASE BUILD: Standalone Executable (Slow) ---
        Write-Host "Compiling Python server into a standalone distribution (Release Mode)..." -ForegroundColor Yellow
        Push-Location (Join-Path -Path $ProjectRoot -ChildPath 'rap-server')
        
        # Add 'server' directory to PYTHONPATH so Nuitka can find 'main' module
        $env:PYTHONPATH = (Join-Path -Path (Get-Location) -ChildPath 'server')

        $nuitkaArgs = @(
            "run",
            "--project", "server",
            "python",
            "-m", "nuitka",
            "--standalone",
            "--windows-console-mode=disable",
            "--nofollow-import-to=sqlalchemy.dialects.mysql",
            "--nofollow-import-to=sqlalchemy.dialects.postgresql",
            "--nofollow-import-to=sqlalchemy.dialects.oracle",
            "--nofollow-import-to=sqlalchemy.dialects.mssql",
            "--nofollow-import-to=nuitka",
            "--nofollow-import-to=markdown",
            "--include-package=langchain_core",
            "--include-package=langgraph",
            "--include-module=main",
            "--output-dir=$distDir",
            "--output-filename=bootstrap",
            "bootstrap.py"
        )
        
        # Use 'uv' to run the command in the project environment
        uv @nuitkaArgs
        
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Nuitka compilation failed with exit code $LASTEXITCODE"
        }

        # Clean up PYTHONPATH
        $env:PYTHONPATH = ""

        Pop-Location
        Write-Host 'Python server has been compiled for release.' -ForegroundColor Green

        # Bundle the standalone server as a resource, bypassing the externalBin system
        $serverReleaseDir = Join-Path -Path $webDir -ChildPath 'src-tauri\server-release'
        if (Test-Path $serverReleaseDir) {
            Remove-Item -Path $serverReleaseDir -Recurse -Force
        }
        New-Item -ItemType Directory -Path $serverReleaseDir | Out-Null

        $nuitkaOutputDir = Join-Path -Path $ProjectRoot -ChildPath "rap-server\$distDir\bootstrap.dist"
        Copy-Item -Path (Join-Path $nuitkaOutputDir '*') -Destination $serverReleaseDir -Recurse

        # Copy the JWT key to the release folder as well, keeping the structure config.py expects
        # config.py looks for ../../rap-auth-server/server/jwt_public.pem relative to itself.
        # Nuitka layout can vary, but ensuring the file exists in the bundle is step 1.
        # We will place it in a 'rap-auth-server/server' folder inside the release dir.
        $releaseAuthDest = Join-Path -Path $serverReleaseDir -ChildPath 'rap-auth-server\server'
        New-Item -ItemType Directory -Path $releaseAuthDest -Force | Out-Null
        Copy-Item -Path "$ProjectRoot\rap-auth-server\server\jwt_public.pem" -Destination $releaseAuthDest -Force

        # Configure Tauri to bundle the server-release directory
        if (-not ($configObject.tauri.bundle.PSObject.Properties.Name -contains 'resources')) {
            Add-Member -InputObject $configObject.tauri.bundle -MemberType NoteProperty -Name 'resources' -Value $null
        }
        if (-not ($configObject.tauri.bundle.PSObject.Properties.Name -contains 'externalBin')) {
            Add-Member -InputObject $configObject.tauri.bundle -MemberType NoteProperty -Name 'externalBin' -Value @()
        }
        $configObject.tauri.bundle.externalBin = @() # Ensure externalBin is empty
        $configObject.tauri.bundle.resources = @("server-release")
    }
    else {
        # --- DEVELOPMENT BUILD: Embeddable Python (Fast) ---
        Write-Host "Embeddable Python environment prepared for fast build."

        $assetsDir = Join-Path -Path $webDir -ChildPath 'src-tauri\assets'

        # Create a clean 'server-modules' directory inside 'rap-web' for bundling
        $bundleDir = Join-Path -Path $webDir -ChildPath 'server-modules'
        if (Test-Path $bundleDir) {
            Remove-Item -Path $bundleDir -Recurse -Force
        }
        New-Item -ItemType Directory -Path $bundleDir | Out-Null

        # 1. Unzip the official Python embeddable package.
        $embeddableZip = Join-Path -Path $assetsDir -ChildPath 'python-3.12.3-embed-amd64.zip'
        Write-Host "Unzipping $embeddableZip to create a portable Python environment..."
        Expand-Archive -Path $embeddableZip -DestinationPath $bundleDir -Force

        # 2. Enable site-packages in the embeddable distribution by uncommenting 'import site'.
        $pthFile = Join-Path -Path $bundleDir -ChildPath 'python312._pth'
        $correctPthContent = @"
python312.zip
.
Lib
Lib/site-packages
import site
"@
        Set-Content -Path $pthFile -Value $correctPthContent -Force

        # 3. Install pip from a local script.
        $pythonExe = Join-Path -Path $bundleDir -ChildPath 'python.exe'
        $getPipScript = Join-Path -Path $assetsDir -ChildPath 'get-pip.py'
        if (-not (Test-Path $getPipScript)) {
            Write-Host "get-pip.py not found locally, downloading..." -ForegroundColor Yellow
            Invoke-WebRequest -Uri 'https://bootstrap.pypa.io/get-pip.py' -OutFile $getPipScript
        }
        & $pythonExe $getPipScript

        # Define pipExe here, after pip is installed by get-pip.py
        $pipExe = Join-Path -Path $bundleDir -ChildPath 'Scripts\pip.exe'

        Write-Host "Upgrading pip, setuptools, and wheel in embeddable environment..."
        & $pipExe install --upgrade pip setuptools wheel

        # 4. Install dependencies from local wheels.
        $wheelsDir = Join-Path -Path $assetsDir -ChildPath 'wheels'
        $requirementsFile = Join-Path -Path $assetsDir -ChildPath 'requirements.txt'

        Write-Host "Wheels directory: $wheelsDir"
        Get-ChildItem -Path $wheelsDir

        Write-Host "Running pip install with requirements.txt..."
        & $pipExe install --verbose --no-warn-script-location --no-index --find-links $wheelsDir -r $requirementsFile

        Write-Host "Contents of site-packages after install:"
        Get-ChildItem -Path "$bundleDir\Lib\site-packages"

        # 5. Copy the application scripts
        $serverSourceDir = Join-Path -Path $ProjectRoot -ChildPath 'rap-server'
        Write-Host "Copying application source from $serverSourceDir to $bundleDir..."
        Copy-Item -Path (Join-Path $serverSourceDir "run_server.py") -Destination $bundleDir
        robocopy (Join-Path $serverSourceDir "server") (Join-Path $bundleDir "server") /E /XD .venv __pycache__

        # 6. Copy the RAP Auth Server public key (Crucial for generic "relative path" config)
        $authServerSource = Join-Path -Path $ProjectRoot -ChildPath 'rap-auth-server\server'
        $authServerDest = Join-Path -Path $bundleDir -ChildPath 'rap-auth-server\server'
        if (-not (Test-Path $authServerDest)) {
            New-Item -ItemType Directory -Path $authServerDest -Force | Out-Null
        }
        $jwtKeyPath = Join-Path -Path $authServerSource -ChildPath 'jwt_public.pem'
        
        if (Test-Path $jwtKeyPath) {
             Write-Host "Copying jwt_public.pem to bundle..."
             Copy-Item -Path $jwtKeyPath -Destination $authServerDest -Force
        } else {
             Write-Warning "jwt_public.pem not found at $jwtKeyPath. The installed app may fail to authenticate tokens."
        }

        # Configure Tauri to bundle the server-modules directory
        if (-not ($configObject.tauri.bundle.PSObject.Properties.Name -contains 'resources')) {
            Add-Member -InputObject $configObject.tauri.bundle -MemberType NoteProperty -Name 'resources' -Value $null
        }
        $configObject.tauri.bundle.resources = @("../server-modules")

        Write-Host 'Embeddable Python environment created for fast build.' -ForegroundColor Green
    }

    # Write the modified config to disk before building
    $configObject | ConvertTo-Json -Depth 10 | Set-Content -Path $tauriConfigPath

    # --- Build the Tauri App (COMMON STEP) ---
    if ($Release) {
        Write-Host "Running npx tauri build for RELEASE..." -ForegroundColor Cyan
        npx tauri build --features "bundle-server"
    } else {
        Write-Host "Running npx tauri build with 'bundle-server' feature..."
        npx tauri build --features "bundle-server" --debug
    }
    Write-Host "Tauri build finished."
}
finally {
    # --- Cleanup ---
    Write-Host "Restoring original tauri.conf.json..."
    Set-Content -Path $tauriConfigPath -Value $originalConfig

    # Remove the server-modules directory after the build for development builds
    $bundleDir = Join-Path -Path $webDir -ChildPath 'server-modules'
    if (Test-Path $bundleDir) {
        Write-Host "Removing generated server-modules directory..." -ForegroundColor Yellow
        Remove-Item -Path $bundleDir -Recurse -Force
    }

    # Remove Nuitka build artifacts for release builds
    $nuitkaDistDir = Join-Path -Path $ProjectRoot -ChildPath "rap-server\$distDir"
    if (Test-Path $nuitkaDistDir) {
        Write-Host "Removing Nuitka build artifacts..." -ForegroundColor Yellow
        Remove-Item -Path $nuitkaDistDir -Recurse -Force
    }
}

Write-Host 'rap-web build complete.' -ForegroundColor Green

# --- Code Signing (Placeholder) ---
# For a production build, you must sign the executables to avoid antivirus issues.
# You will need a code signing certificate.
Write-Host "`n[INFO] Skipping code signing." # In a production build, these lines should be uncommented and configured.
# $certPath = "path\to\your\certificate.pfx"
# $certPassword = "your_password"

# $webExe = Join-Path -Path $ProjectRoot -ChildPath 'rap-web\src-tauri\target\release\Paracore.exe'

# & "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe" sign /f $certPath /p $certPassword /t http://timestamp.digicert.com $webExe
Pop-Location # Balance the Push-Location at the start of the script

# --- Define Output Directory based on Build Mode ---
$finalInstallDir = Join-Path -Path $ProjectRoot -ChildPath 'installers'

# Ensure the final destination directory exists
if (-not (Test-Path $finalInstallDir)) {
    New-Item -ItemType Directory -Path $finalInstallDir | Out-Null
}
Write-Host "Installer output will be placed in: $finalInstallDir" -ForegroundColor Yellow

# --- 2. Copy Tauri MSI to installers folder ---
Write-Host "`n[2/2] Copying Tauri MSI to installers folder..."

$buildMode = if ($Release) { 'release' } else { 'debug' }
$tauriMsiSource = Join-Path -Path $ProjectRoot -ChildPath "rap-web\src-tauri\target\$buildMode\bundle\msi\Paracore_$($Version)_x64_en-US.msi"

$tauriMsiDestination = Join-Path -Path $finalInstallDir -ChildPath "Paracore_Installer_v$($Version).msi"
Copy-Item -Path $tauriMsiSource -Destination $tauriMsiDestination -Force
Write-Host "Paracore MSI Installer created at: $tauriMsiDestination" -ForegroundColor Yellow

Write-Host "`n=================================" -ForegroundColor Cyan
Write-Host '   Build Complete!   '
Write-Host '=================================' -ForegroundColor Cyan
