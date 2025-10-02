#!/bin/bash
set -e
echo "--- Starting RServer Build & Deployment ---"

# 🧭 Project paths
ROOT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
RSERVER_ADDIN_PROJECT_DIR="$ROOT_DIR/RServer.Addin"
LIB_DIR="$ROOT_DIR/lib"
ADDIN_FILE_NAME="RServer.Addin.addin"
BUILD_OUTPUT_DIR="$RSERVER_ADDIN_PROJECT_DIR/bin/Debug/net8.0-windows/win-x64"
REVT_ADDINS_FOLDER="$HOME/AppData/Roaming/Autodesk/Revit/Addins/2025"
REVT_RSERVER_TARGET="$REVT_ADDINS_FOLDER/RServer"

# 🛠 .NET check
DOTNET_PATH=$(command -v dotnet)
if [ -z "$DOTNET_PATH" ]; then
  echo "❌ .NET SDK not found in PATH. Install .NET 8." >&2
  exit 1
fi

# 🔨 Build RServer.Addin
echo "🔧 Building RServer.Addin..."
pushd "$RSERVER_ADDIN_PROJECT_DIR" > /dev/null
"$DOTNET_PATH" build -c Debug
popd > /dev/null
echo "✅ RServer.Addin built."

# 📂 Deploy RServer.Addin DLLs
echo "🗂 Deploying RServer.Addin to Revit Addins folder..."
mkdir -p "$REVT_RSERVER_TARGET"
cp "$BUILD_OUTPUT_DIR"/* "$REVT_RSERVER_TARGET/"

# 🔐 Deploy .addin manifest outside the RServer folder
ADDIN_DEST="$REVT_ADDINS_FOLDER/$ADDIN_FILE_NAME"
if [ -f "$ROOT_DIR/$ADDIN_FILE_NAME" ]; then
  cp "$ROOT_DIR/$ADDIN_FILE_NAME" "$ADDIN_DEST"
  echo "✅ RServer manifest copied to Revit Addins folder."
else
  echo "⚠️  Warning: $ADDIN_FILE_NAME not found at repo root."
fi

# 🧹 Cleanup build artifacts (skip with --dev)
if [[ "$1" != "--dev" ]]; then
  echo "🧺 Cleaning up bin and obj folders..."
  rm -rf "$RSERVER_ADDIN_PROJECT_DIR/bin" "$RSERVER_ADDIN_PROJECT_DIR/obj"
else
  echo "🧼 Dev mode enabled — build artifacts preserved."
fi

echo "--- ✅ Build & Deployment Complete ---"
echo "
🚀 Next steps:
1. Restart VS Code if open.
2. Open your workspace folder.
3. Run: 'RevitScripting: Initialize Workspace' from the Command Palette.
4. Launch Revit — the RServer.Addin should be loaded and ready to receive scripts.
"