import os
import json
import uuid
import logging
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
import asyncio
from pydantic import BaseModel
from sqlalchemy.orm import Session
import datetime

import sys
import io
import traceback
import requests
from sqlalchemy import text
from .db.database import get_db, Base, engine, SessionLocal
from .db.seed import seed_data
from .db.models import DataProduct, DataProject, Skill, Agent, Workflow, Artifact, SystemLog, Tool, ServerLog, WorkflowExecution, SystemSetting
from .agents.graph import run_agent_workflow, call_llm

from dotenv import load_dotenv

# Event listeners to mask secrets in system and server logs
from sqlalchemy import event

def sanitize_logs(text_str: str) -> str:
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

@event.listens_for(ServerLog, 'before_insert')
def receive_before_insert_server_log(mapper, connection, target):
    if target.message:
        target.message = sanitize_logs(target.message)

@event.listens_for(SystemLog, 'before_insert')
def receive_before_insert_system_log(mapper, connection, target):
    if target.message:
        target.message = sanitize_logs(target.message)
    if target.details:
        target.details = sanitize_logs(target.details)

# Load absolute dotenv path
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dotenv_path = os.path.join(base_dir, ".env")
load_dotenv(dotenv_path)

import sys

# Configure Logging
log_formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')

file_handler = logging.FileHandler("agentic_workspace.log")
file_handler.setFormatter(log_formatter)

stream_handler = logging.StreamHandler(sys.stdout)
stream_handler.setFormatter(log_formatter)

logging.basicConfig(level=logging.INFO, handlers=[file_handler, stream_handler])
logger = logging.getLogger("AgenticDataServer")

# Intercept uvicorn logs so they also write to agentic_workspace.log
logging.getLogger("uvicorn.error").addHandler(file_handler)
logging.getLogger("uvicorn.access").addHandler(file_handler)

class DatabaseLogHandler(logging.Handler):
    def emit(self, record):
        # Prevent infinite recursion if SQLAlchemy logs
        if record.name.startswith("sqlalchemy"):
            return
            
        try:
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
            pass # Failsafe
        finally:
            db.close()

db_handler = DatabaseLogHandler()
db_handler.setLevel(logging.INFO)
logger.addHandler(db_handler)
logger.addHandler(file_handler)
logger.addHandler(stream_handler)

# Configure LangGraphAgents logger handlers
lg_logger = logging.getLogger("LangGraphAgents")
lg_logger.addHandler(file_handler)
lg_logger.addHandler(stream_handler)

# Log environment variables status
gemini_key = os.getenv("GEMINI_API_KEY")
if gemini_key:
    masked_key = gemini_key[:6] + "..." + gemini_key[-4:] if len(gemini_key) > 10 else "loaded"
    logger.info(f"Loaded GEMINI_API_KEY: {masked_key}")
    print(f"\n[STARTUP] Loaded GEMINI_API_KEY: {masked_key}\n")
else:
    logger.warning("GEMINI_API_KEY not found in environment!")
    print("\n[STARTUP] WARNING: GEMINI_API_KEY not found in environment!\n")

def generate_agent_intro_text(agent_name: str, agent_role: str, agent_instructions: str, skill_names: List[str], db: Session) -> str:
    skills_info = []
    if skill_names:
        db_skills = db.query(Skill).filter(Skill.name.in_(skill_names)).all()
        for sk in db_skills:
            skills_info.append({
                "name": sk.name,
                "description": sk.description,
                "instruction": sk.instruction
            })
            
    skills_and_tools_details = ""
    for idx, sk in enumerate(skills_info):
        skills_and_tools_details += f"- Skill {idx+1}: {sk['name']}\n  Description: {sk['description'] or 'None'}\n  Instruction: {sk['instruction'] or 'None'}\n"
        
    prompt = f"""You are an expert agent architect. Please read the following agent specification and generate a premium, friendly, professional, and clear introduction that the agent will use to welcome users in a test sandbox chat interface.

Agent Details:
- Name: {agent_name}
- Role: {agent_role}
- Instructions: {agent_instructions}

Assigned Skills and Tools:
{skills_and_tools_details}

Please write a cohesive introduction (1-2 short paragraphs) that:
1. Greets the user professionally.
2. Explains the agent's role and purpose in simple, clean language.
3. Summarizes the key skills it has access to and how they will be used.
4. Tells the user they can test the agent in this sandbox.
5. Asks 2-3 highly relevant, interactive follow-up questions or suggests sample queries/tasks (formatted as clean markdown bullet points at the end) to prompt the user to start testing the agent's specific capabilities.

Return ONLY the introduction markdown text. Keep it clean and concise, avoiding generic boilerplate placeholders. Do NOT include markdown tags around the response like ```markdown."""

    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            intro = call_llm(prompt, system_instruction="You are a helpful AI assistant that generates agent introduction text.")
            if intro and len(intro.strip()) > 10:
                return intro.strip()
        except Exception as e:
            logger.error(f"Failed to generate agent introduction using LLM: {e}")
            
    # Fallback template-based generation if LLM is unavailable or fails
    intro = f"Hello! I am **{agent_name}**, your **{agent_role}**.\n\n"
    if agent_instructions:
        clean_instr = agent_instructions.replace("## INSTRUCTION OUTPUTS\n", "").replace("## GUARDRAILS\n", "")
        preview = clean_instr.split("\n")[0]
        intro += f"My primary focus is: {preview}\n\n"
    if skill_names:
        skills_str = ", ".join([f"**{s}**" for s in skill_names])
        intro += f"I have been equipped with the following capabilities: {skills_str}.\n"
        for sk in skills_info:
            desc_preview = sk['description'] or sk['instruction']
            if desc_preview:
                intro += f"- *{sk['name']}*: {desc_preview}\n"
        intro += "\n"
    intro += "Feel free to test my capabilities or trigger workflows in this sandbox!\n\n"
    intro += "Here are some questions you can ask me to get started:\n"
    if skill_names:
        for s in skill_names:
            s_lower = s.lower()
            if "fetch" in s_lower or "extract" in s_lower:
                intro += f"- \"Can you retrieve data using the {s} skill?\"\n"
            elif "analyze" in s_lower or "profile" in s_lower:
                intro += f"- \"How would you analyze the schema of our source dataset?\"\n"
            elif "ddl" in s_lower or "schema" in s_lower:
                intro += f"- \"Can you generate the DDL script for our Silver layer?\"\n"
            elif "dml" in s_lower or "transform" in s_lower:
                intro += f"- \"Can you generate the Delta MERGE transformation DML?\"\n"
            else:
                intro += f"- \"How do we utilize the {s} capability?\"\n"
    else:
        intro += "- \"What are the main requirements we need to gather for this integration?\"\n"
        intro += "- \"Can you draft the project scope and data objectives?\"\n"
    return intro

def generate_workflow_description(workflow_name: str, product_id: int, project_id: int, agents_sequence: list, db: Session) -> str:
    # Get product
    prod_name = f"Product ID {product_id}"
    prod = db.query(DataProduct).filter(DataProduct.id == product_id).first()
    if prod:
        prod_name = prod.name
        
    # Get project
    proj_name = f"Project ID {project_id}"
    proj = db.query(DataProject).filter(DataProject.id == project_id).first()
    if proj:
        proj_name = proj.name

    # Get agents details
    agents_info = []
    if agents_sequence:
        db_agents = db.query(Agent).filter(Agent.name.in_(agents_sequence)).all()
        # Maintain order
        agent_dict = {a.name: a for a in db_agents}
        for name in agents_sequence:
            ag = agent_dict.get(name)
            if ag:
                agents_info.append({
                    "name": ag.name,
                    "role": ag.role,
                    "description": ag.instructions or "None"
                })

    sequence_details = ""
    for idx, ag in enumerate(agents_info):
        sequence_details += f"- Step {idx+1}: {ag['name']} (Role: {ag['role']}, Description: {ag['description']})\n"

    prompt = f"""You are an expert enterprise orchestration architect. Please read the following specification of a multi-agent data workflow and generate a high-quality, professional, and cohesive description (1-2 short sentences) detailing the purpose and flow of this orchestration sequence. Do not include markdown code block syntax.

Workflow Name: {workflow_name}
Target Data Product: {prod_name}
Target Project/Workspace: {proj_name}

Pipeline Agent Sequence:
{sequence_details}

Please write a clean, premium, and concise description summarizing the core data operations this sequence performs.
Return ONLY the description text. Keep it clean and concise. Do NOT include markdown tags around the response like ```markdown."""

    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            desc = call_llm(prompt, system_instruction="You are a helpful AI assistant that generates database workflow descriptions.")
            if desc and len(desc.strip()) > 10:
                return desc.strip()
        except Exception as e:
            logger.error(f"Failed to generate workflow description using LLM: {e}")

    # Fallback template-based description
    seq_str = " -> ".join(agents_sequence) if agents_sequence else "No agents"
    return f"Orchestrates a data pipeline mapping to target product '{prod_name}' on project workspace '{proj_name}' using agent sequence: {seq_str}."

# Create Database tables
Base.metadata.create_all(bind=engine)

# Dynamic columns migration for sqlite/postgresql
from sqlalchemy import text
db_migration = next(get_db())
try:
    db_migration.execute(text("ALTER TABLE workflows ADD COLUMN schedule_cron VARCHAR(100)"))
    db_migration.commit()
except Exception as e:
    db_migration.rollback()

try:
    db_migration.execute(text("ALTER TABLE workflows ADD COLUMN schedule_enabled BOOLEAN DEFAULT FALSE"))
    db_migration.commit()
except Exception as e:
    db_migration.rollback()

try:
    db_migration.execute(text("ALTER TABLE workflows ADD COLUMN last_run_at TIMESTAMP"))
    db_migration.commit()
except Exception as e:
    db_migration.rollback()

try:
    db_migration.execute(text("ALTER TABLE data_projects ADD COLUMN instructions TEXT"))
    db_migration.commit()
except Exception as e:
    db_migration.rollback()

try:
    db_migration.execute(text("ALTER TABLE agents ADD COLUMN introduction TEXT"))
    db_migration.commit()
except Exception as e:
    db_migration.rollback()

try:
    db_migration.execute(text("ALTER TABLE workflows ADD COLUMN user_parameters TEXT DEFAULT '[]'"))
    db_migration.commit()
except Exception as e:
    db_migration.rollback()

try:
    db_migration.execute(text("ALTER TABLE artifacts ADD COLUMN execution_id VARCHAR(36)"))
    db_migration.commit()
except Exception as e:
    db_migration.rollback()

try:
    db_migration.execute(text("ALTER TABLE artifacts ADD COLUMN agent_name VARCHAR(255)"))
    db_migration.commit()
except Exception as e:
    db_migration.rollback()

