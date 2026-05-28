"""
Configuration module for the AgenticDataWorkspace backend.

This module handles loading environment variables from the .env file
and synchronizing system configuration settings between the database
and the environment.
"""

import os
from sqlalchemy.orm import Session
from .db.models import SystemSetting

# Determine base directory and load .env path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOTENV_PATH = os.path.join(BASE_DIR, ".env")

def sync_system_settings(db: Session) -> None:
    """
    Synchronizes dynamic system settings between the database and os.environ.
    
    If a setting exists in the database, it overrides the environment variable.
    If it does not exist in the database, it is seeded from the environment
    variable or set to a sensible default.

    Args:
        db (Session): The SQLAlchemy database session.
    """
    default_keys = [
        "LLM_PROVIDER", 
        "GEMINI_API_KEY", 
        "GEMINI_MODEL",
        "DATABRICKS_HOST", 
        "DATABRICKS_TOKEN", 
        "DATABRICKS_LLM_ENDPOINT_NAME", 
        "DATABRICKS_LLM_EXPERIMENT_ID",
        "AZURE_OPENAI_API_KEY", 
        "AZURE_OPENAI_ENDPOINT", 
        "AZURE_OPENAI_DEPLOYMENT_NAME",
        "AZURE_FOUNDRY_API_KEY", 
        "AZURE_FOUNDRY_ENDPOINT", 
        "DEPLOYMENT_MODE"
    ]
    secrets = ["GEMINI_API_KEY", "DATABRICKS_TOKEN", "AZURE_OPENAI_API_KEY", "AZURE_FOUNDRY_API_KEY"]
    
    for key in default_keys:
        db_setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        env_val = os.getenv(key)
        
        # Override fallbacks for missing env variables
        if key == "LLM_PROVIDER" and not env_val:
            env_val = "gemini"
        elif key == "GEMINI_MODEL" and not env_val:
            env_val = "gemini-2.5-flash"
        elif key == "DATABRICKS_LLM_ENDPOINT_NAME" and not env_val:
            env_val = "databricks-meta-llama-3-1-70b-instruct"
        elif key == "DEPLOYMENT_MODE" and not env_val:
            env_val = "docker"

        if not db_setting:
            new_setting = SystemSetting(
                key=key,
                value=env_val,
                is_secret=(key in secrets)
            )
            db.add(new_setting)
        else:
            if db_setting.value is not None:
                os.environ[key] = db_setting.value
    db.commit()
