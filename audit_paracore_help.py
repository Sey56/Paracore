import os
import re

# Comprehensive patterns for corruption detection
CORRUPTION_PATTERNS = [
    r'ðŸ', r'Ã°', r'âœ', r'ðŸŽ', r'ðŸ’', r'ðŸ“', r'ðŸš', r'ðŸŒ', r'â€¦', r'Ã¢', r'Ã©', r'Ã', r'Â', r'â€“'
]

# Supported metadata keys (strict)
VALID_METADATA = {
    'DocumentType', 'Categories', 'Author', 'Dependencies', 'Description', 'UsageExamples'
}

def audit_docs():
    docs_dir = 'paracore-help/docs'
    issues_found = 0
    
    print(f"--- Auditing {docs_dir} ---")
    
    for root, dirs, files in os.walk(docs_dir):
        for file in files:
            if file.endswith(('.md', '.mdx')):
                path = os.path.join(root, file)
                
                try:
                    with open(path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                except Exception as e:
                    print(f"[ERROR] Could not read {path}: {e}")
                    continue

                # 1. Check for Encoding Corruptions
                for pattern in CORRUPTION_PATTERNS:
                    if re.search(pattern, content):
                        print(f"[CORRUPTION] Found sequence matching '{pattern}' in: {path}")
                        issues_found += 1
                        break # Only report once per file

                # 2. Check for Invalid Metadata in Code Blocks
                # This regex looks for blocks like /* ... */ and extracts lines
                metadata_blocks = re.findall(r'/\*.*?\*/', content, re.DOTALL)
                for block in metadata_blocks:
                    lines = block.split('\n')
                    for line in lines:
                        if ':' in line and not line.strip().startswith('//') and not line.strip().startswith('* '):
                            key = line.split(':')[0].strip().replace('/*', '').replace('*', '').strip()
                            # Check if it looks like a metadata key (camel case or specific names)
                            if key and key[0].isupper() and key not in VALID_METADATA:
                                if key not in ['URL', 'HTTP', 'HTTPS', 'ID']: # Common false positives
                                    print(f"[METADATA] Invalid field '{key}' found in: {path}")
                                    issues_found += 1

                # 3. Check for Broken Internal Links
                # Matches [text](./link.md) or [text](../link.md)
                links = re.findall(r'\[.*?\]\((.*?\.(?:md|mdx))\)', content)
                for link in links:
                    if link.startswith('http'): continue
                    
                    # Resolve relative path
                    link_path = link.split('#')[0] # Remove anchors
                    target_dir = os.path.dirname(path)
                    absolute_target = os.path.abspath(os.path.join(target_dir, link_path))
                    
                    # Convert back to relative to root for existence check
                    rel_to_root = os.path.relpath(absolute_target, os.getcwd())
                    
                    if not os.path.exists(rel_to_root):
                        # Try swapping .md for .mdx or vice versa
                        alt_link = rel_to_root.replace('.mdx', '.md') if '.mdx' in rel_to_root else rel_to_root.replace('.md', '.mdx')
                        if not os.path.exists(alt_link):
                            print(f"[LINK] Broken link '{link}' found in: {path}")
                            issues_found += 1

    print(f"\n--- Audit Complete. Issues Found: {issues_found} ---")

if __name__ == "__main__":
    audit_docs()
