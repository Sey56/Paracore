import os
import shutil
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

def migrate_folder_to_projects(folder_path: str) -> Dict[str, Any]:
    """
    V3 Architecture Refined:
    1. Loose .cs files in root -> FolderWithSameName/Scripts/File.cs
    2. Folders with .cs files in THEIR root -> Folder/Scripts/*.cs
    """
    if not os.path.isdir(folder_path):
        return {"success": False, "message": f"Path is not a directory: {folder_path}"}

    migrated_files = 0
    updated_folders = 0
    errors = []

    try:
        items = os.listdir(folder_path)
        
        # --- 1. Handle loose .cs files at the root of the Script Source ---
        cs_files = [f for f in items if f.endswith('.cs') and os.path.isfile(os.path.join(folder_path, f))]
        for cs_file in cs_files:
            project_name = os.path.splitext(cs_file)[0]
            source_file_path = os.path.join(folder_path, cs_file)
            project_dir = os.path.join(folder_path, project_name)
            scripts_dir = os.path.join(project_dir, "Scripts")

            try:
                os.makedirs(scripts_dir, exist_ok=True)
                # Move the loose file into its new Project/Scripts/ folder
                dest_file_path = os.path.join(scripts_dir, cs_file)
                shutil.move(source_file_path, dest_file_path)
                
                _write_project_gitignore(project_dir)
                migrated_files += 1
                logger.info(f"Migrated root file {cs_file} to project project.")
            except Exception as e:
                errors.append(f"Failed to migrate file {cs_file}: {str(e)}")

        # --- 2. Handle sub-folders (These are our Projects) ---
        # Refresh items after moves
        items = os.listdir(folder_path)
        for item in items:
            project_dir = os.path.join(folder_path, item)
            if not os.path.isdir(project_dir) or item.startswith('.') or item == "Scripts":
                continue
            
            # Check if this folder needs an internal 'Scripts' subfolder
            scripts_dir = os.path.join(project_dir, "Scripts")
            
            # If 'Scripts' doesn't exist, see if there are .cs files at the folder's root
            if not os.path.exists(scripts_dir):
                cs_files_in_project = [f for f in os.listdir(project_dir) if f.endswith('.cs')]
                if cs_files_in_project:
                    try:
                        os.makedirs(scripts_dir)
                        for f in cs_files_in_project:
                            shutil.move(os.path.join(project_dir, f), os.path.join(scripts_dir, f))
                        
                        _write_project_gitignore(project_dir)
                        updated_folders += 1
                        logger.info(f"Organized project folder {item} with internal Scripts subfolder.")
                    except Exception as e:
                        errors.append(f"Failed to update folder {item}: {str(e)}")
            else:
                # 'Scripts' already exists, just ensure .gitignore is present
                _write_project_gitignore(project_dir)

        return {
            "success": True,
            "message": "Migration successful.",
            "migrated_files": migrated_files,
            "updated_folders": updated_folders,
            "errors": errors
        }

    except Exception as e:
        logger.error(f"Migration crash: {e}")
        return {"success": False, "message": str(e)}

def _write_project_gitignore(project_dir: str):
    try:
        with open(os.path.join(project_dir, ".gitignore"), 'w') as f:
            f.write("# Paracore IDE Scaffolding\nbin/\nobj/\n*.csproj\nglobal.json\nGlobals.cs\n.editorconfig\n.github/\n")
    except: pass
