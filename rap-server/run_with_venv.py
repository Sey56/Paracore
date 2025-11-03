import os
import sys
import subprocess

# Get the absolute path to the rap-server directory
rap_server_dir = os.path.dirname(os.path.abspath(__file__))

# Construct the path to the virtual environment's activate script
venv_activate = os.path.join(rap_server_dir, ".venv", "Scripts", "activate.bat")

# Construct the command to activate the venv and run the server
command = f'call "{venv_activate}" && uvicorn server.main:app --reload'

# Run the command
subprocess.run(command, shell=True, cwd=rap_server_dir)
