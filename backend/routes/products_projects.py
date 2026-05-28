"""
API router for Data Products and Data Projects.

Defines HTTP routes for CRUD operations on data products and projects,
resetting workflow states, and listing project-specific artifacts.
"""

import json
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..db.database import get_db
from ..db.models import DataProduct, DataProject, SystemLog, Artifact, Workflow
from ..schemas import ProductCreate, ProjectCreate
from ..logging_config import logger

router = APIRouter()


@router.get("/api/products")
def get_products(db: Session = Depends(get_db)):
    """Retrieve all registered Data Products."""
    return db.query(DataProduct).all()


@router.post("/api/products")
def create_product(product: ProductCreate, db: Session = Depends(get_db)):
    """Create and register a new Data Product."""
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


@router.put("/api/products/{product_id}")
def update_product(product_id: int, product: ProductCreate, db: Session = Depends(get_db)):
    """Update details of an existing Data Product."""
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


@router.delete("/api/products/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db)):
    """Delete a Data Product and its associated entities."""
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


@router.get("/api/projects")
def get_projects(product_id: Optional[int] = None, db: Session = Depends(get_db)):
    """Retrieve all registered Data Projects, optionally filtered by Data Product ID."""
    query = db.query(DataProject)
    if product_id is not None:
        query = query.filter(DataProject.data_product_id == product_id)
    return query.all()


@router.post("/api/projects")
def create_project(project: ProjectCreate, db: Session = Depends(get_db)):
    """Register and configure a new Data Project."""
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


@router.put("/api/projects/{project_id}")
def update_project(project_id: int, project: ProjectCreate, db: Session = Depends(get_db)):
    """Update details of an existing Data Project."""
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


@router.delete("/api/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    """Delete a Data Project and cascade delete associated assets."""
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


@router.post("/api/projects/{project_id}/settings")
def update_project_settings(project_id: int, settings: Dict[str, Any], db: Session = Depends(get_db)):
    """Update settings for a specific Data Project."""
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


@router.post("/api/projects/{project_id}/reset")
def reset_project_workflow(project_id: int, db: Session = Depends(get_db)):
    """Reset the workflow state and clear generated artifacts for a project."""
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
    
    db.add(SystemLog(
        level="WARN", 
        message=f"Workflow states and artifacts reset for project ID {project_id}.", 
        project_id=project_id
    ))
    db.commit()
    
    return {"message": "Project workflow state reset successfully"}


@router.get("/api/projects/{project_id}/artifacts")
def get_project_artifacts(project_id: int, db: Session = Depends(get_db)):
    """Retrieve all artifacts generated under a specific project."""
    return db.query(Artifact).filter(Artifact.data_project_id == project_id).all()
