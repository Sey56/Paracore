import os
import json
import re
import argparse

def parse_metadata(content):
    """Parses the metadata block from the C# script content."""
    metadata = {}
    # Regex to find the C-style multiline comment block at the beginning of the file
    match = re.search(r'^\s*/\*(.*?)\*/', content, re.DOTALL)
    if not match:
        return None

    metadata_block = match.group(1)
    
    # Regex to find Key: Value pairs, also handles multi-line descriptions
    # It looks for a key ending with a colon, then captures everything until the next key
    pattern = re.compile(r'^\s*([\w\s]+):\s*(.*?)(?=\n\s*[\w\s]+:|$)', re.MULTILINE | re.DOTALL)
    
    for item in pattern.finditer(metadata_block):
        key = item.group(1).strip()
        value = item.group(2).strip()
        
        # Special handling for list-like fields
        if key in ['Categories', 'RelatedScripts']:
            metadata[key] = [v.strip() for v in value.split(',') if v.strip()]
        else:
            metadata[key] = value
            
    return metadata

def create_manifest(workspace_path: str, output_file: str):
    """Scans the workspace, parses metadata, and creates the manifest file."""
    manifest = []
    
    print(f"Starting scan in workspace: {workspace_path}")

    for root, _, files in os.walk(workspace_path):
        for file in files:
            if file.endswith('.cs'):
                file_path = os.path.join(root, file)
                relative_path = os.path.relpath(file_path, workspace_path).replace('\\', '/')
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                    
                    metadata = parse_metadata(content)
                    
                    if metadata and metadata.get('Description'): # Only include scripts with a description
                        manifest.append({
                            "filePath": relative_path,
                            "metadata": metadata
                        })
                        print(f"  [+] Parsed: {relative_path}")
                    else:
                        print(f"  [-] Skipped (no metadata): {relative_path}")

                except Exception as e:
                    print(f"  [!] Error parsing {relative_path}: {e}")

    # Write the manifest to the output file
    try:
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2)
        print(f"\nSuccessfully created manifest file at: {output_file}")
        print(f"Total scripts indexed: {len(manifest)}")

    except Exception as e:
        print(f"\n[!] Error writing manifest file: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate a script manifest from a workspace.")
    parser.add_argument(
        "--workspace", 
        required=True, 
        help="The absolute path to the script workspace directory."
    )
    parser.add_argument(
        "--output", 
        default="scripts_manifest.json", 
        help="The name of the output manifest file. It will be placed in the workspace directory."
    )
    args = parser.parse_args()
    
    output_path = os.path.join(args.workspace, args.output)
    
    create_manifest(args.workspace, output_path)
