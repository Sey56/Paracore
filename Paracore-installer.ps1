# PowerShell Build Script for Paracore.Addin Installer

# Exit on any error
$ErrorActionPreference = 'Stop'

# --- Configuration ---
$ProjectRoot = Get-Location

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
Write-Host '   Building Paracore Addin Installer   '
Write-Host '=================================' -ForegroundColor Cyan

# --- 1. Prerequisite Check ---
Write-Host "`n[1/3] Checking for prerequisites..."

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

# --- 2. Build RServer.Addin (.NET) ---
Write-Host "`n[2/3] Building Paracore.Addin..."
$addinDir = Join-Path -Path $ProjectRoot -ChildPath 'Paracore.Addin'
$publishDir = Join-Path -Path $addinDir -ChildPath 'bin\Release\net8.0-windows\win-x64'
Push-Location $addinDir

# Clean previous builds to ensure no stale DLLs (like RServer.Addin.dll) remain
Write-Host "Cleaning previous builds..." -ForegroundColor Cyan
dotnet clean -c Release
if (Test-Path $publishDir) {
    Remove-Item -Path $publishDir -Recurse -Force
}

# This command gathers all necessary DLLs for deployment.
# We use default publish path to avoid RID/framework conflicts with -o flag in some environments
dotnet publish -c Release

# Dynamically resolve the actual publish directory
$resolvedPublishDir = Get-ChildItem -Path "$addinDir\bin\Release" -Recurse -Filter "Paracore.Addin.dll" | 
                      Where-Object { $_.FullName -match 'publish' } | 
                      Select-Object -First 1 -ExpandProperty DirectoryName

if (-not $resolvedPublishDir -or -not (Test-Path (Join-Path $resolvedPublishDir "Paracore.Addin.addin"))) {
    Write-Host "Error: Could not find valid publish directory or .addin manifest." -ForegroundColor Red
    Pop-Location
    exit 1
}

Write-Host "Resolved Publish Directory: $resolvedPublishDir" -ForegroundColor Cyan
Pop-Location
Write-Host 'Paracore.Addin publish complete.' -ForegroundColor Green

# --- Code Signing (Placeholder) ---
# For a production build, you must sign the executables to avoid antivirus issues.
# You will need a code signing certificate.
Write-Host "`n[INFO] Skipping code signing." # In a production build, these lines should be uncommented and configured.
# $certPath = "path\to\your\certificate.pfx"
# $certPassword = "your_password"

# $serverExe = Join-Path -Path $ProjectRoot -ChildPath 'rap-server\dist\rap-server.exe'

# & "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe" sign /f $certPath /p $certPassword /t http://timestamp.digicert.com $serverExe

# --- Define Output Directory ---
$finalInstallDir = Join-Path -Path $ProjectRoot -ChildPath 'installers'

# Ensure the final destination directory exists
if (-not (Test-Path $finalInstallDir)) {
    New-Item -ItemType Directory -Path $finalInstallDir | Out-Null
}
Write-Host "Installer output will be placed in: $finalInstallDir" -ForegroundColor Yellow

# --- 3. Compile Installer ---
Write-Host "`n[3/3] Compiling the installer with Inno Setup..."

$rserverAddinInstallerScript = Join-Path -Path $ProjectRoot -ChildPath 'Paracore_Installer.iss'
$iconPath = Join-Path -Path $ProjectRoot -ChildPath 'rap-web\src-tauri\icons\rap-icon.ico'
$appDataFolderName = 'Paracore-data'
# Pass defines to the Inno Setup script
& $InnoSetupCompiler "/O$finalInstallDir" "/dIconPath=$iconPath" "/dAppDataFolderName=$appDataFolderName" "/dPublishDir=$resolvedPublishDir" $rserverAddinInstallerScript

Write-Host "`n=================================" -ForegroundColor Cyan
Write-Host '   Build Complete!   '
Write-Host '=================================' -ForegroundColor Cyan
$finalAddinInstaller = Join-Path -Path $finalInstallDir -ChildPath "Paracore_Revit_Installer_v$($Version).exe"
Write-Host "Paracore Installer created at: $finalAddinInstaller" -ForegroundColor Yellow
