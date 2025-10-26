import os

for root, dirs, files in os.walk("."):
    for file in files:
        if file.endswith(".cs"):
            path = os.path.join(root, file)
            print(f"--- {path} ---")
            try:
                with open(path, "r", encoding="utf-8-sig") as f:
                    print(f.read())
            except Exception as e:
                print(f"Error reading file: {e}")