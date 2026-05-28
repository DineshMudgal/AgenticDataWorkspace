"""
Scheduler module for background workflow execution in the AgenticDataWorkspace backend.

Periodically scans the active workflows for scheduled intervals (crons)
and executes them in a daemonized background worker thread.
"""

import time
import datetime
import json
import threading
from .db.database import SessionLocal
from .db.models import Workflow, DataProject, DataProduct, Artifact, SystemLog
from .agents.graph import run_agent_workflow
from .logging_config import logger


def run_background_workflow_scheduler() -> None:
    """
    Initializes and starts the background workflow scheduler loop in a daemon thread.
    """
    def scheduler_loop():
        time.sleep(5)  # Wait for startup configuration stabilization
        logger.info("[SCHEDULER] Background workflow scheduler thread started.")
        while True:
            try:
                db = SessionLocal()
                # Query active and enabled workflows with active schedules
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
                    
                    # Rough translation of simple human crons to run intervals
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
                        interval_sec = 300  # Default fallback
                    
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
                            
                            # Merge project-level parameters
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
                                except Exception as e:
                                    logger.error(f"[SCHEDULER] Error parsing project parameters: {e}")
                                    
                            # Merge global product parameters
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
                                    logger.error(f"[SCHEDULER] Error parsing product global parameters: {e}")
                                    
                            # Load generated artifacts list
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
                            
                            # Invoke LangGraph agent pipeline
                            output_state = run_agent_workflow(initial_graph_state)
                            
                            # Save state checkpoints
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
                                
                            # Save new generated artifacts
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
