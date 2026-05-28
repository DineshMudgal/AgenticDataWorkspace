import datetime
import json
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Table, Boolean
from sqlalchemy.orm import relationship
from .database import Base

class DataProduct(Base):
    __tablename__ = "data_products"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    uc_owner = Column(String(255), nullable=True)
    tags = Column(String(255), nullable=True)
    type = Column(String(100), default="Ingestion", nullable=False)
    global_parameters = Column(Text, nullable=True)
    global_instruction = Column(Text, nullable=True)
    is_enabled = Column(Boolean, default=True, nullable=False)
    owner_group = Column(String(255), nullable=True)
    
    created_by = Column(String(255), default="admin", nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_by = Column(String(255), default="admin", nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    projects = relationship("DataProject", back_populates="product", cascade="all, delete-orphan")


class DataProject(Base):
    __tablename__ = "data_projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    data_product_id = Column(Integer, ForeignKey("data_products.id", ondelete="CASCADE"), nullable=False)
    is_enabled = Column(Boolean, default=True, nullable=False)
    parameters = Column(Text, default="{}", nullable=True)
    
    databricks_url = Column(String(255), nullable=True)
    catalog_name = Column(String(255), nullable=True)
    schema_name = Column(String(255), nullable=True)
    table_prefix = Column(String(100), nullable=True)
    instructions = Column(Text, nullable=True)

    created_by = Column(String(255), default="admin", nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_by = Column(String(255), default="admin", nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    product = relationship("DataProduct", back_populates="projects")
    workflows = relationship("Workflow", back_populates="project", cascade="all, delete-orphan")
    artifacts = relationship("Artifact", back_populates="project", cascade="all, delete-orphan")


class Tool(Base):
    __tablename__ = "tools"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    type = Column(String(100), default="python", nullable=False)
    code = Column(Text, nullable=True)
    parameters = Column(Text, nullable=True)
    is_enabled = Column(Boolean, default=True, nullable=False)

    created_by = Column(String(255), default="admin", nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_by = Column(String(255), default="admin", nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class Skill(Base):
    __tablename__ = "skills"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    instruction = Column(Text, nullable=False)
    parameters = Column(Text, nullable=True)
    output_definition = Column(Text, nullable=True)
    tools = Column(Text, nullable=True)
    is_enabled = Column(Boolean, default=True, nullable=False)
    
    created_by = Column(String(255), default="admin", nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_by = Column(String(255), default="admin", nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class Agent(Base):
    __tablename__ = "agents"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    role = Column(String(255), nullable=False)
    skills = Column(Text, nullable=True)
    tools = Column(Text, nullable=True)
    instructions = Column(Text, nullable=True)
    introduction = Column(Text, nullable=True)
    is_enabled = Column(Boolean, default=True, nullable=False)
    
    created_by = Column(String(255), default="admin", nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_by = Column(String(255), default="admin", nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class Workflow(Base):
    __tablename__ = "workflows"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    data_product_id = Column(Integer, nullable=False)
    data_project_id = Column(Integer, ForeignKey("data_projects.id", ondelete="CASCADE"), nullable=False)
    agents_sequence = Column(Text, nullable=True)
    status = Column(String(50), default="Idle")
    is_enabled = Column(Boolean, default=True, nullable=False)
    
    # State / parameter fields
    parameters = Column(Text, default="{}")           # Gathered runtime parameters (JSON dict)
    missing_parameters = Column(Text, default="[]")   # Required-but-missing params (JSON list)
    user_parameters = Column(Text, default="[]")      # Workflow-level input schema (ParameterBuilder format)
    current_agent = Column(String(255), nullable=True)
    next_agent = Column(String(255), nullable=True)
    history_logs = Column(Text, default="[]")

    # Scheduling
    schedule_cron = Column(String(100), nullable=True)
    schedule_enabled = Column(Boolean, default=False, nullable=False)
    last_run_at = Column(DateTime, nullable=True)

    created_by = Column(String(255), default="admin", nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_by = Column(String(255), default="admin", nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    project = relationship("DataProject", back_populates="workflows")
    executions = relationship("WorkflowExecution", back_populates="workflow", cascade="all, delete-orphan")


class WorkflowExecution(Base):
    """Tracks every individual run of a workflow with a unique UUID execution_id."""
    __tablename__ = "workflow_executions"

    id = Column(Integer, primary_key=True, index=True)
    execution_id = Column(String(36), nullable=False, unique=True, index=True)  # UUID v4
    workflow_id = Column(Integer, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(50), default="Running")   # Running, Completed, Failed
    trigger_query = Column(Text, nullable=True)       # User's initial prompt
    input_parameters = Column(Text, default="{}")     # Collected params for this run (JSON dict)
    agent_outputs = Column(Text, default="{}")        # {agent_name: output_text} — chained context
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    created_by = Column(String(255), default="system", nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    workflow = relationship("Workflow", back_populates="executions")
    artifacts = relationship("Artifact", back_populates="execution", cascade="all, delete-orphan")


class Artifact(Base):
    __tablename__ = "artifacts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    type = Column(String(100), nullable=False)
    content = Column(Text, nullable=False)
    data_project_id = Column(Integer, ForeignKey("data_projects.id", ondelete="CASCADE"), nullable=False)
    execution_id = Column(String(36), ForeignKey("workflow_executions.execution_id", ondelete="SET NULL"), nullable=True, index=True)
    agent_name = Column(String(255), nullable=True)   # Which agent produced this
    status = Column(String(50), default="Draft")
    metadata_json = Column(Text, nullable=True)
    
    created_by = Column(String(255), default="admin", nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_by = Column(String(255), default="admin", nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    project = relationship("DataProject", back_populates="artifacts")
    execution = relationship("WorkflowExecution", back_populates="artifacts")


class SystemLog(Base):
    __tablename__ = "system_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    level = Column(String(50), default="INFO")
    message = Column(Text, nullable=False)
    details = Column(Text, nullable=True)
    agent_name = Column(String(100), nullable=True)
    project_id = Column(Integer, nullable=True)
    
    created_by = Column(String(255), default="admin", nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_by = Column(String(255), default="admin", nullable=True)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class ServerLog(Base):
    __tablename__ = "server_logs"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    level = Column(String(50), nullable=False)
    logger_name = Column(String(255), nullable=True)
    message = Column(Text, nullable=False)
    module = Column(String(255), nullable=True)
    func_name = Column(String(255), nullable=True)
    line_no = Column(Integer, nullable=True)
    
    created_by = Column(String(255), default="system", nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key = Column(String(255), primary_key=True, index=True)
    value = Column(Text, nullable=True)
    is_secret = Column(Boolean, default=False)

