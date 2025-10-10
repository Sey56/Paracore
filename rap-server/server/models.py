from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database_config import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    # Add other user fields as necessary, e.g., name, picture_url
    local_profile = relationship("LocalUserProfile", uselist=False, back_populates="user")

class LocalUserProfile(Base):
    __tablename__ = "local_user_profiles"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True)
    memberships_json = Column(Text, nullable=True)
    active_team_id = Column(Integer, nullable=True)
    active_role = Column(String, nullable=True)

    user = relationship("User", back_populates="local_profile")

class Script(Base):
    __tablename__ = "scripts"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    path = Column(String, unique=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"))
    is_favorite = Column(Boolean, default=False)
    last_run_at = Column(DateTime(timezone=True), onupdate=func.now())

    owner = relationship("User")
    presets = relationship("Preset", back_populates="script")

class Workspace(Base):
    __tablename__ = "workspaces"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    path = Column(String, unique=True, index=True)
    # Add other fields like repo_url if needed for local workspaces

class RegisteredWorkspace(Base):
    __tablename__ = "registered_workspaces"
    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, index=True)
    name = Column(String, index=True)
    repo_url = Column(String)

class UserSetting(Base):
    __tablename__ = "user_settings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    setting_key = Column(String, index=True)
    setting_value = Column(Text)

    user = relationship("User")

class Preset(Base):
    __tablename__ = "presets"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    script_id = Column(Integer, ForeignKey("scripts.id"))
    values = Column(Text) # Store as JSON string

    script = relationship("Script")

class Run(Base):
    __tablename__ = "runs"
    id = Column(Integer, primary_key=True, index=True)
    script_id = Column(Integer, ForeignKey("scripts.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    team_id = Column(Integer)
    role = Column(String)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String)
    output = Column(Text, nullable=True)

    script = relationship("Script")
    user = relationship("User")
