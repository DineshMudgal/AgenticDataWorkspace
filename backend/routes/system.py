"""
API router for System and Observability operations.

Defines HTTP routes for querying settings, modifying environment setups, and streaming 
live server logs / DB logs for observability dashboards.
"""

import os
import asyncio
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.models import SystemLog, SystemSetting
from ..schemas import SettingsUpdateInput
from ..helpers import mask_secret
from ..logging_config import logger

router = APIRouter()


@router.get("/api/logs")
def get_system_logs(
    project_id: Optional[int] = None, 
    level: Optional[str] = None, 
    agent_name: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Retrieve database system/observability logs, with optional filters."""
    query = db.query(SystemLog)
    if project_id is not None:
        query = query.filter(SystemLog.project_id == project_id)
    if level is not None and level != "ALL":
        query = query.filter(SystemLog.level == level)
    if agent_name is not None and agent_name != "ALL":
        query = query.filter(SystemLog.agent_name == agent_name)
    return query.order_by(SystemLog.id.desc()).all()


@router.get("/api/system/server-logs/stream")
async def stream_server_logs():
    """Stream live server console logs from the filesystem using Server-Sent Events (SSE)."""
    logger.info("Observability Dashboard connected to live server stream.")
    
    async def log_generator():
        log_file = "agentic_workspace.log"
        if not os.path.exists(log_file):
            yield "data: Log file not found or hasn't been written to yet.\n\n"
            return
            
        with open(log_file, "r") as f:
            # Read last 100 lines immediately
            lines = f.readlines()
            for line in lines[-100:]:
                yield f"data: {line}\n\n"
            
            # Tail the file for new lines
            while True:
                line = f.readline()
                if not line:
                    await asyncio.sleep(0.5)
                    continue
                yield f"data: {line}\n\n"

    return StreamingResponse(log_generator(), media_type="text/event-stream")


@router.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
    """Retrieve all system settings with secrets masked."""
    settings = db.query(SystemSetting).all()
    result = {}
    for s in settings:
        if s.is_secret and s.value:
            result[s.key] = mask_secret(s.value)
        else:
            result[s.key] = s.value or ""
    return result


@router.post("/api/settings")
def update_settings(payload: SettingsUpdateInput, db: Session = Depends(get_db)):
    """Bulk update system settings, synchronizing them with os.environ."""
    secrets = ["GEMINI_API_KEY", "DATABRICKS_TOKEN", "AZURE_OPENAI_API_KEY", "AZURE_FOUNDRY_API_KEY"]
    for key, val in payload.settings.items():
        db_setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if not db_setting:
            is_sec = key in secrets
            db_setting = SystemSetting(key=key, value=val, is_secret=is_sec)
            db.add(db_setting)
        else:
            # Skip updating if it matches the masked value
            if db_setting.is_secret and val and "..." in val:
                continue
            db_setting.value = val
        
        # Sync dynamic os.environ
        if val is not None and not (db_setting.is_secret and "..." in str(val)):
            os.environ[key] = val
            
    db.commit()
    return {"status": "success", "message": "Settings updated successfully"}
