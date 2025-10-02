from sqlalchemy import Boolean, Column, Integer, String, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database_config import Base

class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    path = Column(String, unique=True, index=True)
    team_id = Column(Integer, index=True, nullable=True) # From rap-auth-server
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    published_scripts = relationship("PublishedScript", back_populates="workspace", cascade="all, delete-orphan")

class PublishedScript(Base):
    __tablename__ = "published_scripts"

    id = Column(Integer, primary_key=True, index=True)
    script_path = Column(String, index=True)
    content = Column(Text, nullable=False)
    workspace_id = Column(Integer, ForeignKey("workspaces.id"))
    team_id = Column(Integer, index=True, nullable=True)
    commit_hash = Column(String)
    published_at = Column(DateTime(timezone=True), server_default=func.now())

    workspace = relationship("Workspace", back_populates="published_scripts")

class Script(Base):
    __tablename__ = "scripts"

    id = Column(Integer, primary_key=True, index=True)
    path = Column(String, unique=True, index=True)
    name = Column(String, index=True)
    description = Column(String, nullable=True)
    owner_id = Column(String, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    presets = relationship("Preset", back_populates="script", cascade="all, delete-orphan")
    runs = relationship("ScriptRun", back_populates="script", cascade="all, delete-orphan")

class Preset(Base):
    __tablename__ = "presets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    script_id = Column(Integer, ForeignKey("scripts.id"))
    parameters = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    script = relationship("Script", back_populates="presets")

class ScriptRun(Base):
    __tablename__ = "script_runs"

    id = Column(Integer, primary_key=True, index=True)
    script_id = Column(Integer, ForeignKey("scripts.id"))
    user_id = Column(String, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    status = Column(String) # e.g., "success", "failure"
    output = Column(Text, nullable=True)
    parameters = Column(JSON, nullable=True)

    script = relationship("Script", back_populates="runs")