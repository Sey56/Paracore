# PowerShell Build Script for RAP Unified Installer
# This script automates the entire build and packaging process.

# Exit on any error
$ErrorActionPreference = 'Stop'

# --- Configuration ---
$ProjectRoot = Get-Location
$webDir = Join-Path -Path $ProjectRoot -ChildPath 'rap-web' # Moved definition here
# Note: Update this path if Inno Setup is installed elsewhere.
$InnoSetupCompiler = 'C:\ Program Files (x86)\Inno Setup 6\ISCC.exe'
$InstallerScript = Join-Path -Path $ProjectRoot -ChildPath 'RAP_Installer.iss'

# --- Banner ---
Write-Host '=================================' -ForegroundColor Cyan
Write-Host '   Building RAP Unified Installer   '
Write-Host '=================================' -ForegroundColor Cyan

# --- 1. Prerequisite Check ---
Write-Host "`n[1/5] Checking for prerequisites..."

# Find Inno Setup Compiler
$InnoSetupCompiler = $null

# 1. Try to find it in the system PATH
$InnoSetupCompiler = (Get-Command ISCC.exe -ErrorAction SilentlyContinue).Source

# 2. If not in PATH, check registry (All Users)
if (-not $InnoSetupCompiler) {
    $regPathLM = 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1'
    if (Test-Path $regPathLM) {
        $innoPath = (Get-ItemProperty -Path $regPathLM).'Inno Setup: App Path'
        $compilerPath = Join-Path -Path $innoPath -ChildPath 'ISCC.exe'
        if (Test-Path $compilerPath) {
            $InnoSetupCompiler = $compilerPath
        }
    }
}

# 3. If still not found, check registry (Current User)
if (-not $InnoSetupCompiler) {
    $regPathCU = 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Inno Setup 6_is1'
    if (Test-Path $regPathCU) {
        $innoPath = (Get-ItemProperty -Path $regPathCU).'Inno Setup: App Path'
        $compilerPath = Join-Path -Path $innoPath -ChildPath 'ISCC.exe'
        if (Test-Path $compilerPath) {
            $InnoSetupCompiler = $compilerPath
        }
    }
}

# 4. If still not found, exit with an error
if (-not $InnoSetupCompiler) {
    Write-Host "Error: Inno Setup Compiler (ISCC.exe) not found." -ForegroundColor Red
    Write-Host "Please install Inno Setup 6 from https://jrsoftware.org/isinfo.php and ensure it's in your PATH or installed to the default location." -ForegroundColor Red
    exit 1
}

Write-Host "Found Inno Setup Compiler at: $InnoSetupCompiler" -ForegroundColor Green

# --- 3. Build rap-server (PyInstaller) ---
Write-Host "`n[3/5] Packaging rap-server..."
$serverDir = Join-Path -Path $ProjectRoot -ChildPath 'rap-server'
Push-Location $serverDir

# Activate the virtual environment (path is relative to 'rap-server' dir)
. .\server\.venv\Scripts\Activate.ps1

# Install dependencies (including pyinstaller)
pip install -r server/requirements.txt

# Run pyinstaller from the parent directory
pyinstaller rap-server.spec

Pop-Location
Write-Host 'rap-server packaging complete.' -ForegroundColor Green

# Copy rap-server.exe to Tauri's target/debug and target/release directories
$rapServerExePath = Join-Path $serverDir "dist\rap-server\rap-server.exe"
$tauriDebugTargetDir = Join-Path $webDir "src-tauri\target\debug"
$tauriReleaseTargetDir = Join-Path $webDir "src-tauri\target\release"

New-Item -ItemType Directory -Path $tauriDebugTargetDir -ErrorAction SilentlyContinue | Out-Null
Copy-Item -Path $rapServerExePath -Destination (Join-Path $tauriDebugTargetDir "rap-server.exe") -Force
Write-Host "rap-server.exe copied to Tauri's debug directory for development."

New-Item -ItemType Directory -Path $tauriReleaseTargetDir -ErrorAction SilentlyContinue | Out-Null
Copy-Item -Path $rapServerExePath -Destination (Join-Path $tauriReleaseTargetDir "rap-server.exe") -Force
Write-Host "rap-server.exe copied to Tauri's release directory for bundling."

# --- 2. Build rap-web (Tauri) ---
Write-Host "`n[2/5] Building rap-web..."
$webDir = Join-Path -Path $ProjectRoot -ChildPath 'rap-web'
Push-Location $webDir
npm install
npm run build
npx tauri build
Pop-Location
Write-Host 'rap-web build complete.' -ForegroundColor Green

# --- 4. Build RServer.Addin (.NET) ---
Write-Host "`n[4/5] Building RServer.Addin..."
$addinDir = Join-Path -Path $ProjectRoot -ChildPath 'RServer.Addin'
$publishDir = Join-Path -Path $addinDir -ChildPath 'bin\Release\net8.0-windows\win-x64'
Push-Location $addinDir
# This command gathers all necessary DLLs for deployment.
dotnet publish -c Release -o $publishDir
Pop-Location
Write-Host 'RServer.Addin publish complete.' -ForegroundColor Green

<#
# --- Code Signing (Placeholder) ---
# For a production build, you must sign the executables to avoid antivirus issues.
# You will need a code signing certificate.
Write-Host "`n[INFO] Skipping code signing."
$certPath = "path\to\your\certificate.pfx"
$certPassword = "your_password"

$webExe = Join-Path -Path $ProjectRoot -ChildPath 'rap-web\src-tauri\target\release\RAP.exe'
$serverExe = Join-Path -Path $ProjectRoot -ChildPath 'rap-server\dist\rap-server.exe'

# signtool.exe sign /f $certPath /p $certPassword /t http://timestamp.digicert.com $webExe
# signtool.exe sign /f $certPath /p $certPassword /t http://timestamp.digicert.com $serverExe
#>

# --- 5. Compile Installers ---
Write-Host "`n[5/5] Compiling the installers with Inno Setup..."

$rapServerInstallerScript = Join-Path -Path $ProjectRoot -ChildPath 'rap_server_installer.iss'
$rserverAddinInstallerScript = Join-Path -Path $ProjectRoot -ChildPath 'rserver_addin_installer.iss'

& $InnoSetupCompiler $rapServerInstallerScript
& $InnoSetupCompiler $rserverAddinInstallerScript

# Copy Tauri MSI to install folder
$tauriMsiSource = Join-Path -Path $ProjectRoot -ChildPath 'rap-web\src-tauri\target\release\bundle\msi\RAP_1.0.0_x64_en-US.msi'
$tauriMsiDestination = Join-Path -Path $ProjectRoot -ChildPath 'install\RAP_Installer.msi' # Renaming for consistency
Copy-Item -Path $tauriMsiSource -Destination $tauriMsiDestination -Force
Write-Host "Tauri MSI Installer created at: $tauriMsiDestination" -ForegroundColor Yellow

Write-Host "`n=================================" -ForegroundColor Cyan
Write-Host '   Build Complete!   '
Write-Host '=================================' -ForegroundColor Cyan
$finalServerInstaller = Join-Path -Path $ProjectRoot -ChildPath 'install\RAP_Server_Installer.exe'
$finalAddinInstaller = Join-Path -Path $ProjectRoot -ChildPath 'install\RServer_Addin_Installer.exe'
Write-Host "RAP Server Installer created at: $finalServerInstaller" -ForegroundColor Yellow
Write-Host "RServer Addin Installer created at: $finalAddinInstaller" -ForegroundColor Yellow