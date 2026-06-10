import subprocess
import os
import shutil
import sys
import json

def sync_protos():
    # Paths relative to this script (rap-server/server)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    proto_source_dir = os.path.abspath("../../protos")
    proto_file = os.path.join(proto_source_dir, "corescript.proto")
    output_dir = "."
    vscode_proto_dir = os.path.abspath("../../corescript-vscode/proto")
    
    print(f"--- 🛰️ Synchronizing Protos ---")
    
    if not os.path.exists(proto_file):
        print(f"❌ Error: Source proto file not found at {proto_file}")
        sys.exit(1)

    # 1. Regenerate Python Protos
    print(f"📦 Regenerating Python gRPC code...")
    cmd = [
        "python", "-m", "grpc_tools.protoc",
        f"-I{proto_source_dir}",
        f"--python_out={output_dir}",
        f"--grpc_python_out={output_dir}",
        f"--pyi_out={output_dir}",
        proto_file
    ]
    
    try:
        subprocess.run(cmd, check=True)
        print(f"✅ Python gRPC code regenerated in {output_dir}")
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to regenerate gRPC code: {e}")
        sys.exit(1)

    # 2. Copy Proto to VS Code Extension
    print(f"🚚 Copying proto to VS Code extension...")
    if not os.path.exists(vscode_proto_dir):
        print(f"📂 Creating directory: {vscode_proto_dir}")
        os.makedirs(vscode_proto_dir)

    shutil.copy2(proto_file, os.path.join(vscode_proto_dir, "corescript.proto"))
    print(f"✅ Copied corescript.proto to {vscode_proto_dir}")

    # 3. Sync AI Instructions to VS Code Extension
    print(f"🤖 Syncing AI instructions to VS Code extension...")
    ai_instructions_path = os.path.join(script_dir, "api", "ai_instructions.py")
    if os.path.exists(ai_instructions_path):
        # Extract the COPILOT_INSTRUCTIONS string from the Python file
        with open(ai_instructions_path, 'r', encoding='utf-8') as f:
            content = f.read()
        # Find the triple-quoted string
        start = content.find('"""')
        end = content.rfind('"""')
        if start != -1 and end != -1 and start != end:
            instructions = content[start+3:end]
        else:
            instructions = content

        # Write as TypeScript constant
        vscode_src = os.path.abspath("../../corescript-vscode/src")
        if not os.path.exists(vscode_src):
            os.makedirs(vscode_src)
        ts_path = os.path.join(vscode_src, "aiInstructions.ts")
        with open(ts_path, 'w', encoding='utf-8') as f:
            f.write('export const COPILOT_INSTRUCTIONS = ')
            f.write(json.dumps(instructions, ensure_ascii=False))
            f.write(';\n')
        print(f"✅ Synced aiInstructions.ts to {vscode_src}")
    else:
        print(f"⚠️  AI instructions source not found at {ai_instructions_path}")

    print(f"--- ✨ Sync Complete ---")

if __name__ == "__main__":
    sync_protos()
