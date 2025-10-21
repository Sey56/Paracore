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

# --- Banner ---
Write-Host '=================================' -ForegroundColor Cyan
Write-Host '   Building RAP Installer   '
Write-Host '=================================' -ForegroundColor Cyan

# --- 1. Build rap-web (Tauri) ---
Write-Host "`n[1/2] Building rap-web..."
Push-Location $webDir

# --- Compile Python Server (Conditional Build) ---
$tauriConfigPath = 'src-tauri\tauri.conf.json'
$originalConfig = Get-Content -Path $tauriConfigPath -Raw
$configObject = $originalConfig | ConvertFrom-Json

if ($Release) {
    # --- RELEASE BUILD: Standalone Executable (Slow) ---
    Write-Host "Compiling Python server into a standalone distribution (Release Mode)..." -ForegroundColor Yellow
    Push-Location (Join-Path -Path $ProjectRoot -ChildPath 'rap-server')
    . \server\.venv\Scripts\Activate.ps1

    $distDir = "rap-server-dist"

    python -m nuitka --standalone --onefile --windows-console-mode=disable `
        --output-dir=$distDir `
        --output-filename=bootstrap `
        --include-package=server `
        bootstrap.py

    Pop-Location
    Write-Host 'Python server has been compiled for release.' -ForegroundColor Green

    # Configure Tauri to bundle the standalone distribution
    if (-not ($configObject.tauri.bundle.PSObject.Properties.Name -contains 'resources')) {
        Add-Member -InputObject $configObject.tauri.bundle -MemberType NoteProperty -Name 'resources' -Value $null
    }
    $configObject.tauri.bundle.resources = @("../../rap-server/$distDir")
    $configObject | ConvertTo-Json -Depth 10 | Set-Content -Path $tauriConfigPath
}
else {
    try {
    # --- DEVELOPMENT BUILD: Embeddable Python (Fast) ---
    Write-Host "Embeddable Python environment prepared for fast build."

    $webDir = Join-Path -Path $ProjectRoot -ChildPath 'rap-web'
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

    # Configure Tauri to bundle the server-modules directory
    if (-not ($configObject.tauri.bundle.PSObject.Properties.Name -contains 'resources')) {
        Add-Member -InputObject $configObject.tauri.bundle -MemberType NoteProperty -Name 'resources' -Value $null
    }
    $configObject.tauri.bundle.resources = @("../server-modules")
    $configObject | ConvertTo-Json -Depth 10 | Set-Content -Path $tauriConfigPath

        Write-Host 'Embeddable Python environment created for fast build.' -ForegroundColor Green

        # --- Build the Tauri App ---
        Write-Host "Running npx tauri build with 'bundle-server' feature..."
        npx tauri build --features "bundle-server" --debug
        Write-Host "Tauri build finished."
    }
finally {
    # --- Cleanup ---
    Write-Host "Restoring original tauri.conf.json..."
    Set-Content -Path $tauriConfigPath -Value $originalConfig
}
}

if ($Release) {
    Remove-Item -Path (Join-Path -Path $ProjectRoot -ChildPath "rap-server\$distDir") -Recurse -Force
}
else {
    Write-Host "Skipping removal of server-modules directory for inspection."
}


Pop-Location
Write-Host 'rap-web build complete.' -ForegroundColor Green

# --- Code Signing (Placeholder) ---
# For a production build, you must sign the executables to avoid antivirus issues.
# You will need a code signing certificate.
Write-Host "`n[INFO] Skipping code signing." # In a production build, these lines should be uncommented and configured.
# $certPath = "path\to\your\certificate.pfx"
# $certPassword = "your_password"

# $webExe = Join-Path -Path $ProjectRoot -ChildPath 'rap-web\src-tauri\target\release\RAP.exe'

# & "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe" sign /f $certPath /p $certPassword /t http://timestamp.digicert.com $webExe

# --- Define Output Directory based on Build Mode ---
$finalInstallDir = Join-Path -Path $ProjectRoot -ChildPath 'installers'

# Ensure the final destination directory is clean and exists
if (Test-Path $finalInstallDir) {
    Remove-Item -Path $finalInstallDir -Recurse -Force
}
New-Item -ItemType Directory -Path $finalInstallDir | Out-Null
Write-Host "Installer output will be placed in: $finalInstallDir" -ForegroundColor Yellow

# --- 2. Copy Tauri MSI to installers folder ---
Write-Host "`n[2/2] Copying Tauri MSI to installers folder..."

$buildMode = if ($Release) { 'release' } else { 'debug' }
$tauriMsiSource = Join-Path -Path $ProjectRoot -ChildPath "rap-web\src-tauri\target\$buildMode\bundle\msi\RAP_1.0.0_x64_en-US.msi"

$tauriMsiDestination = Join-Path -Path $finalInstallDir -ChildPath 'RAP_Installer.msi'
Copy-Item -Path $tauriMsiSource -Destination $tauriMsiDestination -Force
Write-Host "Tauri MSI Installer created at: $tauriMsiDestination" -ForegroundColor Yellow

Write-Host "`n=================================" -ForegroundColor Cyan
Write-Host '   Build Complete!   '
Write-Host '=================================' -ForegroundColor Cyan