"""
API router for Workflows and Execution Runs.

Defines HTTP routes for CRUD operations on workflows, executing multi-agent runs,
scheduling automation crons, fetching execution history/artifacts, and generating suggestions.
"""

import json
import uuid
import datetime
import re
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.models import Workflow, DataProject, DataProduct, Artifact, SystemLog, Agent, Skill, Tool, WorkflowExecution
from ..schemas import WorkflowCreate, WorkflowRunInput, WorkflowScheduleInput, WorkflowExecuteInput, SuggestRequest
from ..helpers import generate_workflow_description, execute_actual_react_loop
from ..agents.graph import run_agent_workflow, resolve_workflow_parameters, call_llm
from ..logging_config import logger

router = APIRouter()


# ─── Suggestions Endpoints ─────────────────────────────────────────────────────

@router.post("/api/suggest")
def get_suggestions(req: SuggestRequest):
    """Generate smart, context-aware input suggestions using Gemini LLM."""
    context_str = req.context.strip()
    logger.info(f"[API SUGGEST REQUEST] Field: '{req.field}' | Context: '{context_str}'")
    
    if context_str:
        field_lower = req.field.lower()
        is_name_field = any(k in field_lower for k in ["name", "prefix", "schema", "catalog"])
        constraints = []
        if is_name_field:
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
            raw_response = call_llm(prompt, "You are a Databricks data platform suggestion assistant. Output a JSON list of strings only.")
            text = raw_response.strip()
            logger.info(f"[API SUGGEST LLM RESPONSE] Raw Text: {text}")
            
            suggestions = []
            
            # Heuristic 1: JSON array extract
            start = text.find("[")
            end = text.rfind("]")
            if start != -1 and end != -1:
                json_candidate = text[start:end+1]
                try:
                    parsed = json.loads(json_candidate)
                    if isinstance(parsed, list):
                        suggestions = [str(s).strip() for s in parsed if s]
                except Exception:
                    # Heuristic 2: Regex extract string quotes
                    matches = re.findall(r'"([^"\\]*(?:\\.[^"\\]*)*)"|\'([^\'\\]*(?:\\.[^\'\\]*)*)\'', json_candidate)
                    suggestions = [m[0] or m[1] for m in matches if m[0] or m[1]]
                    
            # Heuristic 3: Line-by-line fallback
            if not suggestions:
                for line in text.split("\n"):
                    line = line.strip()
                    if not line:
                        continue
                    if line.startswith("-") or line.startswith("*"):
                        line = line.lstrip("-* ").strip()
                    elif line and line[0].isdigit() and (line.startswith(line[0]+".") or line.startswith(line[0]+")")):
                        line = line.split(".", 1)[-1].split(")", 1)[-1].strip()
                    line = line.strip("'\"")
                    if line and len(line) > 2:
                        suggestions.append(line)
            
            final_suggestions = [s.strip() for s in suggestions if s]
            
            # Clean up casing/spaces if name field
            if is_name_field:
                final_suggestions = [
                    "".join(w.capitalize() for w in re.split(r'[\s,_]+', s) if w.strip())
                    for s in final_suggestions
                ]

            final_suggestions = [s for s in final_suggestions if s][:3]

            # Heuristics Fallback synthesis offline
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
            logger.info(f"[API SUGGEST PARSED RESULT] Suggestions: {final_suggestions}")
            return {"suggestions": final_suggestions}
        except Exception as e:
            logger.error(f"Error generating AI suggestions via LLM: {e}")
            
            # Offline synthesis fallback under exception
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
            return {"suggestions": fallback_suggs}

    return {"suggestions": []}


# ─── Workflows Endpoint ────────────────────────────────────────────────────────

