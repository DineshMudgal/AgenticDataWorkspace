"""
Logging and observability configuration module for the AgenticDataWorkspace backend.

Defines loggers, handlers (including standard output, file output, and database),
and SQLAlchemy event listeners to automatically sanitize API keys and credentials
from database logs.
"""

import os
import sys
import logging
from sqlalchemy import event
from .db.models import ServerLog, SystemLog

# Configure baseline loggers
log_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# File handler for permanent file system logging
file_handler = logging.FileHandler("agentic_workspace.log")
file_handler.setFormatter(log_formatter)

# Stream handler for stdout console output
stream_handler = logging.StreamHandler(sys.stdout)
stream_handler.setFormatter(log_formatter)

# Configure general logging config
logging.basicConfig(level=logging.INFO, handlers=[file_handler, stream_handler])
logger = logging.getLogger("AgenticDataServer")

# Intercept third-party web server logs
logging.getLogger("uvicorn.error").addHandler(file_handler)
logging.getLogger("uvicorn.access").addHandler(file_handler)

# Configure LangGraph coordination logger
lg_logger = logging.getLogger("LangGraphAgents")
lg_logger.addHandler(file_handler)
lg_logger.addHandler(stream_handler)


def sanitize_logs(text_str: str) -> str:
    """
    Scans log messages for known secret keys and replaces them with masked tokens.

    Args:
        text_str (str): The log message string.

    Returns:
        str: The sanitized log message.
    """
    if not text_str:
        return text_str
    
    # Collect active secrets from environment variables
    secrets_to_mask = []
    for var_name in ["GEMINI_API_KEY", "DATABRICKS_TOKEN", "AZURE_OPENAI_API_KEY", "AZURE_FOUNDRY_API_KEY"]:
        val = os.getenv(var_name)
        if val and len(val.strip()) > 4:
            secrets_to_mask.append(val.strip())
            
    sanitized = text_str
    for sec in secrets_to_mask:
        # Mask showing first 4 and last 4 characters
        masked_sec = f"{sec[:4]}...{sec[-4:]}"
        sanitized = sanitized.replace(sec, masked_sec)
    return sanitized


# SQLAlchemy Event Listeners to intercept and sanitize logs before DB writes
@event.listens_for(ServerLog, 'before_insert')
def receive_before_insert_server_log(mapper, connection, target):
    """Event listener to sanitize ServerLog entries before writing to DB."""
    if target.message:
        target.message = sanitize_logs(target.message)


@event.listens_for(SystemLog, 'before_insert')
def receive_before_insert_system_log(mapper, connection, target):
    """Event listener to sanitize SystemLog entries before writing to DB."""
    if target.message:
        target.message = sanitize_logs(target.message)
    if target.details:
        target.details = sanitize_logs(target.details)


class DatabaseLogHandler(logging.Handler):
    """
    Custom logging handler that streams logs directly into the database's ServerLog table.
    """
    def emit(self, record):
        # Prevent infinite recursion if SQLAlchemy logs trigger a database operation
        if record.name.startswith("sqlalchemy"):
            return
            
        try:
            from .db.database import SessionLocal
            db = SessionLocal()
            log_entry = ServerLog(
                level=record.levelname,
                logger_name=record.name,
                message=record.getMessage(),
                module=record.module,
                func_name=record.funcName,
                line_no=record.lineno
            )
            db.add(log_entry)
            db.commit()
        except Exception:
            pass  # Failsafe logging to prevent application crash on DB error
        finally:
            db.close()


# Bind Database log handler
db_handler = DatabaseLogHandler()
db_handler.setLevel(logging.INFO)
logger.addHandler(db_handler)
logger.addHandler(file_handler)
logger.addHandler(stream_handler)
