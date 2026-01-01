# Set-Version.ps1
# This script propagates the version from the root VERSION file to all projects.

$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = Split-Path -Parent $PSScriptRoot

$VersionPath = Join-Path $RootDir "VERSION"
if (-not (Test-Path $VersionPath)) {
    Write-Error "VERSION file not found at $VersionPath"
    exit 1
}

$Version = (Get-Content $VersionPath).Trim()
$VersionFourPart = "$Version.0"

Write-Host "Updating all projects to version $Version..." -ForegroundColor Cyan

# 1. Update package.json files
$PackageFiles = @(
    "rap-web/package.json",
    "corescript-vscode/package.json"
)

foreach ($file in $PackageFiles) {
    $path = Join-Path $RootDir $file
    if (Test-Path $path) {
        $content = Get-Content $path -Raw
        $newContent = $content -replace '"version":\s*"[^"]+"', "`"version`": `"$Version`""
        $newContent | Set-Content $path -NoNewline
        Write-Host "Updated $file"
    }
}

# 2. Update tauri.conf.json
$TauriPath = Join-Path $RootDir "rap-web/src-tauri/tauri.conf.json"
if (Test-Path $TauriPath) {
    $content = Get-Content $TauriPath -Raw
    $newContent = $content -replace '"version":\s*"[^"]+"', "`"version`": `"$Version`""
    $newContent | Set-Content $TauriPath -NoNewline
    Write-Host "Updated rap-web/src-tauri/tauri.conf.json"
}

# 3. Update C# Project Files (.csproj)
# We update <AssemblyVersion> and <FileVersion>
$CsprojFiles = Get-ChildItem -Path $RootDir -Recurse -Filter *.csproj | Where-Object { $_.FullName -notmatch "node_modules|bin|obj" }
foreach ($file in $CsprojFiles) {
    $content = Get-Content $file.FullName -Raw
    $newContent = $content
    
    if ($content -match "<AssemblyVersion>") {
        $newContent = $newContent -replace '<AssemblyVersion>[^<]+</AssemblyVersion>', "<AssemblyVersion>$VersionFourPart</AssemblyVersion>"
    }
    if ($content -match "<FileVersion>") {
        $newContent = $newContent -replace '<FileVersion>[^<]+</FileVersion>', "<FileVersion>$VersionFourPart</FileVersion>"
    }
    
    if ($content -ne $newContent) {
        $newContent | Set-Content $file.FullName -NoNewline
        Write-Host "Updated $($file.Name)"
    }
}

# 4. Update Inno Setup (.iss) Files
$IssFiles = Get-ChildItem -Path $RootDir -Filter *.iss
foreach ($file in $IssFiles) {
    $content = Get-Content $file.FullName -Raw
    $newContent = $content
    
    # Update defines
    $newContent = $newContent -replace '#define MyAppVersion\s*"[^"]+"', "#define MyAppVersion `"$Version`""
    $newContent = $newContent -replace 'AppVersion=[^\r\n]+', "AppVersion=$Version"
    
    # Update VersionInfo
    $newContent = $newContent -replace 'VersionInfoVersion=[^\r\n]+', "VersionInfoVersion=$Version"
    $newContent = $newContent -replace 'VersionInfoTextVersion=[^\r\n]+', "VersionInfoTextVersion=$Version"
    
    if ($content -ne $newContent) {
        $newContent | Set-Content $file.FullName -NoNewline
        Write-Host "Updated $($file.Name)"
    }
}

# 5. Update UI Components (TopBar.tsx)
$TopBarPath = Join-Path $RootDir "rap-web/src/components/layout/TopBar/TopBar.tsx"
if (Test-Path $TopBarPath) {
    $content = Get-Content $TopBarPath -Raw
    $newContent = $content -replace '<span className="text-gray-600 dark:text-gray-400">[^<]+</span>', "<span className=`"text-gray-600 dark:text-gray-400`">$Version</span>"
    $newContent | Set-Content $TopBarPath -NoNewline
    Write-Host "Updated TopBar.tsx"
}

# 6. Update Primary Scripts or Docs
$MiscFiles = @(
    "RAP-installer.ps1",
    "README.md",
    "DEVELOPMENT.md",
    "Paracore-Scripts/README.md"
)

foreach ($file in $MiscFiles) {
    $path = Join-Path $RootDir $file
    if (Test-Path $path) {
        $content = Get-Content $path -Raw
        # Generic replacement for common version patterns
        $newContent = $content -replace '(v)?1\.1\.[0123](?!\d)', ('$1' + $Version)
        
        if ($content -ne $newContent) {
            $newContent | Set-Content $path -NoNewline
            Write-Host "Updated $file"
        }
    }
}

Write-Host "Version sync complete!" -ForegroundColor Green
