param(
    [switch]$InstallDeps = $false,
    [switch]$TakeOff = $false,
    [switch]$Rebar = $false,
    [switch]$MEP = $false
)

# ── Determine which MCP to build ──────────────────────────────────────────

$mcpName = "paracore-mcp"
$entryPoint = "mcp/mcp_server.py"
$description = "Generalist Paracore MCP"

if ($TakeOff) {
    $mcpName = "paracore-takeoff"
    $entryPoint = "takeoff/takeoff_server.py"
    $description = "Paracore-TakeOff MCP"
}
elseif ($Rebar) {
    $mcpName = "paracore-rebar"
    $entryPoint = "rebar/rebar_server.py"
    $description = "Paracore-Rebar MCP"
}
elseif ($MEP) {
    $mcpName = "paracore-mep"
    $entryPoint = "mep/mep_server.py"
    $description = "Paracore-MEP MCP"
}

Write-Host "--- Building $description ---" -ForegroundColor Cyan
Write-Host "  Output: $mcpName.exe" -ForegroundColor Cyan
Write-Host "  Entry:  $entryPoint" -ForegroundColor Cyan

$ServerDir = Join-Path $PSScriptRoot "rap-server\server"
$BuildProjectDir = Join-Path $PSScriptRoot "rap-server\mcp-build"
$RepoRoot = $PSScriptRoot

# 1. Sync the isolated build project (its own pyproject.toml, own venv)
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

# 2. Build the executable
Write-Host "Compiling $entryPoint into standalone executable..." -ForegroundColor Yellow
Push-Location $ServerDir
& $BuildPyInstaller --onefile --name $mcpName --paths . `
    --exclude-module logfire `
    --hidden-import mcp `
    --hidden-import mcp.server.fastmcp `
    --hidden-import grpc `
    --hidden-import google.protobuf `
    --hidden-import google.protobuf.descriptor_pool `
    --hidden-import google.protobuf.runtime_version `
    --hidden-import google.protobuf.symbol_database `
    --hidden-import google.protobuf.internal.builder `
    --hidden-import mcp_core `
    --hidden-import mcp_core.prompts `
    --add-data "$RepoRoot\REPL_GUIDE.md;." `
    --add-data "$RepoRoot\EXTENSION_METHODS.md;." `
    $entryPoint

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    Pop-Location
    exit $LASTEXITCODE
}
Pop-Location

# 3. Move to installers directory
$DistDir = Join-Path $PSScriptRoot "installers"
if (!(Test-Path $DistDir)) { New-Item -ItemType Directory -Path $DistDir | Out-Null }

$ExePath = Join-Path $ServerDir "dist\$mcpName.exe"
$DestPath = Join-Path $DistDir "$mcpName.exe"

Write-Host "Copying executable to $DistDir..." -ForegroundColor Yellow
Copy-Item -Path $ExePath -Destination $DestPath -Force

Write-Host "--- Build Complete! ---" -ForegroundColor Green
Write-Host "Executable: $DestPath" -ForegroundColor Green
Write-Host ""
Write-Host "To install: copy $mcpName.exe to" -ForegroundColor Yellow
Write-Host "  %APPDATA%\paracore-data\mcp-servers\" -ForegroundColor Cyan
Write-Host "Then add to claude_desktop_config.json:" -ForegroundColor Yellow
Write-Host "  { ""command"": ""%APPDATA%\\paracore-data\\mcp-servers\\$mcpName.exe"", ""args"": [] }" -ForegroundColor Gray
