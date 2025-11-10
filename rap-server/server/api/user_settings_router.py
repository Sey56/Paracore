from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Any
import json

import models, schemas, auth
from database_config import get_db

router = APIRouter()

@router.get("/api/user-settings/custom_script_folders", response_model=schemas.CustomScriptFoldersSetting)
def get_custom_script_folders(
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    user_setting = db.query(models.UserSetting).filter(
        models.UserSetting.user_id == current_user.id,
        models.UserSetting.setting_key == "custom_script_folders"
    ).first()

    if not user_setting:
        # If not found, return a default empty list
        return schemas.CustomScriptFoldersSetting(
            id=0, # Dummy ID as it's not from DB
            user_id=current_user.id,
            setting_key="custom_script_folders",
            setting_value=[]
        )
    
    # Deserialize the value from JSON string to a list before returning
    user_setting.setting_value = json.loads(user_setting.setting_value)
    return user_setting

@router.post("/api/user-settings/custom_script_folders", response_model=schemas.CustomScriptFoldersSetting)
def set_custom_script_folders(
    setting_data: schemas.CustomScriptFoldersSetting,
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    # Ensure the setting_key in the body is correct
    if setting_data.setting_key != "custom_script_folders":
        raise HTTPException(status_code=400, detail="Invalid setting key in request body")

    user_setting = db.query(models.UserSetting).filter(
        models.UserSetting.user_id == current_user.id,
        models.UserSetting.setting_key == "custom_script_folders"
    ).first()

    # Serialize the list to a JSON string before saving
    serialized_value = json.dumps(setting_data.setting_value)

    if user_setting:
        user_setting.setting_value = serialized_value
    else:
        user_setting = models.UserSetting(
            user_id=current_user.id,
            setting_key="custom_script_folders",
            setting_value=serialized_value
        )
        db.add(user_setting)
    
    db.commit()
    db.refresh(user_setting)
    
    # Deserialize the value back to a list for the response model
    user_setting.setting_value = json.loads(user_setting.setting_value)
    return user_setting

@router.delete("/api/user-settings/custom_script_folders", status_code=status.HTTP_204_NO_CONTENT)
def delete_custom_script_folders(
    current_user: auth.CurrentUser = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    user_setting = db.query(models.UserSetting).filter(
        models.UserSetting.user_id == current_user.id,
        models.UserSetting.setting_key == "custom_script_folders"
    ).first()

    if user_setting:
        db.delete(user_setting)
        db.commit()
    
    return {}

@router.post("/api/user/profile/sync", tags=["User Settings"])
async def sync_user_profile(
    req: schemas.UserProfileSyncRequest,
    db: Session = Depends(get_db)
):
    """
    Syncs the user's profile information (memberships, active team, active role)
    from the frontend to the local database.
    """
    user_profile = db.query(models.LocalUserProfile).filter(
        models.LocalUserProfile.user_id == req.user_id
    ).first()

    memberships_json = json.dumps([m.dict() for m in req.memberships])

    if user_profile:
        # Update existing profile
        user_profile.memberships_json = memberships_json
        user_profile.active_team_id = req.activeTeam
        user_profile.active_role = req.activeRole
    else:
        # Create new profile
        user_profile = models.LocalUserProfile(
            user_id=req.user_id,
            memberships_json=memberships_json,
            active_team_id=req.activeTeam,
            active_role=req.activeRole,
        )
        db.add(user_profile)

    db.commit()
    db.refresh(user_profile)
    return {"message": "User profile synced successfully."}
