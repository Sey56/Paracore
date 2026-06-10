param(
    [switch]$InstallDeps = $false
)

Write-Host "--- Building Paracore MCP Standalone Server ---" -ForegroundColor Cyan

$ServerDir = Join-Path $PSScriptRoot "rap-server\server"
$BuildProjectDir = Join-Path $PSScriptRoot "rap-server\mcp-build"
$RepoRoot = $PSScriptRoot

# 1. Sync the isolated build project (its own pyproject.toml, own venv)
# fastmcp is isolated here so its griffelib dep never touches the rap-server venv.
Write-Host "Syncing MCP build environment..." -ForegroundColor Yellow
Push-Location $BuildProjectDir
uv sync 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "uv sync failed!" -ForegroundColor Red
    Pop-Location
    exit $LASTEXITCODE
}
$BuildPyInstaller = Join-Path $BuildProjectDir ".venv\Scripts\pyinstaller.exe"
Pop-Location

# 2. Build the executable using the build project's PyInstaller
Write-Host "Compiling mcp_server.py into standalone executable..." -ForegroundColor Yellow
Push-Location $ServerDir
& $BuildPyInstaller --onefile --name paracore-mcp --paths . `
    --exclude-module logfire `
    --hidden-import mcp `
    --hidden-import mcp.server.fastmcp `
    --hidden-import grpc `
    --hidden-import google.protobuf `
    --hidden-import google.protobuf.descriptor_pool `
    --hidden-import google.protobuf.runtime_version `
    --hidden-import google.protobuf.symbol_database `
    --hidden-import google.protobuf.internal.builder `
    --add-data "$RepoRoot\REPL_GUIDE.md;." `
    --add-data "$RepoRoot\EXTENSION_METHODS.md;." `
    mcp/mcp_server.py

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    Pop-Location
    exit $LASTEXITCODE
}
Pop-Location

# 3. Move to installers directory
$DistDir = Join-Path $PSScriptRoot "installers"
if (!(Test-Path $DistDir)) {
    New-Item -ItemType Directory -Path $DistDir | Out-Null
}

$ExePath = Join-Path $ServerDir "dist\paracore-mcp.exe"
$DestPath = Join-Path $DistDir "paracore-mcp.exe"

Write-Host "Copying executable to $DistDir..." -ForegroundColor Yellow
Copy-Item -Path $ExePath -Destination $DestPath -Force

Write-Host "--- Build Complete! ---" -ForegroundColor Green
Write-Host "Executable is ready at: $DestPath" -ForegroundColor Green
