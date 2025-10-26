#!/bin/bash
set -e
echo "--- Starting CoreScript Extension Build & Deployment ---"

# Navigate to the extension directory
cd corescript-vscode

# 🧪 Package VS Code extension
echo "📦 Packaging VS Code extension..."
# The 'yes' command is used to automatically answer 'yes' to any prompts from vsce
yes | vsce package

VSIX_FILE=$(find . -name "corescript-*.vsix" | head -n 1)
if [ -z "$VSIX_FILE" ]; then
  echo "❌ Could not find packaged .vsix file." >&2
  exit 1
fi
echo "✅ Extension packaged: $VSIX_FILE"

# 🔁 Uninstall and reinstall extension
echo "🔁 Installing VS Code extension..."
EXTENSION_ID=$(node -e "console.log(require('./package.json').publisher + '.' + require('./package.json').name)")
code --uninstall-extension "$EXTENSION_ID" || echo "ℹ️ Previous extension not found or skipped."
code --install-extension "$VSIX_FILE" --force
echo "✅ Extension installed."

# Return to the root directory
cd ..

echo "--- ✅ Build & Deployment Complete ---"
echo "
🚀 Next steps:
1. Restart VS Code if open.
2. Open your workspace folder.
3. Run: 'CoreScript: Initialize Workspace' from the Command Palette.
"