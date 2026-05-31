param(
    [switch]$InstallDeps = $false
)

Write-Host "--- Building Paracore MCP Standalone Server ---" -ForegroundColor Cyan

$ServerDir = Join-Path $PSScriptRoot "rap-server\server"
Set-Location $ServerDir

# 1. Check for PyInstaller inside the virtual environment
$VenvPyInstaller = Join-Path $ServerDir ".venv\Scripts\pyinstaller.exe"

if (!(Test-Path $VenvPyInstaller)) {
    Write-Host "PyInstaller not found in the virtual environment. Installing via uv..." -ForegroundColor Yellow
    uv pip install pyinstaller
}

# 2. Build the executable using the virtual environment's PyInstaller
Write-Host "Compiling mcp_server.py into standalone executable..." -ForegroundColor Yellow
$RepoRoot = $PSScriptRoot
& $VenvPyInstaller --onefile --name paracore-mcp --paths . --hidden-import mcp --hidden-import mcp.server.fastmcp --hidden-import grpc --add-data "$RepoRoot\REPL_GUIDE.md;." --add-data "$RepoRoot\EXTENSION_METHODS.md;." mcp/mcp_server.py

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit $LASTEXITCODE
}

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
