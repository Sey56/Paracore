import os
import shutil
import glob
import logging
import json

def migrate_scripts_to_v3(script_source_path: str):
    """
    Migrates scripts from V2 (flat folder) to V3 (Script Projects).
    """
    try:
        if not os.path.exists(script_source_path):
            return

        # 1. Migrate standalone .cs files to Script Project folders
        for cs_file in os.listdir(script_source_path):
            if not cs_file.lower().endswith(".cs"): continue
            if cs_file.lower() == "globals.cs": continue
            
            cs_file_full = os.path.join(script_source_path, cs_file)
            if not os.path.isfile(cs_file_full): continue

            script_name = cs_file.replace(".cs", "")
            project_dir = os.path.join(script_source_path, script_name)
            scripts_dir = os.path.join(project_dir, "Scripts")
            
            os.makedirs(scripts_dir, exist_ok=True)
            shutil.move(cs_file_full, os.path.join(scripts_dir, cs_file))
            logging.info(f"Migrated standalone script to project: {script_name}")

        # 2. Migrate legacy folders to unified Script Project folders
        for folder in os.listdir(script_source_path):
            folder_path = os.path.join(script_source_path, folder)
            if not os.path.isdir(folder_path): continue
            if folder.startswith('.'): continue
            
            scripts_dir = os.path.join(folder_path, "Scripts")
            if not os.path.exists(scripts_dir):
                os.makedirs(scripts_dir, exist_ok=True)
                
                for item in os.listdir(folder_path):
                    item_path = os.path.join(folder_path, item)
                    if os.path.isfile(item_path) and item.lower().endswith(".cs"):
                        shutil.move(item_path, os.path.join(scripts_dir, item))
                
                logging.info(f"Migrated legacy folder to project: {folder}")

        # 3. Centralize .gitignore at Pack root
        from .script_service import _ensure_pack_gitignore
        _ensure_pack_gitignore(script_source_path)

    except Exception as e:
        logging.error(f"Migration error: {e}")
