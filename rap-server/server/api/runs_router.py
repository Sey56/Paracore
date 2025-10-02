from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional, Dict
from datetime import datetime

from .. import models, schemas
from ..database_config import get_db
from ..utils import resolve_script_path
from ..auth import get_current_user, CurrentUser

router = APIRouter()

@router.get("/api/runs", response_model=List[schemas.ScriptRunResponse], tags=["runs"])
def get_runs(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves all script runs for the current user.
    """
    return db.query(models.ScriptRun).filter(models.ScriptRun.user_id == str(current_user.id)).order_by(models.ScriptRun.timestamp.desc()).all()

@router.get("/api/runs/latest", response_model=Dict[str, datetime], tags=["runs"])
def get_latest_runs(db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves the latest run timestamp for each script, keyed by script path.
    """
    # Subquery to get the latest timestamp for each script_id
    subquery = db.query(
        models.ScriptRun.script_id,
        func.max(models.ScriptRun.timestamp).label('max_timestamp')
    ).group_by(models.ScriptRun.script_id).subquery()

    # Join ScriptRun with the subquery to filter for the latest runs
    latest_runs_query = db.query(
        models.ScriptRun.script_id,
        models.ScriptRun.timestamp
    ).join(
        subquery,
        (models.ScriptRun.script_id == subquery.c.script_id) &
        (models.ScriptRun.timestamp == subquery.c.max_timestamp)
    ).subquery() # Make this a subquery as well to join with scripts

    # Join with the Script table to get the script path
    result = db.query(
        models.Script.path,
        latest_runs_query.c.timestamp
    ).join(
        latest_runs_query,
        models.Script.id == latest_runs_query.c.script_id
    ).all()

    return {path: timestamp for path, timestamp in result}


@router.get("/api/scripts/{script_path:path}/last_run", response_model=Optional[schemas.ScriptRunResponse], tags=["runs"])
def get_last_run(script_path: str, db: Session = Depends(get_db), current_user: CurrentUser = Depends(get_current_user)):
    """
    Retrieves the last run for a specific script.
    """
    # The script path from the client might not be in the exact format as stored in the DB.
    # We must resolve it to a canonical form before querying.
    try:
        # The utility function will handle normalization and check for file existence.
        # Note: This means a script must exist on disk to find its run history.
        resolved_path = resolve_script_path(script_path)
    except FileNotFoundError:
        # If the script file doesn't exist, it can't be the one in the DB.
        # This is a valid scenario for a script that has been moved or deleted.
        return None

    # Find the script in the database using the resolved path.
    script = db.query(models.Script).filter(models.Script.path == resolved_path).first()
    
    if not script:
        # If the script is not in our database, it has no runs.
        # This is not an error, it just means the script has never been indexed or run.
        return None

    # Query for the most recent run for that script.
    last_run = db.query(models.ScriptRun)\
        .filter(models.ScriptRun.script_id == script.id)\
        .order_by(models.ScriptRun.timestamp.desc())\
        .first()
    
    return last_run
