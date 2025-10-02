import os

# Get the current working directory
ROOT_DIR = os.getcwd()

# Folders to exclude
EXCLUDE_DIRS = {".git", "node_modules", "__pycache__", ".vscode", ".venv", "target", "icons"}

# Files to exclude
EXCLUDE_FILES = {".DS_Store", "Thumbs.db"}

def list_all_contents(base_path):
    for root, dirs, files in os.walk(base_path):
        # Skip excluded directories
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]

        # Print current folder
        rel_root = os.path.relpath(root, base_path)
        print(f"\n📁 {rel_root if rel_root != '.' else os.path.basename(base_path)}/")

        # Print files in current folder
        for file in sorted(files):
            if file not in EXCLUDE_FILES:
                print(f"   📄 {file}")

if __name__ == "__main__":
    list_all_contents(ROOT_DIR)