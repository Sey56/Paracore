import asyncio
import logging
import os
import subprocess

from database_config import SessionLocal

import models

logger = logging.getLogger("paracore-git-sync")
logger.setLevel(logging.INFO)

# Config
SYNC_INTERVAL_SECONDS = 300  # 5 minutes

if os.name == 'nt':
    CREATE_NO_WINDOW = 0x08000000
else:
    CREATE_NO_WINDOW = 0

async def start_git_sync_loop():
    """
    Background loop that periodically syncs all registered Git workspaces.
    """
    logger.info("Starting Git Sync Background Service...")
    while True:
        try:
            await sync_all_workspaces()
        except Exception as e:
            logger.error(f"Error in Git Sync loop: {e}")

        await asyncio.sleep(SYNC_INTERVAL_SECONDS)

async def sync_all_workspaces():
    """
    Iterates through all workspaces in the database and performs a Git pull/push.
    """
    db = SessionLocal()
    try:
        all_paths = set()

        # 1. Local Workspaces (Cloned Repos)
        local_workspaces = db.query(models.Workspace).all()
        for w in local_workspaces:
            if os.path.isdir(w.path):
                all_paths.add(w.path)

        # 2. Custom Script Folders (Private User Repos)
        import json
        settings = db.query(models.UserSetting).filter(models.UserSetting.setting_key == "custom_script_folders").all()
        for s in settings:
            try:
                folders = json.loads(s.setting_value)
                for folder in folders:
                    if os.path.isdir(folder):
                        all_paths.add(folder)
            except:
                continue

        for path in all_paths:
            if os.path.exists(os.path.join(path, ".git")):
                logger.info(f"Checking sync for repo at: {path}")
                sync_result = sync_repo(path)
                if sync_result and "Error" not in sync_result and "up to date" not in sync_result:
                    logger.info(f"Sync result for {path}: {sync_result}")

    finally:
        db.close()

def sync_repo(repo_path: str) -> str:
    """
    Performs a Git sync (Pull w/ rebase + Commit/Push if needed).
    """
    try:
        # 1. Pull latest changes
        pull_cmd = ["git", "pull", "--rebase"]
        subprocess.run(pull_cmd, cwd=repo_path, check=True, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW)

        # 2. Check for local changes
        status_cmd = ["git", "status", "--porcelain"]
        status_result = subprocess.run(status_cmd, cwd=repo_path, check=True, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW)

        if status_result.stdout.strip():
            logger.info(f"Local changes detected in {repo_path}. Committing...")
            # 3. Add and Commit
            subprocess.run(["git", "add", "."], cwd=repo_path, check=True, creationflags=CREATE_NO_WINDOW)
            subprocess.run(["git", "commit", "-m", "Auto-sync from Paracore Agent"], cwd=repo_path, check=True, creationflags=CREATE_NO_WINDOW)

            # 4. Push
            subprocess.run(["git", "push"], cwd=repo_path, check=True, capture_output=True, text=True, creationflags=CREATE_NO_WINDOW)
            return "Pulled and Pushed local changes."

        return "Already up to date."

    except subprocess.CalledProcessError as e:
        err_msg = e.stderr or str(e)
        # Avoid logging "nothing to commit" as an error if it somehow happens
        if "nothing to commit" in err_msg:
             return "Already up to date."
        logger.warning(f"Git sync failed for {repo_path}: {err_msg}")
        return f"Error: {err_msg}"
    except Exception as e:
        logger.error(f"Unexpected error syncing {repo_path}: {e}")
        return f"Error: {str(e)}"
