#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

echo "Building rap-server executable with PyInstaller..."

# Navigate to the rap-server directory
cd rap-server

# Create a virtual environment and activate it
echo "Creating and activating virtual environment..."
python -m venv .venv
source .venv/Scripts/activate # For Windows Git Bash/WSL. Use `source .venv/bin/activate` for Linux/macOS.

# Install dependencies
echo "Installing Python dependencies..."
pip install -r server/requirements.txt

# Run PyInstaller
echo "Running PyInstaller..."
# --hidden-import for modules that PyInstaller might miss
# --add-data for non-Python files and directories
pyinstaller \
    --name rap-server \
    --onefile \
    --windowed \
    --hidden-import "uvicorn.protocols.http.h11_impl" \
    --hidden-import "uvicorn.protocols.websockets.ws_impl" \
    --hidden-import "uvicorn.protocols.websockets.wsproto_impl" \
    --add-data "server:server" \
    --add-data "server/api:server/api" \
    --add-data "server/protos:server/protos" \
    run.py

echo "PyInstaller build complete. Executable should be in rap-server/dist/"

# Deactivate virtual environment
deactivate