# Create workflow_executions table if it doesn't exist
try:
    db_migration.execute(text("""
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
    db_migration.commit()
except Exception as e:
    db_migration.rollback()

finally:
    db_migration.close()

def sync_system_settings(db: Session):
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
        
        # Override fallbacks
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

# Seed Database
db_session = next(get_db())
try:
    sync_system_settings(db_session)
    seed_data(db_session)
    # Generate/update intros for existing/seeded agents if missing or needing follow-up questions
    existing_agents = db_session.query(Agent).all()
    for ag in existing_agents:
        skill_names = []
        try:
            skill_names = json.loads(ag.skills or "[]")
        except:
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
                db=db_session
            )
    db_session.commit()

    # Generate descriptions for seeded workflows if missing/generic
    existing_workflows = db_session.query(Workflow).all()
    for w in existing_workflows:
        if not w.description or "Orchestrates a data" in w.description or "Ingestion and validation" in w.description or "mapping" in w.description:
            seq = []
            try:
                seq = json.loads(w.agents_sequence or "[]")
            except:
                pass
            w.description = generate_workflow_description(
                workflow_name=w.name,
                product_id=w.data_product_id,
                project_id=w.data_project_id,
                agents_sequence=seq,
                db=db_session
            )
    db_session.commit()
except Exception as e:
    db_session.rollback()
    logger.error(f"Failed to populate agent introductions or workflow descriptions: {e}")
finally:
    db_session.close()

app = FastAPI(
    title="AgenticDataWorkspace API",
    description="Backend API for managing data products, projects, agents and LangGraph workflows."
)

# CORS configurations
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import threading
import time

def run_background_workflow_scheduler():
    def scheduler_loop():
        time.sleep(5)
        logger.info("[SCHEDULER] Background workflow scheduler thread started.")
        while True:
            try:
                db = SessionLocal()
                scheduled_wfs = db.query(Workflow).filter(
                    Workflow.schedule_enabled == True,
                    Workflow.is_enabled == True
                ).all()
                
                now = datetime.datetime.utcnow()
                for wf in scheduled_wfs:
                    cron = wf.schedule_cron
                    if not cron:
                        continue
                    
                    last_run = wf.last_run_at
                    should_run = False
                    
                    interval_sec = 0
                    cron_lower = cron.lower()
                    if "1 minute" in cron_lower:
                        interval_sec = 60
                    elif "5 minutes" in cron_lower:
                        interval_sec = 300
                    elif "1 hour" in cron_lower or "hourly" in cron_lower:
                        interval_sec = 3600
                    elif "daily" in cron_lower or "day" in cron_lower:
                        interval_sec = 86400
                    elif "weekly" in cron_lower:
                        interval_sec = 604800
                    else:
                        interval_sec = 300
                    
                    if not last_run:
                        should_run = True
                    else:
                        delta = (now - last_run).total_seconds()
                        if delta >= interval_sec:
                            should_run = True
                            
                    if should_run:
                        logger.info(f"[SCHEDULER] Triggering scheduled execution for workflow '{wf.name}' (Interval: {cron})")
                        
                        project = db.query(DataProject).filter(DataProject.id == wf.data_project_id).first()
                        if project:
                            wf.status = "Running"
                            wf.last_run_at = now
                            db.commit()
                            
                            existing_params = json.loads(wf.parameters or "{}")
                            history_logs = json.loads(wf.history_logs or "[]")
                            
                            if project.parameters:
                                try:
                                    proj_params = json.loads(project.parameters)
                                    for pk, pv in proj_params.items():
                                        if pk != "__custom_params" and pv:
                                            existing_params[pk] = pv
                                    if "__custom_params" in proj_params:
                                        custom_list = proj_params["__custom_params"]
                                        if isinstance(custom_list, list):
                                            for cp in custom_list:
                                                cp_name = cp.get("name")
                                                cp_val = cp.get("default_value") or cp.get("default")
                                                if cp_name and cp_val is not None:
                                                    existing_params[cp_name] = cp_val
                                except:
                                    pass
                                    
                            product = db.query(DataProduct).filter(DataProduct.id == project.data_product_id).first()
                            if product and product.global_parameters:
                                try:
                                    gps = json.loads(product.global_parameters)
                                    for gp in gps:
                                        name = gp.get("name")
                                        val = gp.get("default_value") or gp.get("value") or gp.get("default")
                                        if name and name not in existing_params and val is not None:
                                            existing_params[name] = val
                                except:
                                    pass
                                    
                            artifacts_db = db.query(Artifact).filter(Artifact.data_project_id == project.id).all()
                            generated_artifacts = [{"name": art.name, "type": art.type, "content": art.content} for art in artifacts_db]
                            
                            initial_graph_state = {
                                "project_id": project.id,
                                "data_product_id": project.data_product_id,
                                "catalog_name": project.catalog_name,
                                "schema_name": project.schema_name,
                                "table_prefix": project.table_prefix,
                                "current_agent": "RequirementGatheringAgent",
                                "next_agent": "RequirementGatheringAgent",
                                "parameters": existing_params,
                                "generated_artifacts": generated_artifacts,
                                "logs": history_logs,
                                "status": "Running",
                                "global_instruction": product.global_instruction if product else None
                            }
                            
                            db.add(SystemLog(
                                level="INFO",
                                message=f"[SCHEDULER] Auto-triggered scheduled run for project '{project.name}' (Schedule: {cron})",
                                project_id=project.id
                            ))
                            db.commit()
                            
                            output_state = run_agent_workflow(initial_graph_state)
                            
                            wf.status = output_state["status"]
                            wf.current_agent = output_state["current_agent"]
                            wf.next_agent = output_state["next_agent"]
                            wf.parameters = json.dumps(output_state["parameters"])
                            wf.missing_parameters = json.dumps(output_state["missing_parameters"])
                            
                            incoming_logs = output_state["logs"]
                            new_logs = incoming_logs[len(history_logs):]
                            wf.history_logs = json.dumps(incoming_logs)
                            
                            for l in new_logs:
                                db.add(SystemLog(
                                    level=l.get("level", "INFO"),
                                    message=l.get("message", ""),
                                    agent_name=l.get("agent_name"),
                                    project_id=project.id,
                                    details=json.dumps(output_state["parameters"])
                                ))
                                
                            db_artifact_names = {art.name for art in artifacts_db}
                            for art in output_state["generated_artifacts"]:
                                if art["name"] not in db_artifact_names:
                                    db_art = Artifact(
                                        name=art["name"],
                                        type=art["type"],
                                        content=art["content"],
                                        data_project_id=project.id,
                                        status="Deployed",
                                        metadata_json=json.dumps({"triggered_by": "scheduler"})
                                    )
                                    db.add(db_art)
                                    
                            db.commit()
                            logger.info(f"[SCHEDULER] Scheduled execution completed for workflow '{wf.name}'. Status: {wf.status}")
                db.close()
            except Exception as ex:
                logger.error(f"[SCHEDULER] Error in scheduler loop: {ex}")
            time.sleep(10)

    t = threading.Thread(target=scheduler_loop, daemon=True)
    t.start()

@app.on_event("startup")
def on_app_startup():
    run_background_workflow_scheduler()

# API Request Models
class ProductCreate(BaseModel):
    name: str
    description: Optional[str] = None
    uc_owner: Optional[str] = None
    tags: Optional[str] = None
    type: Optional[str] = "Ingestion"
    global_parameters: Optional[List[Dict[str, Any]]] = None
    global_instruction: Optional[str] = None
    is_enabled: Optional[bool] = True
    owner_group: Optional[str] = None
    created_by: Optional[str] = "admin"
    updated_by: Optional[str] = "admin"

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    data_product_id: int
    databricks_url: Optional[str] = None
    catalog_name: Optional[str] = None
    schema_name: Optional[str] = None
    table_prefix: Optional[str] = None
    instructions: Optional[str] = None
    is_enabled: Optional[bool] = True
    parameters: Optional[Dict[str, Any]] = None
    created_by: Optional[str] = "admin"
    updated_by: Optional[str] = "admin"

class ToolCreate(BaseModel):
    name: str
    description: Optional[str] = None
    type: str = "python"
    code: Optional[str] = None
    parameters: Optional[List[Dict[str, Any]]] = None
    is_enabled: Optional[bool] = True
    created_by: Optional[str] = "admin"
    updated_by: Optional[str] = "admin"

class SkillCreate(BaseModel):
    name: str
    description: Optional[str] = None
    instruction: str
    parameters: Optional[List[Dict[str, Any]]] = None # list of parameter schemas
    output_definition: Optional[str] = None
    tools: Optional[List[str]] = None # list of tool names associated with this skill
    is_enabled: Optional[bool] = True
    created_by: Optional[str] = "admin"
    updated_by: Optional[str] = "admin"

class AgentCreate(BaseModel):
    name: str
    role: str
    skills: Optional[List[str]] = None
    tools: Optional[List[str]] = None
    instructions: Optional[str] = None
    introduction: Optional[str] = None
    is_enabled: Optional[bool] = True
    created_by: Optional[str] = "admin"
    updated_by: Optional[str] = "admin"

class WorkflowCreate(BaseModel):
    name: str
    description: Optional[str] = None
    data_product_id: int
    data_project_id: int
    agents_sequence: List[str] # Ordered agent names or ids
    is_enabled: Optional[bool] = True
    schedule_cron: Optional[str] = None
    schedule_enabled: Optional[bool] = False
    created_by: Optional[str] = "admin"
    updated_by: Optional[str] = "admin"

class WorkflowRunInput(BaseModel):
    parameters: Dict[str, Any]

class SkillAssignment(BaseModel):
    skills: List[str] # List of skill names
    tools: Optional[List[str]] = None # List of tool names

class ToolTestInput(BaseModel):
    code: str
    type: str
    inputs: Dict[str, Any]

class SkillTestInput(BaseModel):
    instruction: str
    tools: List[str]
    inputs: Dict[str, Any]
    history: Optional[List[Dict[str, Any]]] = None

class AgentTestInput(BaseModel):
    name: str
    role: str
    instructions: str
    skills: List[str]
    inputs: Dict[str, Any]
    history: Optional[List[Dict[str, Any]]] = None

class SuggestRequest(BaseModel):
    field: str
    context: str = ""
    value: str = ""

import re

@app.post("/api/suggest")
def get_suggestions(req: SuggestRequest):
    context_str = req.context.strip()
    print(f"\n[API SUGGEST REQUEST] Field: '{req.field}' | Context: '{context_str}'")
    logger.info(f"[API SUGGEST REQUEST] Field: '{req.field}' | Context: '{context_str}'")
    
    if context_str:
        field_lower = req.field.lower()
        constraints = []
        if "name" in field_lower or "prefix" in field_lower or "schema" in field_lower or "catalog" in field_lower:
            constraints.append("- MUST NOT contain any spaces. Format suggestions using CamelCase (e.g. 'FinanceDataProduct') or snake_case.")
        if "instruction" in field_lower and ("agent" in field_lower or "directive" in field_lower):
            constraints.append("- MUST generate a highly structured prompt outlining: 1. Core Instructions/Directives, 2. Input Guardrails, 3. Context & Do's/Don'ts, and 4. Output format specifications.")
        elif "tool code" in field_lower:
            if "python" in field_lower:
                constraints.append("- MUST be valid Python code suitable for execution in a Databricks/Spark environment.")
                constraints.append("- The suggestion MUST start with a function definition: 'def run(params):' and return a dict.")
            elif "sql" in field_lower:
                constraints.append("- MUST be a valid SQL query or query template for Databricks Delta Lake.")
                constraints.append("- Reference parameters inside braces, e.g. '{catalog_name}', '{schema_name}', or custom param names.")
            else:
                constraints.append("- MUST be a valid API configuration template or LLM prompt template using parameter placeholders.")
        elif "description" in field_lower or "instruction" in field_lower:
            constraints.append("- MUST be highly detailed, descriptive, comprehensive, and complete professional sentences.")
        
        constraints_str = "\n".join(constraints) if constraints else "- MUST be concise and professional."

        prompt = f"""Generate exactly 3 distinct, highly relevant, professional recommendations/suggestions for a Databricks data platform input field.
Field Name: {req.field}
User Intent/Context: {context_str}

Specific formatting and content rules for this field:
{constraints_str}

Provide the suggestions as a JSON array of strings only.
Example:
["SuggestionOne", "SuggestionTwo", "SuggestionThree"]
"""
        try:
            print(f"[API SUGGEST LLM CALL] Dispatching prompt to Gemini...")
            raw_response = call_llm(prompt, "You are a Databricks data platform suggestion assistant. Output a JSON list of strings only.")
            text = raw_response.strip()
            print(f"[API SUGGEST LLM RESPONSE] Raw Text:\n---\n{text}\n---")
            logger.info(f"[API SUGGEST LLM RESPONSE] Raw Text: {text}")
            
            # Parse using robust heuristics
            suggestions = []
            
            # Heuristic 1: Extract anything between the first [ and last ]
            start = text.find("[")
            end = text.rfind("]")
            if start != -1 and end != -1:
                json_candidate = text[start:end+1]
                try:
                    parsed = json.loads(json_candidate)
                    if isinstance(parsed, list):
                        suggestions = [str(s).strip() for s in parsed if s]
                except Exception:
                    # Heuristic 2: Regex extract double-quoted or single-quoted strings from within the bracketed region
                    matches = re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"|\'([^\'\\]*(?:\\.[^\'\\]*)*)\'', json_candidate)
                    suggestions = [m[0] or m[1] for m in matches if m[0] or m[1]]
                    
            # Heuristic 3: Line-by-line fallback if we couldn't parse or extract anything
            if not suggestions:
                for line in text.split("\n"):
                    line = line.strip()
                    if not line:
                        continue
                    # Remove bullet list prefixes
                    if line.startswith("-") or line.startswith("*"):
                        line = line.lstrip("-* ").strip()
                    elif line and line[0].isdigit() and (line.startswith(line[0]+".") or line.startswith(line[0]+")")):
                        line = line.split(".", 1)[-1].split(")", 1)[-1].strip()
                    line = line.strip("'\"")
                    if line and len(line) > 2:
                        suggestions.append(line)
            
            final_suggestions = [s.strip() for s in suggestions if s]
            
            # Format check for space removal constraints on name/prefix/schema/catalog fields
            is_name_field = any(k in field_lower for k in ["name", "prefix", "schema", "catalog"])
            
            if is_name_field:
                final_suggestions = [
                    "".join(w.capitalize() for w in re.split(r'[\s,_]+', s) if w.strip())
                    for s in final_suggestions
                ]

            final_suggestions = [s for s in final_suggestions if s][:3]

            if not final_suggestions:
                words = [w.strip() for w in re.split(r'[\s,_]+', context_str) if len(w.strip()) > 1]
                main_word = words[0].capitalize() if words else "Domain"
                second_word = words[1].capitalize() if len(words) > 1 else ""
                
                field_map = {
                    "product name": "DataProduct" if is_name_field else "Data Product",
                    "product description": "Governance Scope",
                    "data project name": "DataProject" if is_name_field else "Data Project",
                    "skill name": "DataSkill" if is_name_field else "Data Skill",
                    "instruction": "Design Rule",
                    "description": "Metadata Description",
                    "unity catalog owner": "OwnerGroup" if is_name_field else "Owner Group",
                    "governance tags": "Governance Tag"
                }
                field_term = field_map.get(field_lower, req.field.title().replace(" ", "") if is_name_field else req.field.title())
                
                if is_name_field:
                    if second_word:
                        final_suggestions = [
                            f"{main_word}{second_word}{field_term}",
                            f"Enterprise{main_word}{field_term}",
                            f"{main_word}{field_term}Domain"
                        ]
                    else:
                        final_suggestions = [
                            f"{main_word}{field_term}",
                            f"Standardized{main_word}{field_term}",
                            f"Enterprise{main_word}Domain"
                        ]
                else:
                    if second_word:
                        final_suggestions = [
                            f"{main_word} {second_word} {field_term}",
                            f"Enterprise {main_word} {field_term}",
                            f"{main_word} {field_term} Domain"
                        ]
                    else:
                        final_suggestions = [
                            f"{main_word} {field_term}",
                            f"Standardized {main_word} {field_term}",
                            f"Enterprise {main_word} Governance"
                        ]
                print(f"[API SUGGEST EMPTY LLM RESULT] Synthesized fallback suggestions offline: {final_suggestions}")
            
            print(f"[API SUGGEST PARSED RESULT] Suggestions: {final_suggestions}")
            logger.info(f"[API SUGGEST PARSED RESULT] Suggestions: {final_suggestions}")
            return {"suggestions": final_suggestions}
        except Exception as e:
            print(f"[API SUGGEST ERROR] Failure during LLM generation: {e}")
            logger.error(f"Error generating AI suggestions via LLM: {e}")
            
            # Dynamic offline synthesis fallback using the user's typed context
            is_name_field = any(k in field_lower for k in ["name", "prefix", "schema", "catalog"])
            words = [w.strip() for w in re.split(r'[\s,_]+', context_str) if len(w.strip()) > 1]
            main_word = words[0].capitalize() if words else "Domain"
            second_word = words[1].capitalize() if len(words) > 1 else ""
            
            field_map = {
                "product name": "DataProduct" if is_name_field else "Data Product",
                "product description": "Governance Scope",
                "data project name": "DataProject" if is_name_field else "Data Project",
                "skill name": "DataSkill" if is_name_field else "Data Skill",
                "instruction": "Design Rule",
                "description": "Metadata Description",
                "unity catalog owner": "OwnerGroup" if is_name_field else "Owner Group",
                "governance tags": "Governance Tag"
            }
            field_term = field_map.get(field_lower, req.field.title().replace(" ", "") if is_name_field else req.field.title())
            
            if is_name_field:
                if second_word:
                    fallback_suggs = [
                        f"{main_word}{second_word}{field_term}",
                        f"Enterprise{main_word}{field_term}",
                        f"{main_word}{field_term}Domain"
                    ]
                else:
                    fallback_suggs = [
                        f"{main_word}{field_term}",
                        f"Standardized{main_word}{field_term}",
                        f"Enterprise{main_word}Domain"
                    ]
            else:
                if second_word:
                    fallback_suggs = [
                        f"{main_word} {second_word} {field_term}",
                        f"Enterprise {main_word} {field_term}",
                        f"{main_word} {field_term} Domain"
                    ]
                else:
                    fallback_suggs = [
                        f"{main_word} {field_term}",
                        f"Standardized {main_word} {field_term}",
                        f"Enterprise {main_word} Governance"
                    ]
            
            print(f"[API SUGGEST FALLBACK SYNTHESIS] Synthesized suggestions offline: {fallback_suggs}")
            return {"suggestions": fallback_suggs}


    # Dynamic offline synthesis fallback if context is empty or we have no parsed suggestions
    print("[API SUGGEST EMPTY] No context provided or LLM error, returning empty suggestions.")
    return {"suggestions": []}

# 1. Data Products
@app.get("/api/products")
def get_products(db: Session = Depends(get_db)):
    return db.query(DataProduct).all()

@app.post("/api/products")
def create_product(product: ProductCreate, db: Session = Depends(get_db)):
    db_product = DataProduct(
        name=product.name,
        description=product.description,
        uc_owner=product.uc_owner,
        tags=product.tags,
        type=product.type or "Ingestion",
        global_parameters=json.dumps(product.global_parameters or []),
        global_instruction=product.global_instruction,
        is_enabled=product.is_enabled if product.is_enabled is not None else True,
        owner_group=product.owner_group,
        created_by=product.created_by or "admin",
        updated_by=product.updated_by or "admin"
    )
    try:
        db.add(db_product)
        db.commit()
        db.refresh(db_product)
        # Log action
        db.add(SystemLog(
            level="INFO", 
            message=f"Data Product created: {product.name}",
            created_by=product.created_by or "admin",
            updated_by=product.updated_by or "admin"
        ))
        db.commit()
        return db_product
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Product creation failed: {e}")

@app.put("/api/products/{product_id}")
def update_product(product_id: int, product: ProductCreate, db: Session = Depends(get_db)):
    db_product = db.query(DataProduct).filter(DataProduct.id == product_id).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Data Product not found")
    
    db_product.name = product.name
    db_product.description = product.description
    db_product.uc_owner = product.uc_owner
    db_product.tags = product.tags
    if product.type is not None:
        db_product.type = product.type
    db_product.global_parameters = json.dumps(product.global_parameters or [])
    db_product.global_instruction = product.global_instruction
    
    if product.is_enabled is not None:
        db_product.is_enabled = product.is_enabled
    if product.owner_group is not None:
        db_product.owner_group = product.owner_group
    if product.updated_by:
        db_product.updated_by = product.updated_by
        
    try:
        db.commit()
        db.refresh(db_product)
        # Log action
        db.add(SystemLog(
            level="INFO", 
            message=f"Data Product updated: {product.name}",
            created_by=product.updated_by or "admin",
            updated_by=product.updated_by or "admin"
        ))
        db.commit()
        return db_product
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Product update failed: {e}")

@app.delete("/api/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db)):
    db_product = db.query(DataProduct).filter(DataProduct.id == product_id).first()
    if not db_product:
        raise HTTPException(status_code=404, detail="Data Product not found")
    try:
        db.delete(db_product)
        db.add(SystemLog(
            level="INFO",
            message=f"Data Product deleted: {db_product.name}"
        ))
        db.commit()
        return {"status": "success", "message": "Product deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Product deletion failed: {e}")

# 2. Data Projects
@app.get("/api/projects")
def get_projects(product_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(DataProject)
    if product_id is not None:
        query = query.filter(DataProject.data_product_id == product_id)
    return query.all()

@app.post("/api/projects")
def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    # Check if data product exists
    prod = db.query(DataProduct).filter(DataProduct.id == project.data_product_id).first()
    if not prod:
        raise HTTPException(status_code=404, detail="Data Product not found")
        
    db_project = DataProject(
        name=project.name,
        description=project.description,
        data_product_id=project.data_product_id,
        is_enabled=project.is_enabled if project.is_enabled is not None else True,
        parameters=json.dumps(project.parameters or {}),
        databricks_url=project.databricks_url or "https://gcp-workspace.cloud.databricks.com",
        catalog_name=project.catalog_name or "main",
        schema_name=project.schema_name or "default",
        table_prefix=project.table_prefix or "",
        instructions=project.instructions,
        created_by=project.created_by or "admin",
        updated_by=project.updated_by or "admin"
    )
    try:
        db.add(db_project)
        db.commit()
        db.refresh(db_project)
        
        # Log action
        db.add(SystemLog(
            level="INFO", 
            message=f"Data Project created: {project.name}", 
            project_id=db_project.id,
            created_by=project.created_by or "admin",
            updated_by=project.updated_by or "admin"
        ))
        db.commit()
        return db_project
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Project creation failed: {e}")

@app.put("/api/projects/{project_id}")
def update_project(project_id: int, project: ProjectCreate, db: Session = Depends(get_db)):
    db_project = db.query(DataProject).filter(DataProject.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Data Project not found")
        
    db_project.name = project.name
    db_project.description = project.description
    db_project.data_product_id = project.data_product_id
    db_project.databricks_url = project.databricks_url or "https://gcp-workspace.cloud.databricks.com"
    db_project.catalog_name = project.catalog_name or "main"
    db_project.schema_name = project.schema_name or "default"
    db_project.table_prefix = project.table_prefix or ""
    
    if project.instructions is not None:
        db_project.instructions = project.instructions
        
    if project.is_enabled is not None:
        db_project.is_enabled = project.is_enabled
    if project.parameters is not None:
        db_project.parameters = json.dumps(project.parameters)
    if project.updated_by:
        db_project.updated_by = project.updated_by
        
    try:
        db.commit()
        db.refresh(db_project)
        
        # Log action
        db.add(SystemLog(
            level="INFO", 
            message=f"Data Project updated: {project.name}", 
            project_id=db_project.id,
            created_by=project.updated_by or "admin",
            updated_by=project.updated_by or "admin"
        ))
        db.commit()
        return db_project
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Project update failed: {e}")

@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    db_project = db.query(DataProject).filter(DataProject.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Data Project not found")
    try:
        db.delete(db_project)
        db.add(SystemLog(
            level="INFO",
            message=f"Data Project deleted: {db_project.name}"
        ))
        db.commit()
        return {"status": "success", "message": "Project deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Project deletion failed: {e}")

@app.post("/api/projects/{project_id}/settings")
def update_project_settings(project_id: int, settings: Dict[str, Any], db: Session = Depends(get_db)):
    db_project = db.query(DataProject).filter(DataProject.id == project_id).first()
    if not db_project:
        raise HTTPException(status_code=404, detail="Data Project not found")
        
    if "databricks_url" in settings:
        db_project.databricks_url = settings["databricks_url"]
    if "catalog_name" in settings:
        db_project.catalog_name = settings["catalog_name"]
    if "schema_name" in settings:
        db_project.schema_name = settings["schema_name"]
    if "table_prefix" in settings:
        db_project.table_prefix = settings["table_prefix"]
    if "instructions" in settings:
        db_project.instructions = settings["instructions"]
    if "is_enabled" in settings:
        db_project.is_enabled = settings["is_enabled"]
    if "parameters" in settings:
        db_project.parameters = json.dumps(settings["parameters"])
    if "updated_by" in settings:
        db_project.updated_by = settings["updated_by"]
        
    db.commit()
    db.refresh(db_project)
    
    # Log update
    db.add(SystemLog(
        level="INFO", 
        message=f"Data Project {db_project.name} settings updated.", 
        project_id=project_id,
        created_by=settings.get("updated_by", "admin"),
        updated_by=settings.get("updated_by", "admin")
    ))
    db.commit()
    return db_project

# 2.5 Tools
@app.get("/api/tools")
def get_tools(db: Session = Depends(get_db)):
    tools = db.query(Tool).all()
    result = []
    for tool in tools:
        result.append({
            "id": tool.id,
            "name": tool.name,
            "description": tool.description,
            "type": tool.type,
            "code": tool.code,
            "parameters": json.loads(tool.parameters or "[]"),
            "is_enabled": tool.is_enabled,
            "created_at": tool.created_at
        })
    return result

@app.post("/api/tools")
def create_tool(tool: ToolCreate, db: Session = Depends(get_db)):
    db_tool = Tool(
        name=tool.name,
        description=tool.description,
        type=tool.type or "python",
        code=tool.code,
        parameters=json.dumps(tool.parameters or []),
        is_enabled=tool.is_enabled if tool.is_enabled is not None else True,
        created_by=tool.created_by or "admin",
        updated_by=tool.updated_by or "admin"
    )
    try:
        db.add(db_tool)
        db.commit()
        db.refresh(db_tool)
        db.add(SystemLog(
            level="INFO",
            message=f"New tool registered in Tool Studio: {tool.name}"
        ))
        db.commit()
        return db_tool
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Tool registration failed: {e}")

@app.put("/api/tools/{tool_id}")
def update_tool(tool_id: int, tool: ToolCreate, db: Session = Depends(get_db)):
    db_tool = db.query(Tool).filter(Tool.id == tool_id).first()
    if not db_tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    db_tool.name = tool.name
    db_tool.description = tool.description
    db_tool.type = tool.type
    db_tool.code = tool.code
    db_tool.parameters = json.dumps(tool.parameters or [])
    if tool.is_enabled is not None:
        db_tool.is_enabled = tool.is_enabled
    if tool.updated_by:
        db_tool.updated_by = tool.updated_by
    try:
        db.commit()
        db.refresh(db_tool)
        return db_tool
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Tool update failed: {e}")

@app.delete("/api/tools/{tool_id}")
def delete_tool(tool_id: int, db: Session = Depends(get_db)):
    db_tool = db.query(Tool).filter(Tool.id == tool_id).first()
    if not db_tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    try:
        db.delete(db_tool)
        db.commit()
        return {"status": "success", "message": "Tool deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Tool deletion failed: {e}")

@app.post("/api/tools/test")
def test_tool(req: ToolTestInput, db: Session = Depends(get_db)):
    import sys
    import io
    import traceback
    import requests
    from sqlalchemy import text

    tool_type = req.type.lower()
    if tool_type == "python":
        class DualStream:
            def __init__(self, s1, s2, logger_func):
                self.s1 = s1
                self.s2 = s2
                self.logger_func = logger_func
                self.buffer = ""
            def write(self, data):
                self.s1.write(data)
                self.s2.write(data)
                self.buffer += data
                while "\n" in self.buffer:
                    line, self.buffer = self.buffer.split("\n", 1)
                    if line.strip():
                        self.logger_func(line)
            def flush(self):
                try: self.s1.flush()
                except: pass
                try: self.s2.flush()
                except: pass
                if self.buffer.strip():
                    self.logger_func(self.buffer)
                    self.buffer = ""

        old_stdout = sys.stdout
        new_stdout = io.StringIO()
        sys.stdout = DualStream(old_stdout, new_stdout, logger.info)
        try:
            local_env = {
                **req.inputs, 
                "inputs": req.inputs,
                "json": json,
                "os": os,
                "sys": sys,
                "requests": requests
            }
            exec(req.code, local_env, local_env)
            output = new_stdout.getvalue()
            # extract serializable local variables that were modified/created
            serializable_vars = {}
            for k, v in local_env.items():
                if k.startswith('_'):
                    continue
                try:
                    json.dumps(v)
                    serializable_vars[k] = v
                except Exception:
                    serializable_vars[k] = str(v)
            return {
                "status": "success",
                "output": output or "Python script completed successfully (no print output).",
                "variables": serializable_vars
            }
        except Exception as e:
            return {
                "status": "error",
                "output": new_stdout.getvalue(),
                "traceback": traceback.format_exc()
            }
        finally:
            sys.stdout = old_stdout

    elif tool_type == "sql":
        sql_query = req.code
        for k, v in req.inputs.items():
            sql_query = sql_query.replace(f"{{{k}}}", str(v))
        try:
            res = db.execute(text(sql_query))
            if res.returns_rows:
                rows = []
                for row in res.fetchall()[:100]:
                    # Convert Row/Mapping to dict safely
                    try:
                        r_dict = dict(row)
                    except (TypeError, ValueError):
                        # fallback for older sqlalchemy versions / sqlite row mapping
                        r_dict = dict(row._mapping) if hasattr(row, '_mapping') else {}
                    rows.append(r_dict)
                # make rows JSON serializable by converting datetime objects
                for row in rows:
                    for k, v in row.items():
                        if isinstance(v, (datetime.datetime, datetime.date)):
                            row[k] = v.isoformat()
                return {
                    "status": "success",
                    "output": f"Executed SQL successfully. Returned {len(rows)} rows.",
                    "variables": {"rows": rows}
                }
            else:
                db.commit()
                return {
                    "status": "success",
                    "output": "Executed SQL command successfully (no rows returned).",
                    "variables": {"rowcount": res.rowcount}
                }
        except Exception as e:
            return {
                "status": "error",
                "output": str(e),
                "traceback": traceback.format_exc()
            }

    elif tool_type == "api":
        url = req.code.strip()
        params = {}
        for k, v in req.inputs.items():
            if f"{{{k}}}" in url:
                url = url.replace(f"{{{k}}}", str(v))
            else:
                params[k] = v
        try:
            response = requests.get(url, params=params, timeout=5)
            return {
                "status": "success",
                "output": f"HTTP GET Request Successful.\nStatus Code: {response.status_code}\n\nResponse Content:\n{response.text[:1000]}",
                "variables": {
                    "status_code": response.status_code,
                    "headers": dict(response.headers),
                    "content": response.text[:2000]
                }
            }
        except Exception as e:
            return {
                "status": "error",
                "output": f"HTTP GET Request Failed: {e}",
                "traceback": traceback.format_exc()
            }
    else:
        return {
            "status": "error",
            "output": f"Unknown tool type: {req.type}"
        }

def execute_actual_react_loop(instructions: str, inputs: dict, db: Session, model_name: str = "gemini-2.5-flash", available_tool_names: list = None, history: list = None, llm_provider: str = "gemini", experiment_id: str = None, endpoint_name: str = None):
    import google.genai as genai
    from google.genai import types
    import re
    import json
    import os
    import requests
    import datetime

    # Enforce behavior guidelines
    behavior_guidelines = """

CRITICAL BEHAVIOR GUIDELINES FOR THE AGENT:
1. You must execute your instructions and skills step-by-step in a sequential order. Do NOT skip any steps or jump straight to the final outputs.
2. Check if your instructions or assigned skills contain any parameter placeholders (e.g. `{{placeholder_name}}` or `{placeholder_name}`).
3. If any such placeholder is not provided in your inputs or previous conversation context, you MUST immediately STOP and tell the user that you are missing the required parameters (list them explicitly) and ask the user to provide them. Do NOT make up or assume values for missing parameters.
4. Only when all parameters are provided, proceed with executing the steps using the provided tools (e.g. calling sync tools to extract data, query tools to write/read tables, and profile tools to generate statistics)."""
    
    instructions = instructions + behavior_guidelines

    query = db.query(Tool).filter(Tool.is_enabled == True)
    if available_tool_names:
        query = query.filter(Tool.name.in_(available_tool_names))
    active_tools = query.all()
    
    tool_declarations = []
    openai_tools = []
    tool_map = {}
    
    for t in active_tools:
        properties = {}
        required = []
        try:
            params = json.loads(t.parameters)
            for p in params:
                p_name = p.get('name')
                p_type = p.get('type')
                t_type = types.Type.STRING
                openai_type = "string"
                if p_type in ('integer', 'number'):
                    t_type = types.Type.INTEGER
                    openai_type = "integer"
                elif p_type == 'boolean':
                    t_type = types.Type.BOOLEAN
                    openai_type = "boolean"
                
                properties[p_name] = types.Schema(type=t_type, description=p.get('description', ''))
                if p.get('required'): required.append(p_name)
        except Exception:
            pass
            
        func_name = re.sub(r'[^a-zA-Z0-9_]', '_', t.name)
        if not re.match(r'^[a-zA-Z_]', func_name):
            func_name = 'tool_' + func_name
            
        tool_map[func_name] = t
        
        func_decl = types.FunctionDeclaration(
            name=func_name,
            description=t.description or f"Executes {t.name}",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties=properties,
                required=required
            ) if properties else None
        )
        tool_declarations.append(func_decl)

        # Standard OpenAI schema
        openai_tools.append({
            "type": "function",
            "function": {
                "name": func_name,
                "description": t.description or f"Executes {t.name}",
                "parameters": {
                    "type": "object",
                    "properties": {k: {"type": "string" if v.type == types.Type.STRING else "integer" if v.type == types.Type.INTEGER else "boolean", "description": v.description} for k, v in properties.items()},
                    "required": required
                } if properties else {"type": "object", "properties": {}}
            }
        })
        
    gemini_tools = [types.Tool(function_declarations=tool_declarations)] if tool_declarations else None
    
    # Check environment variable overrides
    env_provider = os.getenv("LLM_PROVIDER")
    if env_provider:
        llm_provider = env_provider
    experiment_id = os.getenv("DATABRICKS_LLM_EXPERIMENT_ID") or experiment_id
    endpoint_name = os.getenv("DATABRICKS_LLM_ENDPOINT_NAME") or endpoint_name

    # Check if Databricks, Azure OpenAI or Azure Foundry is selected
    if llm_provider in ["databricks", "azure_openai", "azure_ai_foundry"]:
        host = ""
        token = ""
        url = ""
        headers = {}
        actual_endpoint = ""
        
        if llm_provider == "databricks":
            host = os.environ.get("DATABRICKS_HOST", "").rstrip("/")
            token = os.environ.get("DATABRICKS_TOKEN")
            actual_endpoint = endpoint_name or "databricks-meta-llama-3-1-70b-instruct"
            url = f"{host}/api/2.0/serving-endpoints/{actual_endpoint}/invocations"
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
        elif llm_provider == "azure_openai":
            token = os.environ.get("AZURE_OPENAI_API_KEY")
            host = os.environ.get("AZURE_OPENAI_ENDPOINT", "").rstrip("/")
            actual_endpoint = os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4o")
            url = f"{host}/openai/deployments/{actual_endpoint}/chat/completions?api-version=2023-05-15"
            headers = {
                "api-key": token,
                "Content-Type": "application/json"
            }
        elif llm_provider == "azure_ai_foundry":
            token = os.environ.get("AZURE_FOUNDRY_API_KEY")
            host = os.environ.get("AZURE_FOUNDRY_ENDPOINT", "").rstrip("/")
            url = f"{host}/chat/completions"
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            actual_endpoint = "azure-ai-foundry"
            
        if not url or (llm_provider == "databricks" and (not host or not token)) or (llm_provider in ["azure_openai", "azure_ai_foundry"] and (not host or not token)):
            trace = []
            trace.append(f"### [{llm_provider.upper()} RUNTIME - REACT LOOP]")
            trace.append(f"({llm_provider.upper()} credentials or endpoint not configured. Executing mock ReAct simulation.)")
            trace.append(f"**Selected Endpoint/Deployment:** {actual_endpoint}")
            
            if tool_map:
                first_tool_name = list(tool_map.keys())[0]
                t_db = tool_map[first_tool_name]
                trace.append(f"- **Agent Decision:** Called `{first_tool_name}` with mock arguments.")
                mock_req = ToolTestInput(code=t_db.code, type=t_db.type, inputs={})
                tool_res = test_tool(mock_req, db)
                trace.append(f"  - **Tool Result ({tool_res.get('status')}):**\n```\n{str(tool_res.get('output'))[:500]}\n```")
            trace.append(f"\n#### Final Output\n{llm_provider.upper()} served LLM model completed all tasks successfully.")
            return "\n".join(trace)

        # MLflow Experiment tracking run log
        if experiment_id and llm_provider == "databricks":
            try:
                import mlflow
                mlflow.set_tracking_uri(host)
                with mlflow.start_run(experiment_id=experiment_id, run_name=f"ReAct_Workflow_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}"):
                    mlflow.log_param("instructions_length", len(instructions))
                    mlflow.log_param("tools_count", len(openai_tools))
            except Exception as mlflow_err:
                print(f"[MLflow Error] Logging react run failed: {mlflow_err}")

        messages = [
            {"role": "system", "content": instructions}
        ]
        
        prompt = ""
        if history:
            prompt += "Previous Conversation Context:\n"
            for msg in history:
                prompt += f"{msg.get('role', 'user').upper()}: {msg.get('content', '')}\n"
            prompt += "\n"
        prompt += f"New User Request / Inputs: {json.dumps(inputs)}\nPlease complete the task using the provided tools."
        messages.append({"role": "user", "content": prompt})
        
        trace = []
        try:
            for turn in range(8):
                payload = {
                    "messages": messages,
                    "temperature": 0.1,
                    "max_tokens": 1500
                }
                if openai_tools:
                    payload["tools"] = openai_tools
                    
                print(f"[{llm_provider.upper()} ReAct] Querying '{actual_endpoint}' (turn {turn})...")
                response = requests.post(url, headers=headers, json=payload, timeout=45)
                if response.status_code != 200:
                    trace.append(f"[ERROR] {llm_provider.upper()} Serving Endpoint failed with code {response.status_code}: {response.text}")
                    break
                    
                res_data = response.json()
                choice = res_data["choices"][0] if "choices" in res_data else {}
                msg = choice.get("message", {})
                
                msg_to_append = {
                    "role": "assistant",
                    "content": msg.get("content") or ""
                }
                if msg.get("tool_calls"):
                    msg_to_append["tool_calls"] = msg.get("tool_calls")
                messages.append(msg_to_append)
                
                if msg.get("tool_calls"):
                    for tc in msg.get("tool_calls"):
                        tc_id = tc.get("id")
                        func_info = tc.get("function", {})
                        func_name = func_info.get("name")
                        
                        args_str = func_info.get("arguments") or "{}"
                        try:
                            args = json.loads(args_str) if isinstance(args_str, str) else args_str
                        except Exception:
                            args = {}
                            
                        trace.append(f"- **Agent Decision (Databricks LLM):** Called `{func_name}` with args: `{json.dumps(args)}`")
                        
                        if func_name in tool_map:
                            t_db = tool_map[func_name]
                            mock_req = ToolTestInput(code=t_db.code, type=t_db.type, inputs=args)
                            tool_res = test_tool(mock_req, db)
                            
                            display_output = str(tool_res.get('output'))[:500]
                            if tool_res.get('variables') and "no print output" in display_output:
                                display_output += f"\nVariables: {json.dumps(tool_res.get('variables'))[:1000]}"
                            
                            trace.append(f"  - **Tool Result ({tool_res.get('status')}):**\n```\n{display_output}\n```")
                            
                            messages.append({
                                "role": "tool",
                                "tool_call_id": tc_id,
                                "name": func_name,
                                "content": json.dumps(tool_res)
                            })
                        else:
                            trace.append(f"  - **Tool Call Failed:** `{func_name}` not recognized.")
                            messages.append({
                                "role": "tool",
                                "tool_call_id": tc_id,
                                "name": func_name,
                                "content": json.dumps({"error": f"Tool {func_name} not found"})
                            })
                else:
                    content_text = msg.get("content") or ""
                    trace.append(f"\n#### Final Output\n{content_text}")
                    break
                    
            return "\n".join(trace)
        except Exception as e:
            import traceback
            return f"Error executing actual Databricks behavior engine: {e}\n\nTraceback: {traceback.format_exc()}"

    # Otherwise default to Gemini
    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    try:
        chat = client.chats.create(
            model=model_name,
            config=types.GenerateContentConfig(
                system_instruction=instructions,
                tools=gemini_tools
            )
        )
        
        trace = []
        prompt = ""
        if history:
            prompt += "Previous Conversation Context:\n"
            for msg in history:
                prompt += f"{msg.get('role', 'user').upper()}: {msg.get('content', '')}\n"
            prompt += "\n"
        
        prompt += f"New User Request / Inputs: {json.dumps(inputs)}\nPlease complete the task using the provided tools."
        response = chat.send_message(prompt)
        
        for turn in range(8): # max 8 tool calls
            if response.function_calls:
                for fc in response.function_calls:
                    func_name = fc.name
                    args = {k: v for k, v in fc.args.items()} if fc.args else {}
                    trace.append(f"- **Agent Decision:** Called `{func_name}` with args: `{json.dumps(args)}`")
                    
                    if func_name in tool_map:
                        t_db = tool_map[func_name]
                        mock_req = ToolTestInput(code=t_db.code, type=t_db.type, inputs=args)
                        tool_res = test_tool(mock_req, db)
                        
                        display_output = str(tool_res.get('output'))[:500]
                        if tool_res.get('variables') and "no print output" in display_output:
                            display_output += f"\nVariables: {json.dumps(tool_res.get('variables'))[:1000]}"
                            
                        trace.append(f"  - **Tool Result ({tool_res.get('status')}):**\n```\n{display_output}\n```")
                        
                        response = chat.send_message(
                            types.Part.from_function_response(
                                name=func_name,
                                response={"result": tool_res}
                            )
                        )
                    else:
                        trace.append(f"  - **Tool Call Failed:** `{func_name}` not recognized.")
                        response = chat.send_message(
                            types.Part.from_function_response(
                                name=func_name,
                                response={"error": f"Tool {func_name} not found"}
                            )
                        )
            else:
                trace.append(f"\n#### Final Output\n{response.text}")
                break
                
        return "\n".join(trace)
    except Exception as e:
        import traceback
        return f"Error executing actual behavior engine: {e}\n\nTraceback: {traceback.format_exc()}"

# 3. Skills
@app.get("/api/skills")
def get_skills(db: Session = Depends(get_db)):
    skills = db.query(Skill).all()
    result = []
    for skill in skills:
        result.append({
            "id": skill.id,
            "name": skill.name,
            "description": skill.description,
            "instruction": skill.instruction,
            "parameters": json.loads(skill.parameters or "[]"),
            "output_definition": skill.output_definition,
            "tools": json.loads(skill.tools or "[]"),
            "is_enabled": skill.is_enabled,
            "created_at": skill.created_at
        })
    return result

@app.post("/api/skills")
def create_skill(skill: SkillCreate, db: Session = Depends(get_db)):
    db_skill = Skill(
        name=skill.name,
        description=skill.description,
        instruction=skill.instruction,
        parameters=json.dumps(skill.parameters or []),
        output_definition=skill.output_definition,
        tools=json.dumps(skill.tools or []),
        is_enabled=skill.is_enabled if skill.is_enabled is not None else True,
        created_by=skill.created_by or "admin",
        updated_by=skill.updated_by or "admin"
    )
    try:
        db.add(db_skill)
        db.commit()
        db.refresh(db_skill)
        db.add(SystemLog(
            level="INFO", 
            message=f"New skill registered in Skill Studio: {skill.name}",
            created_by=skill.created_by or "admin",
            updated_by=skill.updated_by or "admin"
        ))
        db.commit()
        return db_skill
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Skill creation failed: {e}")

@app.put("/api/skills/{skill_id}")
def update_skill(skill_id: int, skill: SkillCreate, db: Session = Depends(get_db)):
    db_skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not db_skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    db_skill.name = skill.name
    db_skill.description = skill.description
    db_skill.instruction = skill.instruction
    db_skill.parameters = json.dumps(skill.parameters or [])
    db_skill.output_definition = skill.output_definition
    db_skill.tools = json.dumps(skill.tools or [])
    if skill.is_enabled is not None:
        db_skill.is_enabled = skill.is_enabled
    if skill.updated_by:
        db_skill.updated_by = skill.updated_by
    try:
        db.commit()
        db.refresh(db_skill)
        return db_skill
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Skill update failed: {e}")

@app.delete("/api/skills/{skill_id}")
def delete_skill(skill_id: int, db: Session = Depends(get_db)):
    db_skill = db.query(Skill).filter(Skill.id == skill_id).first()
    if not db_skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    try:
        db.delete(db_skill)
        db.commit()
        return {"status": "success", "message": "Skill deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Skill deletion failed: {e}")

@app.post("/api/skills/test")
def test_skill(req: SkillTestInput, db: Session = Depends(get_db)):
    try:
        system_instruction = "You are a Databricks AI Agent. Use the provided tools to fulfill the user's request. Explain your reasoning at each step."
        instructions = f"Skill Instructions:\n{req.instruction}"
        output = execute_actual_react_loop(
            instructions=system_instruction + "\n\n" + instructions,
            inputs=req.inputs,
            db=db,
            available_tool_names=req.tools if req.tools else None,
            history=req.history
        )
        return {"status": "success", "output": output}
    except Exception as e:
        return {"status": "error", "output": f"Execution failed: {e}"}

# 4. Agents
@app.get("/api/agents")
def get_agents(db: Session = Depends(get_db)):
    agents = db.query(Agent).all()
    result = []
    for agent in agents:
        agent_dict = {
            "id": agent.id,
            "name": agent.name,
            "role": agent.role,
            "skills": json.loads(agent.skills or "[]"),
            "tools": json.loads(agent.tools or "[]"),
            "instructions": agent.instructions,
            "introduction": agent.introduction,
            "is_enabled": agent.is_enabled,
            "created_at": agent.created_at
        }
        result.append(agent_dict)
    return result

@app.post("/api/agents")
def create_agent(agent: AgentCreate, db: Session = Depends(get_db)):
    generated_intro = generate_agent_intro_text(
        agent_name=agent.name,
        agent_role=agent.role,
        agent_instructions=agent.instructions or "",
        skill_names=agent.skills or [],
        db=db
    )
    db_agent = Agent(
        name=agent.name,
        role=agent.role,
        skills=json.dumps(agent.skills or []),
        tools=json.dumps(agent.tools or []),
        instructions=agent.instructions,
        introduction=generated_intro,
        is_enabled=agent.is_enabled if agent.is_enabled is not None else True,
        created_by=agent.created_by or "admin",
        updated_by=agent.updated_by or "admin"
    )
    try:
        db.add(db_agent)
        db.commit()
        db.refresh(db_agent)
        db.add(SystemLog(
            level="INFO",
            message=f"New agent registered in Agent Studio: {agent.name}"
        ))
        db.commit()
        return db_agent
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Agent registration failed: {e}")

@app.put("/api/agents/{agent_id}")
def update_agent(agent_id: int, agent: AgentCreate, db: Session = Depends(get_db)):
    db_agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not db_agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    generated_intro = generate_agent_intro_text(
        agent_name=agent.name,
        agent_role=agent.role,
        agent_instructions=agent.instructions or "",
        skill_names=agent.skills or [],
        db=db
    )
    db_agent.name = agent.name
    db_agent.role = agent.role
    db_agent.skills = json.dumps(agent.skills or [])
    db_agent.tools = json.dumps(agent.tools or [])
    db_agent.instructions = agent.instructions
    db_agent.introduction = generated_intro
    if agent.is_enabled is not None:
        db_agent.is_enabled = agent.is_enabled
    if agent.updated_by:
        db_agent.updated_by = agent.updated_by
    try:
        db.commit()
        db.refresh(db_agent)
        return db_agent
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Agent update failed: {e}")

@app.delete("/api/agents/{agent_id}")
def delete_agent(agent_id: int, db: Session = Depends(get_db)):
    db_agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not db_agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    try:
        db.delete(db_agent)
        db.commit()
        return {"status": "success", "message": "Agent deleted"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Agent deletion failed: {e}")

@app.post("/api/agents/{agent_id}/skills")
def assign_agent_skills(agent_id: int, payload: SkillAssignment, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    generated_intro = generate_agent_intro_text(
        agent_name=agent.name,
        agent_role=agent.role,
        agent_instructions=agent.instructions or "",
        skill_names=payload.skills or [],
        db=db
    )
    
    agent.skills = json.dumps(payload.skills)
    agent.introduction = generated_intro
    if payload.tools is not None:
        agent.tools = json.dumps(payload.tools)
    db.commit()
    db.refresh(agent)
    
    db.add(SystemLog(level="INFO", message=f"Skills/tools updated for agent {agent.name}."))
    db.commit()
    return {"id": agent.id, "name": agent.name, "skills": payload.skills, "tools": json.loads(agent.tools or "[]"), "introduction": agent.introduction}

@app.post("/api/agents/test")
def test_agent(req: AgentTestInput, db: Session = Depends(get_db)):
    try:
        system_instruction = f"""You are an AI Agent. Name: {req.name}, Role: {req.role}.

CRITICAL BEHAVIOR RULES:
1. You must execute your instructions and skills step-by-step. Do NOT skip steps or jump straight to the final results.
2. Carefully inspect all your system instructions, agent instructions, and skill instructions for any parameter placeholders enclosed in double curly braces (e.g. `{{placeholder}}`) or single curly braces (e.g. `{placeholder}`), such as `{{analysis_schema}}` or `{{dataset_name}}`.
3. If any such parameter placeholder is NOT provided in your current inputs (or in the conversation history), you MUST NOT assume a value, make it up, or skip the step. Instead, you MUST immediately STOP and reply to the user, asking them to provide values for those specific missing parameters before you execute any tools or perform the task.
4. Only once the user provides these values (which will appear in the conversation history), you should proceed to execute the steps in sequence (e.g., fetch the raw API data, check if the table exists or create it, write the raw data, run profiling queries on the table, and write the profiling statistics into the target profile table)."""
        
        # Resolve skills details and inherited tools
        skills_details = ""
        inherited_tools = set()
        if req.skills:
            db_skills = db.query(Skill).filter(Skill.name.in_(req.skills)).all()
            for idx, sk in enumerate(db_skills):
                skills_details += f"\n- Skill {idx+1}: {sk.name}\n  Description: {sk.description or 'None'}\n  Instruction: {sk.instruction or 'None'}\n"
                if sk.tools:
                    try:
                        sk_tools = json.loads(sk.tools)
                        if isinstance(sk_tools, list):
                            for t in sk_tools:
                                inherited_tools.add(t)
                    except:
                        pass
        
        instructions = f"System Instructions:\n{req.instructions}\n\nAssigned Skills Details:\n{skills_details or 'None'}"
        
        output = execute_actual_react_loop(
            instructions=system_instruction + "\n\n" + instructions,
            inputs=req.inputs,
            db=db,
            available_tool_names=list(inherited_tools) if inherited_tools else None,
            history=req.history
        )
        return {"status": "success", "output": output}
    except Exception as e:
        return {"status": "error", "output": f"Execution failed: {e}"}

# 5. Workflows & State Orchestration Runtime
@app.get("/api/workflows")
def get_workflows(project_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Workflow)
    if project_id is not None:
        query = query.filter(Workflow.data_project_id == project_id)
    workflows = query.all()
    
    from backend.agents.graph import resolve_workflow_parameters
    result = []
    for wf in workflows:
        result.append({
            "id": wf.id,
            "name": wf.name,
            "description": wf.description,
            "data_product_id": wf.data_product_id,
            "data_project_id": wf.data_project_id,
            "agents_sequence": json.loads(wf.agents_sequence or "[]"),
            "status": wf.status,
            "is_enabled": wf.is_enabled,
            "schedule_cron": wf.schedule_cron,
            "schedule_enabled": wf.schedule_enabled,
            "last_run_at": wf.last_run_at.isoformat() if wf.last_run_at else None,
            "parameters": json.loads(wf.parameters or "{}"),
            "missing_parameters": json.loads(wf.missing_parameters or "[]"),
            "resolved_parameters": resolve_workflow_parameters(wf, db),
            "current_agent": wf.current_agent,
            "next_agent": wf.next_agent,
            "history_logs": json.loads(wf.history_logs or "[]"),
            "created_at": wf.created_at,
            "updated_at": wf.updated_at
        })
    return result

@app.post("/api/workflows")
def create_workflow(wf: WorkflowCreate, db: Session = Depends(get_db)):
    generated_desc = generate_workflow_description(
        workflow_name=wf.name,
        product_id=wf.data_product_id,
        project_id=wf.data_project_id,
        agents_sequence=wf.agents_sequence,
        db=db
    )
    db_wf = Workflow(
        name=wf.name,
        description=generated_desc,
        data_product_id=wf.data_product_id,
        data_project_id=wf.data_project_id,
        agents_sequence=json.dumps(wf.agents_sequence),
        status="Idle",
        parameters="{}",
        missing_parameters="[]",
        current_agent="RequirementGatheringAgent",
        next_agent="RequirementGatheringAgent",
        history_logs="[]",
        is_enabled=wf.is_enabled if wf.is_enabled is not None else True,
        schedule_cron=wf.schedule_cron,
        schedule_enabled=wf.schedule_enabled if wf.schedule_enabled is not None else False,
        created_by=wf.created_by or "admin",
        updated_by=wf.updated_by or "admin"
    )
    db.add(db_wf)
    db.commit()
    db.refresh(db_wf)
    
    db.add(SystemLog(
        level="INFO", 
        message=f"Workflow '{wf.name}' configured for project ID {wf.data_project_id}.", 
        project_id=wf.data_project_id,
        created_by=wf.created_by or "admin",
        updated_by=wf.updated_by or "admin"
    ))
    db.commit()
    
    return db_wf

@app.put("/api/workflows/{wf_id}")
def update_workflow(wf_id: int, wf: WorkflowCreate, db: Session = Depends(get_db)):
    db_wf = db.query(Workflow).filter(Workflow.id == wf_id).first()
    if not db_wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    generated_desc = generate_workflow_description(
        workflow_name=wf.name,
        product_id=wf.data_product_id,
        project_id=wf.data_project_id,
        agents_sequence=wf.agents_sequence,
        db=db
    )
    db_wf.name = wf.name
    db_wf.description = generated_desc
    db_wf.data_product_id = wf.data_product_id
    db_wf.data_project_id = wf.data_project_id
    db_wf.agents_sequence = json.dumps(wf.agents_sequence)
    db_wf.schedule_cron = wf.schedule_cron
    if wf.schedule_enabled is not None:
        db_wf.schedule_enabled = wf.schedule_enabled
    if wf.is_enabled is not None:
        db_wf.is_enabled = wf.is_enabled
    if wf.updated_by:
        db_wf.updated_by = wf.updated_by
    try:
        db.commit()
        db.refresh(db_wf)
        return db_wf
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Workflow update failed: {e}")

class WorkflowScheduleInput(BaseModel):
    schedule_cron: Optional[str] = None
    schedule_enabled: bool

@app.delete("/api/workflows/{wf_id}")
def delete_workflow(wf_id: int, db: Session = Depends(get_db)):
    db_wf = db.query(Workflow).filter(Workflow.id == wf_id).first()
    if not db_wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    try:
        db.delete(db_wf)
        db.commit()
        return {"status": "success", "message": "Workflow deleted successfully"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Workflow deletion failed: {e}")


# ─── Workflow Execution (Chained Agent Context) ────────────────────────────────

class WorkflowExecuteInput(BaseModel):
    trigger_query: str
    input_parameters: Optional[Dict[str, Any]] = {}

def _execute_actual_react_loop(instructions: str, inputs: dict, db: Session, available_tool_names=None, history=None, llm_provider="gemini", experiment_id=None, endpoint_name=None):
    """Thin wrapper that calls execute_actual_react_loop."""
    try:
        return execute_actual_react_loop(
            instructions=instructions,
            inputs=inputs,
            db=db,
            available_tool_names=available_tool_names,
            history=history or [],
            llm_provider=llm_provider,
            experiment_id=experiment_id,
            endpoint_name=endpoint_name
        )
    except Exception as e:
        return f"[ERROR] Agent execution failed: {e}"

@app.post("/api/workflows/{wf_id}/execute")
def execute_workflow(wf_id: int, payload: WorkflowExecuteInput, db: Session = Depends(get_db)):
    """
    Runs the workflow's agent sequence with chained context:
    - Each agent receives the previous agent's output as part of its context.
    - All outputs are stored in WorkflowExecution.agent_outputs.
    - Each agent output is saved as an Artifact linked to the execution_id.
    """
    db_wf = db.query(Workflow).filter(Workflow.id == wf_id).first()
    if not db_wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if not db_wf.is_enabled:
        raise HTTPException(status_code=400, detail="Workflow is disabled")

    # Parse agent sequence
    try:
        seq = json.loads(db_wf.agents_sequence or "[]")
    except Exception:
        seq = []
    if not seq:
        raise HTTPException(status_code=400, detail="Workflow has no agents in sequence")

    # Create execution record
    exec_id = str(uuid.uuid4())
    execution = WorkflowExecution(
        execution_id=exec_id,
        workflow_id=wf_id,
        status="Running",
        trigger_query=payload.trigger_query,
        input_parameters=json.dumps(payload.input_parameters or {}),
        agent_outputs=json.dumps({}),
        started_at=datetime.datetime.utcnow()
    )
    db.add(execution)
    db.commit()

    # Update workflow status
    db_wf.status = "Running"
    db_wf.last_run_at = datetime.datetime.utcnow()
    db.commit()

    # Fetch DataProject parameters for LLM configuration (checking environment overrides first)
    llm_provider = os.getenv("LLM_PROVIDER")
    experiment_id = os.getenv("DATABRICKS_LLM_EXPERIMENT_ID")
    endpoint_name = os.getenv("DATABRICKS_LLM_ENDPOINT_NAME")

    if not llm_provider:
        from backend.db.models import DataProject
        db_proj = db.query(DataProject).filter(DataProject.id == db_wf.data_project_id).first()
        if db_proj and db_proj.parameters:
            try:
                params = json.loads(db_proj.parameters)
                llm_provider = params.get("llm_provider")
                experiment_id = experiment_id or params.get("databricks_llm_experiment_id")
                endpoint_name = endpoint_name or params.get("databricks_llm_endpoint_name")
            except Exception:
                pass

    llm_provider = llm_provider or "gemini"

    agent_outputs: Dict[str, str] = {}
    previous_output = ""
    error_msg = None

    try:
        for i, agent_name in enumerate(seq):
            db_agent = db.query(Agent).filter(Agent.name == agent_name).first()
            if not db_agent:
                logger.warning(f"Agent '{agent_name}' not found in DB, skipping.")
                agent_outputs[agent_name] = f"[SKIPPED] Agent '{agent_name}' not found."
                continue

            # Build chained system instruction
            chain_context = ""
            if previous_output:
                chain_context = f"""

--- CONTEXT FROM PREVIOUS AGENT ---
{previous_output}
--- END CONTEXT ---

Use the above context from the previous agent as input for your task.
"""

            # Resolve agent skill details and inherited tools
            skills_details = ""
            inherited_tools = set()
            agent_skills = []
            if db_agent.skills:
                try:
                    agent_skills = json.loads(db_agent.skills)
                except Exception:
                    agent_skills = []
            if agent_skills:
                db_skills = db.query(Skill).filter(Skill.name.in_(agent_skills)).all()
                for idx, sk in enumerate(db_skills):
                    skills_details += f"\n- Skill {idx+1}: {sk.name}\n  Description: {sk.description or 'None'}\n  Instruction: {sk.instruction or 'None'}\n"
                    if sk.tools:
                        try:
                            sk_tools = json.loads(sk.tools)
                            if isinstance(sk_tools, list):
                                for t in sk_tools:
                                    inherited_tools.add(t)
                        except:
                            pass

            system_instruction = f"""You are {db_agent.name}, a {db_agent.role}.
This is step {i+1} of {len(seq)} in the '{db_wf.name}' workflow pipeline.

CRITICAL BEHAVIOR RULES:
1. You must execute your instructions and skills step-by-step. Do NOT skip steps or jump straight to the final results.
2. Read the workflow parameters below and resolve any placeholders in your instructions (e.g. `{{analysis_schema}}` or `{dataset_name}`) using these parameters.

Workflow parameters: {json.dumps(payload.input_parameters)}
Original user trigger: {payload.trigger_query}
{chain_context}
Your instructions: {db_agent.instructions or ''}

Assigned Skills Details:
{skills_details or 'None'}"""

            # Determine available tools matching skills, falling back to agent's assigned tools if none inherited
            if inherited_tools:
                tool_names = list(inherited_tools)
            else:
                try:
                    tool_names = json.loads(db_agent.tools or "[]")
                except Exception:
                    tool_names = []

            logger.info(f"[Execution {exec_id}] Running agent {i+1}/{len(seq)}: {agent_name}")

            output = _execute_actual_react_loop(
                instructions=system_instruction,
                inputs={
                    "query": payload.trigger_query,
                    "parameters": payload.input_parameters,
                    "previous_output": previous_output,
                    "step": f"{i+1}/{len(seq)}"
                },
                db=db,
                available_tool_names=tool_names if tool_names else None,
                llm_provider=llm_provider,
                experiment_id=experiment_id,
                endpoint_name=endpoint_name
            )

            agent_outputs[agent_name] = output
            previous_output = output

            # Save agent output as an Artifact linked to this execution
            artifact = Artifact(
                name=f"{agent_name} — {db_wf.name} (Run {exec_id[:8]})",
                type="AgentOutput",
                content=output,
                data_project_id=db_wf.data_project_id,
                execution_id=exec_id,
                agent_name=agent_name,
                status="Draft",
                metadata_json=json.dumps({
                    "workflow_id": wf_id,
                    "workflow_name": db_wf.name,
                    "execution_id": exec_id,
                    "step": i + 1,
                    "total_steps": len(seq)
                })
            )
            db.add(artifact)
            db.commit()

            # Update execution's agent_outputs after each step
            execution.agent_outputs = json.dumps(agent_outputs)
            db.commit()

        # Mark execution complete
        execution.status = "Completed"
        execution.completed_at = datetime.datetime.utcnow()
        db_wf.status = "Completed"

    except Exception as e:
        error_msg = str(e)
        logger.error(f"[Execution {exec_id}] Failed: {e}")
        execution.status = "Failed"
        execution.error_message = error_msg
        execution.completed_at = datetime.datetime.utcnow()
        db_wf.status = "Failed"

    execution.agent_outputs = json.dumps(agent_outputs)
    db.commit()

    db.add(SystemLog(
        level="INFO" if not error_msg else "ERROR",
        message=f"Workflow '{db_wf.name}' execution {exec_id[:8]} {'completed' if not error_msg else 'failed'}.",
        project_id=db_wf.data_project_id
    ))
    db.commit()

    return {
        "execution_id": exec_id,
        "status": execution.status,
        "workflow_name": db_wf.name,
        "agent_outputs": agent_outputs,
        "error": error_msg
    }


@app.get("/api/workflows/{wf_id}/executions")
def list_workflow_executions(wf_id: int, limit: int = 20, db: Session = Depends(get_db)):
    """List all past execution runs for a workflow, newest first."""
    runs = (
        db.query(WorkflowExecution)
        .filter(WorkflowExecution.workflow_id == wf_id)
        .order_by(WorkflowExecution.started_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "execution_id": r.execution_id,
            "workflow_id": r.workflow_id,
            "status": r.status,
            "trigger_query": r.trigger_query,
            "input_parameters": json.loads(r.input_parameters or "{}"),
            "agent_outputs": json.loads(r.agent_outputs or "{}"),
            "error_message": r.error_message,
            "started_at": r.started_at.isoformat() if r.started_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
        }
        for r in runs
    ]


@app.get("/api/executions/{execution_id}")
def get_execution_detail(execution_id: str, db: Session = Depends(get_db)):
    """Get the full details of a specific workflow execution run."""
    r = db.query(WorkflowExecution).filter(WorkflowExecution.execution_id == execution_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Execution not found")
    return {
        "id": r.id,
        "execution_id": r.execution_id,
        "workflow_id": r.workflow_id,
        "status": r.status,
        "trigger_query": r.trigger_query,
        "input_parameters": json.loads(r.input_parameters or "{}"),
        "agent_outputs": json.loads(r.agent_outputs or "{}"),
        "error_message": r.error_message,
        "started_at": r.started_at.isoformat() if r.started_at else None,
        "completed_at": r.completed_at.isoformat() if r.completed_at else None,
    }


@app.get("/api/executions/{execution_id}/artifacts")
def get_execution_artifacts(execution_id: str, db: Session = Depends(get_db)):
    """Get all artifacts produced in a specific workflow execution run."""
    arts = db.query(Artifact).filter(Artifact.execution_id == execution_id).order_by(Artifact.created_at).all()
    return [
        {
            "id": a.id,
            "name": a.name,
            "type": a.type,
            "content": a.content,
            "agent_name": a.agent_name,
            "status": a.status,
            "execution_id": a.execution_id,
            "data_project_id": a.data_project_id,
            "metadata_json": json.loads(a.metadata_json or "{}"),
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in arts
    ]


@app.post("/api/workflows/{wf_id}/schedule")
def schedule_workflow(wf_id: int, payload: WorkflowScheduleInput, db: Session = Depends(get_db)):
    db_wf = db.query(Workflow).filter(Workflow.id == wf_id).first()
    if not db_wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    db_wf.schedule_cron = payload.schedule_cron
    db_wf.schedule_enabled = payload.schedule_enabled
    db_wf.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(db_wf)
    
    db.add(SystemLog(
        level="INFO",
        message=f"Workflow '{db_wf.name}' schedule set to '{payload.schedule_cron}' (Active: {payload.schedule_enabled})",
        project_id=db_wf.data_project_id
    ))
    db.commit()
    return {
        "id": db_wf.id,
        "name": db_wf.name,
        "schedule_cron": db_wf.schedule_cron,
        "schedule_enabled": db_wf.schedule_enabled,
        "last_run_at": db_wf.last_run_at.isoformat() if db_wf.last_run_at else None
    }

@app.post("/api/projects/{project_id}/run")
def execute_project_workflow(project_id: int, payload: WorkflowRunInput, db: Session = Depends(get_db)):
    # 1. Fetch project details
    project = db.query(DataProject).filter(DataProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Data Project not found")
        
    # 2. Get or create workflow for project
    workflow = db.query(Workflow).filter(Workflow.data_project_id == project_id).first()
    if not workflow:
        workflow = Workflow(
            name=f"Workflow-{project.name}",
            description=f"Auto-generated workflow for {project.name}",
            data_product_id=project.data_product_id,
            data_project_id=project.id,
            agents_sequence=json.dumps([
                "RequirementGatheringAgent", "DiscoveryAgent", "DataModellingAgent",
                "SpecCreationAgent", "PipelineGenerationAgent", "PipelineRunningAgent", "TestingAgent"
            ]),
            status="Running",
            parameters="{}",
            missing_parameters="[]",
            current_agent="RequirementGatheringAgent",
            next_agent="RequirementGatheringAgent",
            history_logs="[]",
            created_by="system",
            updated_by="system"
        )
        db.add(workflow)
        db.commit()
        db.refresh(workflow)
        
    # 3. Load active state
    existing_params = json.loads(workflow.parameters or "{}")
    history_logs = json.loads(workflow.history_logs or "[]")
    
    # Load project parameters configured on the DataProject model
    if project.parameters:
        try:
            proj_params = json.loads(project.parameters)
            for pk, pv in proj_params.items():
                if pk != "__custom_params" and pv is not None and pv != "":
                    existing_params[pk] = pv
            if "__custom_params" in proj_params:
                custom_list = proj_params["__custom_params"]
                if isinstance(custom_list, list):
                    for cp in custom_list:
                        cp_name = cp.get("name")
                        cp_val = cp.get("default_value") or cp.get("default")
                        if cp_name and cp_val is not None:
                            existing_params[cp_name] = cp_val
        except Exception as e:
            logger.error(f"Error parsing parameters for project: {e}")
            
    # Load associated data product configuration
    product = db.query(DataProduct).filter(DataProduct.id == project.data_product_id).first()
    if product:
        if product.global_parameters:
            try:
                gps = json.loads(product.global_parameters)
                for gp in gps:
                    name = gp.get("name")
                    val = gp.get("default_value") or gp.get("value") or gp.get("default")
                    if name and name not in existing_params and val is not None:
                        existing_params[name] = val
            except Exception as e:
                logger.error(f"Error parsing global parameters for product: {e}")

    # 4. Merge new parameters passed from UI
    new_params = payload.parameters
    for k, v in new_params.items():
        if v: # Only merge non-empty parameters
            existing_params[k] = v
            
    # Clean missing parameters list
    workflow.status = "Running"
    db.commit()
    
    # 5. Build input state for LangGraph
    # We load any already generated artifacts names
    artifacts_db = db.query(Artifact).filter(Artifact.data_project_id == project_id).all()
    generated_artifacts = [{"name": art.name, "type": art.type, "content": art.content} for art in artifacts_db]
    
    initial_graph_state = {
        "project_id": project.id,
        "data_product_id": project.data_product_id,
        "catalog_name": project.catalog_name,
        "schema_name": project.schema_name,
        "table_prefix": project.table_prefix,
        "current_agent": workflow.current_agent or "RequirementGatheringAgent",
        "next_agent": workflow.next_agent or "RequirementGatheringAgent",
        "parameters": existing_params,
        "generated_artifacts": generated_artifacts,
        "logs": history_logs,
        "status": "Running",
        "global_instruction": product.global_instruction if product else None
    }
    
    # Log triggering
    db.add(SystemLog(
        level="INFO", 
        message=f"Supervisor trigger: routing state transitions for project '{project.name}' starting at agent '{workflow.current_agent}'", 
        project_id=project_id
    ))
    db.commit()
    
    # 6. Invoke LangGraph multi-agent loop
    output_state = run_agent_workflow(initial_graph_state)
    
    # 7. Checkpoint state back to Database
    workflow.status = output_state["status"]
    workflow.current_agent = output_state["current_agent"]
    workflow.next_agent = output_state["next_agent"]
    workflow.parameters = json.dumps(output_state["parameters"])
    workflow.missing_parameters = json.dumps(output_state["missing_parameters"])
    
    # Track any newly appended logs and save to SystemLog
    incoming_logs = output_state["logs"]
    new_logs = incoming_logs[len(history_logs):]
    workflow.history_logs = json.dumps(incoming_logs)
    
    for l in new_logs:
        db.add(SystemLog(
            level=l.get("level", "INFO"),
            message=l.get("message", ""),
            agent_name=l.get("agent_name"),
            project_id=project_id,
            details=json.dumps(output_state["parameters"])
        ))
        
    # Check for new generated artifacts and write to Artifact db
    db_artifact_names = {art.name for art in artifacts_db}
    for art in output_state["generated_artifacts"]:
        if art["name"] not in db_artifact_names:
            db_art = Artifact(
                name=art["name"],
                type=art["type"],
                content=art["content"],
                data_project_id=project_id,
                status="Deployed" if art["type"] in ["PySpark Code", "Databricks SQL"] else "Draft",
                metadata_json=json.dumps({
                    "catalog": project.catalog_name,
                    "schema": project.schema_name,
                    "generated_by": output_state["current_agent"]
                })
            )
            db.add(db_art)
            
    db.commit()
    db.refresh(workflow)
    
    from backend.agents.graph import resolve_workflow_parameters
    # Return formatted response
    return {
        "id": workflow.id,
        "project_id": workflow.data_project_id,
        "status": workflow.status,
        "current_agent": workflow.current_agent,
        "next_agent": workflow.next_agent,
        "parameters": json.loads(workflow.parameters),
        "missing_parameters": json.loads(workflow.missing_parameters),
        "resolved_parameters": resolve_workflow_parameters(workflow, db),
        "history_logs": json.loads(workflow.history_logs)
    }

# 6. Artifacts
@app.get("/api/projects/{project_id}/artifacts")
def get_project_artifacts(project_id: int, db: Session = Depends(get_db)):
    return db.query(Artifact).filter(Artifact.data_project_id == project_id).all()

@app.get("/api/artifacts")
def get_all_artifacts(project_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(Artifact)
    if project_id is not None:
        query = query.filter(Artifact.data_project_id == project_id)
    return query.all()

# 7. System Logs (Observability)
@app.get("/api/logs")
def get_system_logs(
    project_id: Optional[int] = None, 
    level: Optional[str] = None, 
    agent_name: Optional[str] = None,
    db: Session = Depends(get_db)
):
    query = db.query(SystemLog)
    if project_id is not None:
        query = query.filter(SystemLog.project_id == project_id)
    if level is not None and level != "ALL":
        query = query.filter(SystemLog.level == level)
    if agent_name is not None and agent_name != "ALL":
        query = query.filter(SystemLog.agent_name == agent_name)
    return query.order_by(SystemLog.id.desc()).all()
    
@app.get("/api/system/server-logs/stream")
async def stream_server_logs():
    # Write a connection log to ensure the file isn't completely empty
    logger.info("Observability Dashboard connected to live server stream.")
    
    async def log_generator():
        log_file = "agentic_workspace.log"
        if not os.path.exists(log_file):
            yield f"data: Log file not found or hasn't been written to yet.\n\n"
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

# Reset project workflow state endpoint (useful for testing)
@app.post("/api/projects/{project_id}/reset")
def reset_project_workflow(project_id: int, db: Session = Depends(get_db)):
    workflow = db.query(Workflow).filter(Workflow.data_project_id == project_id).first()
    if workflow:
        workflow.status = "Idle"
        workflow.parameters = "{}"
        workflow.missing_parameters = "[]"
        workflow.current_agent = "RequirementGatheringAgent"
        workflow.next_agent = "RequirementGatheringAgent"
        workflow.history_logs = "[]"
        
    # Delete artifacts generated for this project
    db.query(Artifact).filter(Artifact.data_project_id == project_id).delete()
    db.commit()
    
    db.add(SystemLog(level="WARN", message=f"Workflow states and artifacts reset for project ID {project_id}.", project_id=project_id))
    db.commit()
    
    return {"message": "Project workflow state reset successfully"}


def mask_secret(val: Optional[str]) -> str:
    if not val:
        return ""
    val_str = str(val).strip()
    if len(val_str) <= 8:
        return "****"
    return f"{val_str[:6]}...{val_str[-4:]}"

class SettingsUpdateInput(BaseModel):
    settings: Dict[str, Optional[str]]

@app.get("/api/settings")
def get_settings(db: Session = Depends(get_db)):
    settings = db.query(SystemSetting).all()
    result = {}
    for s in settings:
        if s.is_secret and s.value:
            result[s.key] = mask_secret(s.value)
        else:
            result[s.key] = s.value or ""
    return result

@app.post("/api/settings")
def update_settings(payload: SettingsUpdateInput, db: Session = Depends(get_db)):
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


# Serves React Client Assets
# We first try to mount the build folder 'static'. If it's missing (local development without frontend compile), 
# we return a clean HTML placeholder.
static_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")

if os.path.exists(static_dir) and os.listdir(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
else:
    @app.get("/", response_class=HTMLResponse)
    def index_placeholder():
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

# Reload Trigger Comment: 4

