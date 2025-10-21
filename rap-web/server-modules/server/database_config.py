import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from .config import settings

# Check for the production database path from the environment variable set by server_embed.py.
# If it's not set (i.e., during local development), fall back to the path from the settings file.
prod_db_path = os.environ.get("RAP_DATABASE_PATH")
if prod_db_path:
    SQLALCHEMY_DATABASE_URL = f"sqlite:///{prod_db_path}"
else:
    SQLALCHEMY_DATABASE_URL = settings.DATABASE_URL

# The connect_args is recommended for SQLite to ensure single-threaded access
# which is safer for web applications using SQLite.
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()