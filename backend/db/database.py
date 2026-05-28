import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("DatabaseConfig")

DB_URL = os.getenv("DB_URL", "postgresql://postgres:postgrespassword@localhost:5432/agentic_db")

# We will try connecting to Postgres. If it fails, we fall back to a local SQLite database.
engine = None
SessionLocal = None
Base = declarative_base()

try:
    if "postgresql" in DB_URL:
        # Check if psycopg2 is installed
        import psycopg2
    logger.info(f"Attempting to connect to PostgreSQL at {DB_URL}...")
    # Add a short timeout so it fails fast if PostgreSQL is not running
    engine = create_engine(
        DB_URL, 
        connect_args={"connect_timeout": 3} if "postgresql" in DB_URL else {}
    )
    # Test connection
    conn = engine.connect()
    conn.close()
    logger.info("Successfully connected to PostgreSQL database!")
except Exception as e:
    logger.error(f"PostgreSQL connection failed: {e}. Falling back to SQLite...")
    sqlite_url = "sqlite:///agentic_workspace.db"
    logger.info(f"Connecting to SQLite database at {sqlite_url}...")
    engine = create_engine(
        sqlite_url, 
        connect_args={"check_same_thread": False}
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