@router.get("/api/workflows")
def get_workflows(project_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Retrieve all workflows, optionally filtered by Data Project ID."""
    query = db.query(Workflow)
    if project_id is not None:
        query = query.filter(Workflow.data_project_id == project_id)
    workflows = query.all()
    
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


@router.post("/api/workflows")
def create_workflow(wf: WorkflowCreate, db: Session = Depends(get_db)):
    """Configure a new multi-agent pipeline workflow sequence."""
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


@router.put("/api/workflows/{wf_id}")
def update_workflow(wf_id: int, wf: WorkflowCreate, db: Session = Depends(get_db)):
    """Update details of a multi-agent workflow sequence."""
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


@router.delete("/api/workflows/{wf_id}")
def delete_workflow(wf_id: int, db: Session = Depends(get_db)):
    """Delete a workflow definition."""
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


# ─── Workflow Execution ────────────────────────────────────────────────────────

def _execute_actual_react_loop(
    instructions: str,
    inputs: dict,
    db: Session,
    available_tool_names=None,
    history=None,
    llm_provider="gemini",
    experiment_id=None,
    endpoint_name=None
) -> str:
    """Thin wrapper that executes the ReAct reasoning sandbox environment."""
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


@router.post("/api/workflows/{wf_id}/execute")
def execute_workflow(wf_id: int, payload: WorkflowExecuteInput, db: Session = Depends(get_db)):
    """
    Triggers execution runs for all agents defined in the workflow's sequence sequentially.
    Chains context output from each agent to the next and captures generated artifacts.
    """
    db_wf = db.query(Workflow).filter(Workflow.id == wf_id).first()
    if not db_wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if not db_wf.is_enabled:
        raise HTTPException(status_code=400, detail="Workflow is disabled")

    try:
        seq = json.loads(db_wf.agents_sequence or "[]")
    except Exception:
        seq = []
    if not seq:
        raise HTTPException(status_code=400, detail="Workflow has no agents in sequence")

    # Create run record
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

    db_wf.status = "Running"
    db_wf.last_run_at = datetime.datetime.utcnow()
    db.commit()

    llm_provider = os.getenv("LLM_PROVIDER")
    experiment_id = os.getenv("DATABRICKS_LLM_EXPERIMENT_ID")
    endpoint_name = os.getenv("DATABRICKS_LLM_ENDPOINT_NAME")

    if not llm_provider:
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

            chain_context = ""
            if previous_output:
                chain_context = f"""

--- CONTEXT FROM PREVIOUS AGENT ---
{previous_output}
--- END CONTEXT ---

Use the above context from the previous agent as input for your task.
"""

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
                        except Exception:
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

            # Save agent output artifact
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

            execution.agent_outputs = json.dumps(agent_outputs)
            db.commit()

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


@router.get("/api/workflows/{wf_id}/executions")
def list_workflow_executions(wf_id: int, limit: int = 20, db: Session = Depends(get_db)):
    """List execution logs for a workflow."""
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


@router.get("/api/executions/{execution_id}")
def get_execution_detail(execution_id: str, db: Session = Depends(get_db)):
    """Get complete details of a specific workflow execution run."""
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


@router.get("/api/executions/{execution_id}/artifacts")
def get_execution_artifacts(execution_id: str, db: Session = Depends(get_db)):
    """Get all artifacts created inside a specific execution run."""
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


@router.post("/api/workflows/{wf_id}/schedule")
def schedule_workflow(wf_id: int, payload: WorkflowScheduleInput, db: Session = Depends(get_db)):
    """Update background cron scheduler settings for a workflow."""
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


@router.post("/api/projects/{project_id}/run")
def execute_project_workflow(project_id: int, payload: WorkflowRunInput, db: Session = Depends(get_db)):
    """
    Invokes the full multi-agent LangGraph coordination state machine loop.
    Merges project settings and runs the state machine.
    """
    project = db.query(DataProject).filter(DataProject.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Data Project not found")
        
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
        
    existing_params = json.loads(workflow.parameters or "{}")
    history_logs = json.loads(workflow.history_logs or "[]")
    
    # Merge project configurations
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
            
    product = db.query(DataProduct).filter(DataProduct.id == project.data_product_id).first()
    if product and product.global_parameters:
        try:
            gps = json.loads(product.global_parameters)
            for gp in gps:
                name = gp.get("name")
                val = gp.get("default_value") or gp.get("value") or gp.get("default")
                if name and name not in existing_params and val is not None:
                    existing_params[name] = val
        except Exception as e:
            logger.error(f"Error parsing global parameters for product: {e}")

    new_params = payload.parameters
    for k, v in new_params.items():
        if v:
            existing_params[k] = v
            
    workflow.status = "Running"
    db.commit()
    
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
    
    db.add(SystemLog(
        level="INFO", 
        message=f"Supervisor trigger: routing state transitions for project '{project.name}' starting at agent '{workflow.current_agent}'", 
        project_id=project_id
    ))
    db.commit()
    
    # Run the state machine
    output_state = run_agent_workflow(initial_graph_state)
    
    # Checkpoint result state
    workflow.status = output_state["status"]
    workflow.current_agent = output_state["current_agent"]
    workflow.next_agent = output_state["next_agent"]
    workflow.parameters = json.dumps(output_state["parameters"])
    workflow.missing_parameters = json.dumps(output_state["missing_parameters"])
    
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


# ─── Artifacts Endpoint ────────────────────────────────────────────────────────

@router.get("/api/artifacts")
def get_all_artifacts(project_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Retrieve all generated artifacts, optionally filtered by Data Project ID."""
    query = db.query(Artifact)
    if project_id is not None:
        query = query.filter(Artifact.data_project_id == project_id)
    return query.all()
