"""
Pydantic schemas and request models module for the AgenticDataWorkspace backend.

This module houses standard contracts for API request/response validation
and JSON parsing.
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel


class ProductCreate(BaseModel):
    """Schema for creating or updating a Data Product."""
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
    """Schema for creating or updating a Data Project."""
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
    """Schema for registering a custom Tool in the Tool Studio."""
    name: str
    description: Optional[str] = None
    type: str = "python"
    code: Optional[str] = None
    parameters: Optional[List[Dict[str, Any]]] = None
    is_enabled: Optional[bool] = True
    created_by: Optional[str] = "admin"
    updated_by: Optional[str] = "admin"


class SkillCreate(BaseModel):
    """Schema for registering a custom Skill in the Skill Studio."""
    name: str
    description: Optional[str] = None
    instruction: str
    parameters: Optional[List[Dict[str, Any]]] = None
    output_definition: Optional[str] = None
    tools: Optional[List[str]] = None
    is_enabled: Optional[bool] = True
    created_by: Optional[str] = "admin"
    updated_by: Optional[str] = "admin"


class AgentCreate(BaseModel):
    """Schema for creating or updating an AI Agent persona."""
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
    """Schema for creating a multi-agent orchestration Workflow."""
    name: str
    description: Optional[str] = None
    data_product_id: int
    data_project_id: int
    agents_sequence: List[str]
    is_enabled: Optional[bool] = True
    schedule_cron: Optional[str] = None
    schedule_enabled: Optional[bool] = False
    created_by: Optional[str] = "admin"
    updated_by: Optional[str] = "admin"


class WorkflowRunInput(BaseModel):
    """Input payload to trigger a project run."""
    parameters: Dict[str, Any]


class SkillAssignment(BaseModel):
    """Assignment payload mapping skills and tools to an agent."""
    skills: List[str]
    tools: Optional[List[str]] = None


class ToolTestInput(BaseModel):
    """Input parameters to run and debug a tool unit test."""
    code: str
    type: str
    inputs: Dict[str, Any]


class SkillTestInput(BaseModel):
    """Input parameters to run and test a custom skill ReAct sandbox run."""
    instruction: str
    tools: List[str]
    inputs: Dict[str, Any]
    history: Optional[List[Dict[str, Any]]] = None


class AgentTestInput(BaseModel):
    """Input parameters to test an agent sandbox chat session."""
    name: str
    role: str
    instructions: str
    skills: List[str]
    inputs: Dict[str, Any]
    history: Optional[List[Dict[str, Any]]] = None


class SuggestRequest(BaseModel):
    """Request schema for getting context-aware AI input field suggestions."""
    field: str
    context: str = ""
    value: str = ""


class WorkflowScheduleInput(BaseModel):
    """Input payload to update workflow scheduler settings."""
    schedule_cron: Optional[str] = None
    schedule_enabled: bool


class WorkflowExecuteInput(BaseModel):
    """Input payload to execute a workflow session."""
    trigger_query: str
    input_parameters: Optional[Dict[str, Any]] = {}


class SettingsUpdateInput(BaseModel):
    """Input payload to bulk update system environment settings."""
    settings: Dict[str, Optional[str]]
