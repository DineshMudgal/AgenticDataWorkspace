"""
Main entrypoint for the AgenticDataWorkspace FastAPI backend.

Initializes the FastAPI application, registers middleware (CORS), binds sub-routers,
runs database migrations and seeding routines on startup, and launches the background scheduler.
"""

import os
import json
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from sqlalchemy import text
from sqlalchemy.orm import Session

# Import logging configuration first to initialize logger handlers
from .logging_config import logger

from .db.database import get_db, Base, engine, SessionLocal
from .db.seed import seed_data
from .db.models import Agent, Workflow, SystemSetting, DataProject, DataProduct
from .config import sync_system_settings
from .helpers import generate_agent_intro_text, generate_workflow_description
from .scheduler import run_background_workflow_scheduler

# Import sub-routers
from .routes import products_projects, agents_skills_tools, workflows_executions, system

app = FastAPI(
    title="AgenticDataWorkspace API",
    description="Backend API for managing data products, projects, agents, and LangGraph workflows."
)

# Configure CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register sub-routers
app.include_router(products_projects.router)
app.include_router(agents_skills_tools.router)
app.include_router(workflows_executions.router)
app.include_router(system.router)


def run_migrations(db: Session) -> None:
    """
    Executes incremental database migrations to align SQLite or PostgreSQL schema columns.
    """
    migrations = [
        "ALTER TABLE workflows ADD COLUMN schedule_cron VARCHAR(100)",
        "ALTER TABLE workflows ADD COLUMN schedule_enabled BOOLEAN DEFAULT FALSE",
        "ALTER TABLE workflows ADD COLUMN last_run_at TIMESTAMP",
        "ALTER TABLE data_projects ADD COLUMN instructions TEXT",
        "ALTER TABLE agents ADD COLUMN introduction TEXT",
        "ALTER TABLE workflows ADD COLUMN user_parameters TEXT DEFAULT '[]'",
        "ALTER TABLE artifacts ADD COLUMN execution_id VARCHAR(36)",
        "ALTER TABLE artifacts ADD COLUMN agent_name VARCHAR(255)"
    ]
    for mig in migrations:
        try:
            db.execute(text(mig))
            db.commit()
        except Exception:
            db.rollback()

    # Create workflow_executions table if not exists
    try:
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS workflow_executions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                execution_id VARCHAR(36) NOT NULL UNIQUE,
                workflow_id INTEGER NOT NULL,
                status VARCHAR(50) DEFAULT 'Running',
                trigger_query TEXT,
                input_parameters TEXT DEFAULT '{}',
                agent_outputs TEXT DEFAULT '{}',
                error_message TEXT,
                started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                completed_at TIMESTAMP,
                created_by VARCHAR(255) DEFAULT 'system',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
            )
        """))
        db.commit()
    except Exception:
        db.rollback()


def seed_database_and_intros(db: Session) -> None:
    """
    Runs sync_system_settings, database seed routines, and auto-generates
    agent introductions and workflow descriptions if missing.
    """
    try:
        sync_system_settings(db)
        seed_data(db)
        
        # Check and update introductions for existing agents
        existing_agents = db.query(Agent).all()
        for ag in existing_agents:
            skill_names = []
            try:
                skill_names = json.loads(ag.skills or "[]")
            except Exception:
                pass
            
            needs_intro_update = (
                not ag.introduction 
                or "questions you can ask" not in ag.introduction.lower() 
                and "suggested questions" not in ag.introduction.lower()
                and "things you can ask" not in ag.introduction.lower()
            )
            
            if needs_intro_update:
                ag.introduction = generate_agent_intro_text(
                    agent_name=ag.name,
                    agent_role=ag.role,
                    agent_instructions=ag.instructions or "",
                    skill_names=skill_names,
                    db=db
                )
        db.commit()

        # Check and generate descriptions for workflows
        existing_workflows = db.query(Workflow).all()
        for w in existing_workflows:
            if not w.description or "Orchestrates a data" in w.description or "Ingestion and validation" in w.description or "mapping" in w.description:
                seq = []
                try:
                    seq = json.loads(w.agents_sequence or "[]")
                except Exception:
                    pass
                w.description = generate_workflow_description(
                    workflow_name=w.name,
                    product_id=w.data_product_id,
                    project_id=w.data_project_id,
                    agents_sequence=seq,
                    db=db
                )
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to populate agent introductions or workflow descriptions: {e}")


@app.on_event("startup")
def on_app_startup():
    """
    App startup event handler. Sets up schemas, runs migrations, seeds data,
    and starts the background workflow scheduler.
    """
    # Create tables defined in models
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        run_migrations(db)
        seed_database_and_intros(db)
    finally:
        db.close()

    # Launch background cron scheduling engine
    run_background_workflow_scheduler()


# Serve React SPA Client static assets
static_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")

if os.path.exists(static_dir) and os.listdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
else:
    @app.get("/", response_class=HTMLResponse)
    def index_placeholder():
        """Fallback root HTML layout served if the frontend SPA build is missing."""
        return """
        <!DOCTYPE html>
        <html>
        <head>
            <title>AgenticDataWorkspace Backend</title>
            <style>
                body {
                    background-color: #0b0f19;
                    color: #e2e8f0;
                    font-family: 'Inter', sans-serif;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                }
                .card {
                    background: rgba(30, 41, 59, 0.4);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    backdrop-filter: blur(16px);
                    padding: 40px;
                    border-radius: 12px;
                    text-align: center;
                    max-width: 600px;
                    box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
                }
                h1 {
                    color: #38bdf8;
                    margin-top: 0;
                    font-size: 2.2rem;
                }
                p {
                    font-size: 1.1rem;
                    line-height: 1.6;
                    color: #94a3b8;
                }
                .tag {
                    display: inline-block;
                    background-color: rgba(56, 189, 248, 0.1);
                    color: #38bdf8;
                    padding: 6px 12px;
                    border-radius: 20px;
                    font-size: 0.9rem;
                    margin-top: 15px;
                    border: 1px solid rgba(56, 189, 248, 0.2);
                }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>AgenticDataWorkspace Server</h1>
                <p>The backend Python server is running successfully! 🚀</p>
                <p>To run the frontend React client, compile the SPA or launch the Vite dev server inside the <code>frontend/</code> directory with proxy configuration enabled.</p>
                <div class="tag">API Endpoint: /api/products</div>
            </div>
        </body>
        </html>
        """
