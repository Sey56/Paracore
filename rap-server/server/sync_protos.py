import subprocess
import os
import shutil
import sys

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

    # 2. Copy to VS Code Extension
    print(f"🚚 Copying proto to VS Code extension...")
    if not os.path.exists(vscode_proto_dir):
        print(f"📂 Creating directory: {vscode_proto_dir}")
        os.makedirs(vscode_proto_dir)
        
    shutil.copy2(proto_file, os.path.join(vscode_proto_dir, "corescript.proto"))
    print(f"✅ Copied corescript.proto to {vscode_proto_dir}")
    print(f"--- ✨ Sync Complete ---")

if __name__ == "__main__":
    sync_protos()
