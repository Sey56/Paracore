# PowerShell Dev Startup Script for Paracore (Server + Frontend)
# Usage: .\dev.ps1 (from the paracore root directory)

$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$serverDir = Join-Path $root "rap-server\server"
$venvPython = Join-Path $serverDir ".venv\Scripts\python.exe"
$webDir = Join-Path $root "rap-web"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "       Starting Paracore Dev Environment     " -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan

if (-not (Test-Path $venvPython)) {
    Write-Host "[ERROR] Python venv not found at $venvPython" -ForegroundColor Red
    exit 1
}

# Launch both Server and Tauri dev concurrently in one terminal
& npx concurrently -n "SERVER,WEB" -c "green.bold,cyan.bold" --kill-others `
    "cd `"$serverDir`" && `"$venvPython`" -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload" `
    "npm --prefix `"$webDir`" run tauri dev"
