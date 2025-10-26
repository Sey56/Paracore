import os
import re
from collections import defaultdict

IGNORED_FOLDERS = {"bin", "obj", ".vs", ".git"}

def extract_structure_from_file(filepath):
    entries = []
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

            type_matches = re.findall(
                r'\b(public|internal|private|protected)?\s*(static)?\s*(class|interface)\s+(\w+)',
                content
            )
            for _, _, kind, name in type_matches:
                entries.append({
                    "type": kind,
                    "name": name,
                    "methods": []
                })

            method_matches = re.findall(
                r'\b(?:public|private|protected|internal|static|virtual|async|extern)?\s+(?:[\w<>\[\]]+\s+)+(\w+)\s*\(',
                content
            )
            for method in method_matches:
                if entries:
                    entries[-1]["methods"].append(method)
                else:
                    entries.append({
                        "type": "unknown",
                        "name": "Global/Unknown",
                        "methods": [method]
                    })

    except Exception:
        pass
    return entries

def list_project_structure(root_dir):
    folder_structure = defaultdict(list)

    for folder_name, _, files in os.walk(root_dir):
        rel_path = os.path.relpath(folder_name, root_dir)
        if any(part in rel_path.split(os.sep) for part in IGNORED_FOLDERS):
            continue

        for file in files:
            if file.endswith(".cs"):
                filepath = os.path.join(folder_name, file)
                structure = extract_structure_from_file(filepath)
                folder_structure[rel_path].extend(structure)

    project_name = os.path.basename(os.path.normpath(root_dir))
    print(f"[{project_name}] {os.path.abspath(root_dir)}")

    print("\n📦 Project Structure Overview")
    print("=============================")

    for folder, items in folder_structure.items():
        print(f"\n📁 Folder: {folder}")
        for item in items:
            print(f"• {item['type'].capitalize()}: {item['name']}")
            for method in item["methods"]:
                print(f"   ↳  {method}()")

project_root = os.path.dirname(__file__)
list_project_structure(project_root)