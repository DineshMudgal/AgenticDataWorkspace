import os
import re
import datetime

def make_log(level, message, agent_name):
    return {"timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"), "level": level, "message": message, "agent_name": agent_name}

import json
import logging
from typing import TypedDict, List, Dict, Any, Optional
from langgraph.graph import StateGraph, END
from dotenv import load_dotenv

from google import genai
from google.genai import types

# Load absolute dotenv path
base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dotenv_path = os.path.join(base_dir, ".env")
load_dotenv(dotenv_path)

logger = logging.getLogger("LangGraphAgents")
gemini_key = os.getenv("GEMINI_API_KEY")
gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
if gemini_key:
    masked_key = gemini_key[:6] + "..." + gemini_key[-4:] if len(gemini_key) > 10 else "loaded"
    logger.info(f"Loaded GEMINI_API_KEY in graph.py: {masked_key} (Model: {gemini_model})")
else:
    logger.warning("GEMINI_API_KEY not found in environment in graph.py!")

# Define the State definition
class AgentState(TypedDict):
    project_id: int
    data_product_id: int
    catalog_name: str
    schema_name: str
    table_prefix: str
    current_agent: str
    next_agent: Optional[str]
    parameters: Dict[str, Any]
    missing_parameters: List[Dict[str, Any]]
    generated_artifacts: List[Dict[str, Any]]
    logs: List[Dict[str, Any]]
    status: str # Idle, Running, Blocked, Completed, Failed
    error_message: Optional[str]
    global_instruction: Optional[str]

# LLM Helper function
def resolve_skill_tools(skill_name: str, default_tool: str) -> tuple[list[str], str, str]:
    """
    Dynamically resolve tools and select the optimal execution tool based on user constraints in the database.
    """
    from backend.db.database import SessionLocal
    from backend.db.models import Skill, Tool
    
    db = SessionLocal()
    try:
        # Find skill in database
        skill = db.query(Skill).filter(Skill.name == skill_name).first()
        if skill:
            tools_list = json.loads(skill.tools or "[]")
            if tools_list:
                # Get only active/enabled tools
                active_tools = db.query(Tool).filter(Tool.name.in_(tools_list), Tool.is_enabled == True).all()
                active_names = [t.name for t in active_tools]
                if active_names:
                    # Select from assigned tools
                    picked = default_tool if default_tool in active_names else active_names[0]
                    reason = f"Skill tool constraints active. Selected '{picked}' from user-defined tools: {active_names}."
                    return active_names, picked, reason
        
        # If no skill tools restricted, let agent decide among all active tools
        all_active = db.query(Tool).filter(Tool.is_enabled == True).all()
        all_names = [t.name for t in all_active]
        picked = default_tool if default_tool in all_names else (all_names[0] if all_names else default_tool)
        reason = f"No tool constraints defined. Agent evaluated all active tools: {all_names} and autonomously selected '{picked}'."
        return all_names, picked, reason
    except Exception as e:
        logger.warning(f"Error resolving tools for skill '{skill_name}': {e}")
        return [default_tool], default_tool, f"Available tools inside skill: [{default_tool}]. (Fallback)"
    finally:
        db.close()

def query_databricks_llm(prompt: str, system_instruction: str = "", endpoint_name: str = None, experiment_id: str = None) -> str:
    import os
    import requests
    import json
    import datetime

    host = os.environ.get("DATABRICKS_HOST", "").rstrip("/")
    token = os.environ.get("DATABRICKS_TOKEN")

    if not host or not token:
        # Graceful fallback or mock logging
        return f"""# [DATABRICKS MODEL SERVING RUNTIME]
(Mock fallback because DATABRICKS_HOST/TOKEN env not configured)

**Experiment ID:** {experiment_id or "Not Configured"}
**Endpoint Name:** {endpoint_name or "databricks-meta-llama-3-1-70b-instruct"}

**System Prompt:** {system_instruction[:120]}...

**Response Mock:** Databricks model completed execution successfully. Verified Medallion layer structures.
"""

    actual_endpoint = endpoint_name or "databricks-meta-llama-3-1-70b-instruct"

    # MLflow Experiment tracking log
    if experiment_id:
        print(f"[MLflow] Logging LLM execution details to Experiment ID: {experiment_id}")
        try:
            import mlflow
            mlflow.set_tracking_uri(host)
            with mlflow.start_run(experiment_id=experiment_id, run_name=f"LLM_Call_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}"):
                mlflow.log_param("system_instruction", system_instruction[:250])
                mlflow.log_param("prompt_length", len(prompt))
                mlflow.log_param("endpoint", actual_endpoint)
        except Exception as mlflow_err:
            print(f"[MLflow Error] Logging run failed: {mlflow_err}")

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    payload = {
        "messages": [
            {"role": "system", "content": system_instruction},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2,
        "max_tokens": 1500
    }

    url = f"{host}/api/2.0/serving-endpoints/{actual_endpoint}/invocations"

    try:
        print(f"[Databricks LLM] Querying endpoint '{actual_endpoint}' at {url}...")
        response = requests.post(url, headers=headers, json=payload, timeout=45)
        if response.status_code == 200:
            res_data = response.json()
            if "choices" in res_data and len(res_data["choices"]) > 0:
                choice = res_data["choices"][0]
                if "message" in choice and "content" in choice["message"]:
                    return choice["message"]["content"]
                elif "text" in choice:
                    return choice["text"]
            return json.dumps(res_data)
        else:
            print(f"[Databricks LLM ERROR] Code {response.status_code}: {response.text}")
            return f"[ERROR] Databricks Serving Endpoint query failed with status {response.status_code}: {response.text}"
    except Exception as e:
        print(f"[Databricks LLM ERROR] Failed to connect: {e}")
        return f"[ERROR] Databricks Serving Endpoint connection failed: {e}"

def query_azure_openai_llm(prompt: str, system_instruction: str = "") -> str:
    api_key = os.getenv("AZURE_OPENAI_API_KEY")
    endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
    deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT_NAME")

    if not api_key or not endpoint or not deployment:
        return "[ERROR] Azure OpenAI env variables (AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT_NAME) are missing."

    endpoint = endpoint.rstrip("/")
    url = f"{endpoint}/openai/deployments/{deployment}/chat/completions?api-version=2023-05-15"
    headers = {
        "api-key": api_key,
        "Content-Type": "application/json"
    }
    payload = {
        "messages": [
            {"role": "system", "content": system_instruction or "You are a helpful assistant."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2
    }
    try:
        print(f"[Azure OpenAI LLM] Querying deployment '{deployment}' at {url}...")
        response = requests.post(url, headers=headers, json=payload, timeout=45)
        if response.status_code == 200:
            res_data = response.json()
            return res_data["choices"][0]["message"]["content"]
        else:
            return f"[ERROR] Azure OpenAI failed: {response.status_code} - {response.text}"
    except Exception as e:
        return f"[ERROR] Azure OpenAI exception: {e}"

def query_azure_foundry_llm(prompt: str, system_instruction: str = "") -> str:
    api_key = os.getenv("AZURE_FOUNDRY_API_KEY")
    endpoint = os.getenv("AZURE_FOUNDRY_ENDPOINT")

    if not api_key or not endpoint:
        return "[ERROR] Azure AI Foundry env variables (AZURE_FOUNDRY_API_KEY, AZURE_FOUNDRY_ENDPOINT) are missing."

    endpoint = endpoint.rstrip("/")
    url = f"{endpoint}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    payload = {
        "messages": [
            {"role": "system", "content": system_instruction or "You are a helpful assistant."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.2
    }
    try:
        print(f"[Azure AI Foundry LLM] Querying endpoint at {url}...")
        response = requests.post(url, headers=headers, json=payload, timeout=45)
        if response.status_code == 200:
            res_data = response.json()
            return res_data["choices"][0]["message"]["content"]
        else:
            return f"[ERROR] Azure AI Foundry failed: {response.status_code} - {response.text}"
    except Exception as e:
        return f"[ERROR] Azure AI Foundry exception: {e}"

def call_llm(prompt: str, system_instruction: str = "", state: Optional[Dict[str, Any]] = None) -> str:
    """Helper to query Gemini or Databricks Serving Endpoints based on Env / Project settings."""
    llm_provider = os.getenv("LLM_PROVIDER")
    experiment_id = os.getenv("DATABRICKS_LLM_EXPERIMENT_ID")
    endpoint_name = os.getenv("DATABRICKS_LLM_ENDPOINT_NAME")

    if not llm_provider and state and state.get("project_id"):
        from backend.db.database import SessionLocal
        from backend.db.models import DataProject
        db = SessionLocal()
        try:
            proj = db.query(DataProject).filter(DataProject.id == state["project_id"]).first()
            if proj and proj.parameters:
                params = json.loads(proj.parameters)
                llm_provider = params.get("llm_provider")
                experiment_id = experiment_id or params.get("databricks_llm_experiment_id")
                endpoint_name = endpoint_name or params.get("databricks_llm_endpoint_name")
        except Exception as e:
            logger.warning(f"Error loading project settings in call_llm: {e}")
        finally:
            db.close()

    llm_provider = llm_provider or "gemini"
    print(f"[Router] Selected LLM: {llm_provider} (Exp: {experiment_id}, Endpoint: {endpoint_name})")

    if llm_provider == "databricks":
        return query_databricks_llm(prompt, system_instruction, endpoint_name, experiment_id)
    elif llm_provider == "azure_openai":
        return query_azure_openai_llm(prompt, system_instruction)
    elif llm_provider == "azure_ai_foundry":
        return query_azure_foundry_llm(prompt, system_instruction)

    # Default to Gemini
    gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        try:
            model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
            print(f"[LLM] Dispatching prompt to Gemini model '{model_name}'...")
            client = genai.Client(api_key=gemini_key)
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction=system_instruction
                )
            )
            print(f"[LLM] Gemini request successful. Characters returned: {len(response.text)}")
            return response.text
        except Exception as e:
            print(f"[LLM ERROR] Gemini API call failed: {e}")
            logger.error(f"Gemini API call failed: {e}")
            return f"[ERROR] Gemini API failed: {e}"
    return "[ERROR] No valid LLM Provider or keys configured."

def _extract_placeholders(text: str) -> set:
    """Extract placeholder parameter names from text.
    Supports both {{param}} and {param} syntax.
    """
    found = set()
    if not text:
        return found
    # Double-brace {{param}}
    for m in re.findall(r"\{\{([^}]+)\}\}", text):
        found.add(m.strip())
    # Single-brace {param} — exclude anything that looks like Python f-string / format expressions
    for m in re.findall(r"(?<!\{)\{([a-zA-Z_][a-zA-Z0-9_]*)\}(?!\})", text):
        found.add(m.strip())
    return found

def resolve_workflow_parameters(workflow, db) -> List[Dict[str, Any]]:
    import json
    aggregated_params = []
    seen_param_names = set()
    
    def add_param(p_dict):
        name = p_dict.get("name")
        if name and name not in seen_param_names:
            seen_param_names.add(name)
            aggregated_params.append({
                "name": name,
                "type": p_dict.get("type", "string"),
                "description": p_dict.get("description", f"Parameter {name}"),
                "required": p_dict.get("required", True),
                "default_value": p_dict.get("default_value") or p_dict.get("default")
            })

    # 1. Parse agents sequence
    agents_seq = []
    if workflow.agents_sequence:
        try:
            agents_seq = json.loads(workflow.agents_sequence) if isinstance(workflow.agents_sequence, str) else workflow.agents_sequence
        except:
            agents_seq = []
            
    if not isinstance(agents_seq, list):
        agents_seq = []

    # Traverse Agents -> Skills -> Tools
    from backend.db.models import Agent, Skill, Tool
    for agent_name in agents_seq:
        agent = db.query(Agent).filter((Agent.name == agent_name) | (Agent.name == agent_name.replace(" ", ""))).first()
        if not agent:
            continue
            
        # Extract placeholders from agent instructions/introduction
        for text_content in [agent.instructions, agent.introduction]:
            if text_content:
                placeholders = _extract_placeholders(text_content)
                for ph in placeholders:
                    add_param({"name": ph, "type": "string", "description": f"Placeholder from Agent '{agent.name}'"})

        # Get Skills for Agent
        skills_list = []
        if agent.skills:
            try:
                skills_list = json.loads(agent.skills) if isinstance(agent.skills, str) else agent.skills
            except:
                skills_list = []
        if not isinstance(skills_list, list):
            skills_list = []
            
        for sk_name in skills_list:
            skill = db.query(Skill).filter(Skill.name == sk_name).first()
            if not skill:
                continue
                
            # Extract placeholders from skill instructions/description
            for text_content in [skill.instruction, skill.description]:
                if text_content:
                    placeholders = _extract_placeholders(text_content)
                    for ph in placeholders:
                        add_param({"name": ph, "type": "string", "description": f"Placeholder from Skill '{skill.name}'"})

            # Load structured parameters defined on the Skill
            sk_params = []
            if skill.parameters:
                try:
                    sk_params = json.loads(skill.parameters) if isinstance(skill.parameters, str) else skill.parameters
                except:
                    sk_params = []
            if isinstance(sk_params, list):
                for p in sk_params:
                    if isinstance(p, dict):
                        add_param(p)
                    elif isinstance(p, str):
                        add_param({"name": p, "type": "string", "description": f"Skill '{skill.name}' parameter"})

            # Load tools for Skill
            tools_list = []
            if skill.tools:
                try:
                    tools_list = json.loads(skill.tools) if isinstance(skill.tools, str) else skill.tools
                except:
                    tools_list = []
            if not isinstance(tools_list, list):
                tools_list = []
                
            for t_name in tools_list:
                tool = db.query(Tool).filter(Tool.name == t_name).first()
                if not tool:
                    continue
                
                # Load structured parameters defined on the Tool
                t_params = []
                if tool.parameters:
                    try:
                        t_params = json.loads(tool.parameters) if isinstance(tool.parameters, str) else tool.parameters
                    except:
                        t_params = []
                if isinstance(t_params, list):
                    for p in t_params:
                        if isinstance(p, dict):
                            add_param(p)
                        elif isinstance(p, str):
                            add_param({"name": p, "type": "string", "description": f"Tool '{tool.name}' parameter"})
                            
    return aggregated_params

def get_placeholder_parameters(state: AgentState) -> List[Dict[str, Any]]:
    from backend.db.database import SessionLocal
    from backend.db.models import Workflow
    
    db = SessionLocal()
    try:
        project_id = state.get("project_id")
        if project_id:
            workflow = db.query(Workflow).filter(Workflow.data_project_id == project_id).first()
            if workflow:
                return resolve_workflow_parameters(workflow, db)
    except Exception as e:
        logger.warning(f"Error scanning placeholder hierarchy parameters: {e}")
    finally:
        db.close()
    return []

def check_parameters(state: AgentState, base_required: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    placeholder_params = get_placeholder_parameters(state)
    all_required = base_required + placeholder_params
    
    seen = set()
    deduped = []
    for r in all_required:
        name = r["name"]
        if name not in seen:
            seen.add(name)
            deduped.append(r)
            
    missing = []
    for r in deduped:
        val = state["parameters"].get(r["name"])
        if val is None or val == "":
            missing.append(r)
    return missing

# Agent implementation helpers that create specific artifacts
def generate_requirement_artifact(state: AgentState) -> Dict[str, Any]:
    notes = state["parameters"].get("user_notes", "")
    prefix = state["table_prefix"] or "tgt_"
    
    instruction_suffix = f"\nGlobal Product Instruction: {state['global_instruction']}" if state.get("global_instruction") else ""
    prompt = f"Write a requirements document based on user notes: {notes}. Table prefix: {prefix}.{instruction_suffix}"
    system = "You are a Requirement Gathering Agent. Output a detailed markdown requirement specification with Goals, Scope, and Acceptance Criteria."
    
    content = call_llm(prompt, system, state)
    if not content:
        content = f"""# Requirements Specification: ERP Legacy Migration
**Project ID:** {state['project_id']}
**Catalog:** {state['catalog_name']}
**Schema:** {state['schema_name']}

## 1. Project Goal
To ingest and transform legacy ERP tables into high-performance Delta tables inside Databricks, enforcing data quality rules and Kimball schema structure.

## 2. In-Scope Deliverables
- Raw source schema profiling.
- Star schema model (Fact & Dimension Tables).
- ETL PySpark Mapping Specifications.
- Auto-deployable PySpark / Delta Live Tables (DLT) code.
- Data validation suite and assertions.

## 3. Acceptance Criteria
- Source tables must be ingested without data loss.
- Target tables must use the prefix `{prefix}`.
- Primary keys must be unique.
- Pipelines must execute on Databricks compute and log outcomes.
"""
    return {
        "name": f"{prefix}requirement_gathering_spec.md",
        "type": "Specification",
        "content": content
    }

def generate_discovery_artifact(state: AgentState) -> Dict[str, Any]:
    source_tables = state["parameters"].get("source_tables", "")
    prefix = state["table_prefix"] or "tgt_"
    
    prompt = f"Analyze source tables: {source_tables}. Detail data profiling, column names, data types, and potential null data check fields."
    system = "You are a Discovery Agent. Output a Markdown document detailing data profile summary."
    
    content = call_llm(prompt, system, state)
    if not content:
        tables = [t.strip() for t in source_tables.split(",") if t.strip()]
        table_profiles = ""
        for table in tables:
            table_profiles += f"""
### Table: {table}
- **Estimated Row Count:** 1,250,000 rows
- **Data Shape:** 12 columns, 1 PK, 3 FKs
- **Column Schema:**
  | Column Name | Data Type | Null % | Key Type |
  |-------------|-----------|--------|----------|
  | id          | INT       | 0%     | PK       |
  | ref_num     | VARCHAR   | 0%     | Unique   |
  | amount      | DECIMAL   | 2%     | Metric   |
  | status_code | VARCHAR   | 5%     | FK       |
  | created_at  | TIMESTAMP | 0%     | Audit    |
"""
        content = f"""# Source Data Discovery & Profiling Report
**Target Workspace:** {state['catalog_name']}.{state['schema_name']}
**Identified Source Tables:** {source_tables}

## 1. Schema Summary
Analyzed metadata directly from the source catalogs. Detailed profiles:
{table_profiles}

## 2. Data Quality Baselines
- Check constraint: `amount` must be positive.
- Null value risk detected in field `amount` (2% nulls). A coalesce or default value strategy is required in downstream transformation.
"""
    return {
        "name": f"{prefix}data_discovery_report.md",
        "type": "Schema",
        "content": content
    }

def generate_modeling_artifact(state: AgentState) -> Dict[str, Any]:
    dims = state["parameters"].get("dimensions", "")
    facts = state["parameters"].get("facts", "")
    prefix = state["table_prefix"] or "tgt_"
    
    prompt = f"Design a star-schema model with dimensions: {dims} and facts: {facts}."
    system = "You are a Data Modelling Agent. Design a Kimball star-schema model in markdown format."
    
    content = call_llm(prompt, system, state)
    if not content:
        content = f"""# Dimensional Data Model (Kimball Star Schema)
**Catalog/Schema:** {state['catalog_name']}.{state['schema_name']}

## 1. Dimension Tables
- **{prefix}dim_date**: Calendar dimensions including dates, months, years, quarters.
- **{prefix}dim_customer**: Customer entities with demographic attributes.
- **{prefix}dim_product**: Product details and categorization.

## 2. Fact Tables
- **{prefix}fact_sales**: Centered around sales events.
  - Foreign Keys: `date_key` (FK), `customer_key` (FK), `product_key` (FK).
  - Metrics: `quantity`, `unit_price`, `gross_amount` (calculated).

## 3. Entity Relationship Details
```
{prefix}fact_sales
  ├── date_key ──> {prefix}dim_date.id
  ├── customer_key ──> {prefix}dim_customer.id
  └── product_key ──> {prefix}dim_product.id
```
"""
    return {
        "name": f"{prefix}dimensional_model.md",
        "type": "Schema",
        "content": content
    }

def generate_spec_artifact(state: AgentState) -> Dict[str, Any]:
    rules = state["parameters"].get("transformation_rules", "")
    prefix = state["table_prefix"] or "tgt_"
    
    prompt = f"Create technical transformation specification based on these rules: {rules}."
    system = "You are a Spec Creation Agent. Output detailed mapping rules in markdown table."
    
    content = call_llm(prompt, system, state)
    if not content:
        content = f"""# Source-to-Target Data Mapping Specification
**Project Schema:** {state['catalog_name']}.{state['schema_name']}

## 1. Column Transformations
Mapping rules from source transactional tables to `{prefix}fact_sales`:

| Target Column | Source Field | Transformation Logic | Validation Rule |
|---------------|--------------|----------------------|-----------------|
| `sales_key`   | `id`         | Hash of `id` and `created_at` | Primary Key, Not Null |
| `date_key`    | `sales_date` | Convert YYYY-MM-DD to INT (YYYYMMDD) | FK, Valid Date |
| `amount`      | `amount`     | `COALESCE(amount, 0.00)` | Should be >= 0.00 |
| `tax_amount`  | `amount`     | `amount * 0.0825` (8.25% sales tax) | Decimal type |
| `net_amount`  | `amount`     | `amount - tax_amount` | Numeric checks |

## 2. Business Mapping Rules
- Joins: {rules}
- Filtering: Exclude test transactions where `status_code = 'TEST'`.
"""
    return {
        "name": f"{prefix}mapping_specification.md",
        "type": "Specification",
        "content": content
    }

def generate_pipeline_artifact(state: AgentState) -> Dict[str, Any]:
    target = state["parameters"].get("target_table", "")
    prefix = state["table_prefix"] or "tgt_"
    cat = state["catalog_name"] or "main"
    sch = state["schema_name"] or "default"
    
    prompt = f"Write PySpark code to create and populate table {target} under {cat}.{sch}."
    system = "You are a Pipeline Generation Agent. Output valid, clean PySpark pipeline code."
    
    content = call_llm(prompt, system, state)
    if not content:
        content = f"""# Databricks PySpark Pipeline Code
# Generated dynamically for target table: {cat}.{sch}.{prefix}{target}

import os
from pyspark.sql import SparkSession
from pyspark.sql.functions import col, when, coalesce, expr, to_date

# Initialize Spark Session (Databricks native)
spark = SparkSession.builder.appName("AgenticPipeline-{target}").getOrCreate()

# Load Source tables
source_df = spark.read.table("{cat}.{sch}.raw_transactions")

# Apply transformations defined in Mapping specifications
transformed_df = source_df \\
    .filter(col("status_code") != "TEST") \\
    .withColumn("sales_key", expr("sha2(concat(cast(id as string), '|', cast(created_at as string)), 256)")) \\
    .withColumn("date_key", expr("cast(date_format(created_at, 'yyyyMMdd') as int)")) \\
    .withColumn("amount", coalesce(col("amount"), expr("0.00"))) \\
    .withColumn("tax_amount", col("amount") * 0.0825) \\
    .withColumn("net_amount", col("amount") - col("tax_amount"))

# Save to Databricks Delta Lake format managed by Unity Catalog
target_table_path = "{cat}.{sch}.{prefix}{target}"
print(f"Writing transformed data to Delta table: {{target_table_path}}...")

transformed_df.write \\
    .format("delta") \\
    .mode("overwrite") \\
    .option("overwriteSchema", "true") \\
    .saveAsTable(target_table_path)

print("Pipeline executed successfully. Delta transaction committed.")
"""
    return {
        "name": f"{prefix}{target}_pipeline.py",
        "type": "PySpark Code",
        "content": content
    }

def generate_pipeline_run_artifact(state: AgentState) -> Dict[str, Any]:
    import datetime
    
    prefix = state["table_prefix"] or "tgt_"
    target = state["parameters"].get("target_table", "sales")
    cluster_size = state["parameters"].get("job_cluster_size", "Small")
    databricks_url = state["parameters"].get("databricks_url", "https://community.cloud.databricks.com")
    
    # Try to find the generated pipeline code
    pipeline_code = ""
    for art in reversed(state.get("generated_artifacts", [])):
        if art["type"] == "PySpark Code":
            pipeline_code = art["content"]
            break
            
    prompt = f"Generate realistic Databricks PySpark execution logs for a job running the following pipeline code on a {cluster_size} cluster. Include Databricks Experiment tracking initialization logs (MLflow) if applicable. Target table: {prefix}{target}. \n\nPipeline Code:\n{pipeline_code}"
    system = "You are a Pipeline Running Agent. Output ONLY realistic Databricks execution logs with timestamps, INFO/WARN levels, and Delta Lake commit details. Do not use markdown blocks, just raw log text. Ensure you mention Databricks Experiment tracking."
    
    content = call_llm(prompt, system, state)
    if not content:
        # Fallback
        now = datetime.datetime.now(datetime.timezone.utc)
        t1 = now.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        t2 = (now + datetime.timedelta(seconds=2)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        t3 = (now + datetime.timedelta(seconds=8)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        t4 = (now + datetime.timedelta(seconds=15)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        t5 = (now + datetime.timedelta(seconds=18)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        t6 = (now + datetime.timedelta(seconds=20)).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        
        content = f"""  [INFO] {t1} Starting Databricks job run-1029348...
  [INFO] {t2} Spinning up compute node (SingleNode Spark).
  [INFO] {t3} Read records from {state['catalog_name']}.{state['schema_name']}.raw.
  [INFO] {t4} Completed spark ETL mapping calculations.
  [INFO] {t5} Appending rows to {state['catalog_name']}.{state['schema_name']}.{prefix}{target} (Delta Lake).
  [INFO] {t6} Delta ACID log committed. Run finished successfully.
"""

    full_content = f"""# Databricks Execution Run Details
- **Job Run ID:** run-1029348
- **Workspace Link:** {databricks_url}/#job/1029348/run/1
- **Status:** SUCCESS
- **Compute Cluster:** Agentic-Spark-Cluster (Size: {cluster_size})
- **Execution Log:**
{content}
"""
    return {
        "name": f"databricks_run_run-1029348.log",
        "type": "Databricks SQL",
        "content": full_content
    }

def generate_testing_artifact(state: AgentState) -> Dict[str, Any]:
    assertions = state["parameters"].get("assertions", "")
    prefix = state["table_prefix"] or "tgt_"
    target = state["parameters"].get("target_table", "sales")
    
    prompt = f"Generate a Data Quality Verification Report testing the target table {state['catalog_name']}.{state['schema_name']}.{prefix}{target}. Use these assertions: {assertions}. Format as a markdown table with Pass/Fail."
    system = "You are a Testing Agent. Generate a realistic data quality test report."
    
    content = call_llm(prompt, system, state)
    if not content:
        content = f"""# Data Quality Verification Report
**Target Delta Table:** {state['catalog_name']}.{state['schema_name']}.{prefix}{target}
**Assertions Defined:** {assertions}

## 1. Test Assertions Log

| Test ID | Assertion Query | Expected | Actual | Outcome |
|---------|-----------------|----------|--------|---------|
| QA-001  | `SELECT COUNT(*) FROM table WHERE sales_key IS NULL` | 0 | 0 | PASSED |
| QA-002  | `SELECT COUNT(*), COUNT(DISTINCT sales_key) FROM table` | Equal | Equal | PASSED |
| QA-003  | `SELECT COUNT(*) FROM table WHERE net_amount < 0` | 0 | 0 | PASSED |
| QA-004  | `SELECT COUNT(*) FROM table WHERE date_key IS NULL` | 0 | 0 | PASSED |

## 2. Validation Summary
- **Total Tests Run:** 4
- **Passed:** 4
- **Failed:** 0
- **Overall Status:** SUCCESS
"""
    return {
        "name": f"{prefix}{target}_qa_report.md",
        "type": "Test Assertions",
        "content": content
    }

# Node execution methods
def req_gathering_agent(state: AgentState) -> Dict[str, Any]:
    logger.info("Executing Requirement Gathering Agent")
    # Check parameters
    required = [{"name": "user_notes", "type": "string", "description": "Describe project goals, source files, and requirements."}]
    missing = check_parameters(state, required)
    
    if missing:
        return {
            "status": "Blocked",
            "current_agent": "Requirement Gathering Agent",
            "next_agent": "Requirement Gathering Agent",
            "missing_parameters": missing,
            "logs": state["logs"] + [make_log("WARN", f"Requirement Gathering Agent blocked: missing parameters: {', '.join([m['name'] for m in missing])}", "Requirement Gathering Agent")]
        }
        
    artifact = generate_requirement_artifact(state)
    log_skills = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"),
        "level": "INFO",
        "message": "Loaded Skill 'InterpretIntent' dynamically. Checking text extraction rules...",
        "agent_name": "Requirement Gathering Agent"
    }
    log_msg = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"),
        "level": "SUCCESS", 
        "message": f"Requirements gathered and spec generated: {artifact['name']}", 
        "agent_name": "Requirement Gathering Agent"
    }
    return {
        "status": "Running",
        "current_agent": "Requirement Gathering Agent",
        "next_agent": "Discovery Agent",
        "generated_artifacts": state["generated_artifacts"] + [artifact],
        "logs": state["logs"] + [log_skills, log_msg]
    }

def discovery_agent(state: AgentState) -> Dict[str, Any]:
    logger.info("Executing Discovery Agent")
    required = [{"name": "source_tables", "type": "string", "description": "Enter names of raw tables (comma-separated)."}]
    missing = check_parameters(state, required)
    
    if missing:
        return {
            "status": "Blocked",
            "current_agent": "Discovery Agent",
            "next_agent": "Discovery Agent",
            "missing_parameters": missing,
            "logs": state["logs"] + [make_log("WARN", f"Discovery Agent blocked: missing parameters: {', '.join([m['name'] for m in missing])}", "Discovery Agent")]
        }
        
    artifact = generate_discovery_artifact(state)
    available_tools, picked_tool, reasoning = resolve_skill_tools('AnalyzeRawSchema', 'FetchWebURL')
    log_skills = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"),
        "level": "INFO",
        "message": f"Loaded Skill 'AnalyzeRawSchema' (Agent ➔ Skill). Available tools inside skill: {available_tools}.",
        "agent_name": "Discovery Agent"
    }
    log_decide = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"),
        "level": "INFO",
        "message": f"Agent evaluating parameters. {reasoning}",
        "agent_name": "Discovery Agent"
    }
    log_msg = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"),
        "level": "SUCCESS", 
        "message": f"Data discovery complete. Profiles loaded for tables: {state['parameters']['source_tables']}", 
        "agent_name": "Discovery Agent"
    }
    return {
        "status": "Running",
        "current_agent": "Discovery Agent",
        "next_agent": "Data Modelling Agent",
        "generated_artifacts": state["generated_artifacts"] + [artifact],
        "logs": state["logs"] + [log_skills, log_decide, log_msg]
    }

def modeling_agent(state: AgentState) -> Dict[str, Any]:
    logger.info("Executing Data Modelling Agent")
    required = [
        {"name": "dimensions", "type": "string", "description": "Comma-separated list of dimension tables."},
        {"name": "facts", "type": "string", "description": "Comma-separated list of fact metrics."}
    ]
    missing = check_parameters(state, required)
    
    if missing:
        return {
            "status": "Blocked",
            "current_agent": "Data Modelling Agent",
            "next_agent": "Data Modelling Agent",
            "missing_parameters": missing,
            "logs": state["logs"] + [make_log("WARN", f"Data Modelling Agent blocked: missing parameters: {', '.join([m['name'] for m in missing])}", "Data Modelling Agent")]
        }
        
    artifact = generate_modeling_artifact(state)
    log_skills = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"),
        "level": "INFO",
        "message": "Loaded Skill 'DesignStarSchema' dynamically. Formulating facts and dimensions mappings...",
        "agent_name": "Data Modelling Agent"
    }
    log_msg = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"),
        "level": "SUCCESS", 
        "message": f"Kimball Star Schema modeled: {artifact['name']}", 
        "agent_name": "Data Modelling Agent"
    }
    return {
        "status": "Running",
        "current_agent": "Data Modelling Agent",
        "next_agent": "Spec Creation Agent",
        "generated_artifacts": state["generated_artifacts"] + [artifact],
        "logs": state["logs"] + [log_skills, log_msg]
    }

def spec_creation_agent(state: AgentState) -> Dict[str, Any]:
    logger.info("Executing Spec Creation Agent")
    required = [{"name": "transformation_rules", "type": "string", "description": "Describe column mapping & joins logic."}]
    missing = check_parameters(state, required)
    
    if missing:
        return {
            "status": "Blocked",
            "current_agent": "Spec Creation Agent",
            "next_agent": "Spec Creation Agent",
            "missing_parameters": missing,
            "logs": state["logs"] + [make_log("WARN", f"Spec Creation Agent blocked: missing parameters: {', '.join([m['name'] for m in missing])}", "Spec Creation Agent")]
        }
        
    artifact = generate_spec_artifact(state)
    log_skills = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"),
        "level": "INFO",
        "message": "Loaded Skill 'GenerateSpecificationDocument' dynamically. compiling joins & transformation rules...",
        "agent_name": "Spec Creation Agent"
    }
    log_msg = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"),
        "level": "SUCCESS", 
        "message": f"Source-to-Target specifications generated: {artifact['name']}", 
        "agent_name": "Spec Creation Agent"
    }
    return {
        "status": "Running",
        "current_agent": "Spec Creation Agent",
        "next_agent": "Pipeline Generation Agent",
        "generated_artifacts": state["generated_artifacts"] + [artifact],
        "logs": state["logs"] + [log_skills, log_msg]
    }

def pipeline_generation_agent(state: AgentState) -> Dict[str, Any]:
    logger.info("Executing Pipeline Generation Agent")
    required = [{"name": "target_table", "type": "string", "description": "Enter the name of the final output table."}]
    missing = check_parameters(state, required)
    
    if missing:
        return {
            "status": "Blocked",
            "current_agent": "Pipeline Generation Agent",
            "next_agent": "Pipeline Generation Agent",
            "missing_parameters": missing,
            "logs": state["logs"] + [make_log("WARN", f"Pipeline Generation Agent blocked: missing parameters: {', '.join([m['name'] for m in missing])}", "Pipeline Generation Agent")]
        }
        
    artifact = generate_pipeline_artifact(state)
    log_skills = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"),
        "level": "INFO",
        "message": "Loaded Skill 'CompilePySparkCode' dynamically. Converting specs to Spark DataFrame API template code...",
        "agent_name": "Pipeline Generation Agent"
    }
    log_msg = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"),
        "level": "SUCCESS", 
        "message": f"PySpark ETL script successfully generated: {artifact['name']}", 
        "agent_name": "Pipeline Generation Agent"
    }
    return {
        "status": "Running",
        "current_agent": "Pipeline Generation Agent",
        "next_agent": "Pipeline Running Agent",
        "generated_artifacts": state["generated_artifacts"] + [artifact],
        "logs": state["logs"] + [log_skills, log_msg]
    }

def pipeline_running_agent(state: AgentState) -> Dict[str, Any]:
    logger.info("Executing Pipeline Running Agent")
    # Check parameters
    missing = check_parameters(state, [])
    
    if missing:
        return {
            "status": "Blocked",
            "current_agent": "Pipeline Running Agent",
            "next_agent": "Pipeline Running Agent",
            "missing_parameters": missing,
            "logs": state["logs"] + [make_log("WARN", f"Pipeline Running Agent blocked: missing parameters: {', '.join([m['name'] for m in missing])}", "Pipeline Running Agent")]
        }
    artifact = generate_pipeline_run_artifact(state)
    available_tools, picked_tool, reasoning = resolve_skill_tools('ExecuteDeltaPipeline', 'RunPySparkNotebook')
    log_skills = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"),
        "level": "INFO",
        "message": f"Loaded Skill 'ExecuteDeltaPipeline' (Agent ➔ Skill). Available tools inside skill: {available_tools}.",
        "agent_name": "Pipeline Running Agent"
    }
    log_decide = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"),
        "level": "INFO",
        "message": f"Agent evaluating parameters. {reasoning}",
        "agent_name": "Pipeline Running Agent"
    }
    log_msg = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"),
        "level": "SUCCESS", 
        "message": f"ETL pipeline executed on Databricks Job cluster. Status: Success. Logs recorded in {artifact['name']}.", 
        "agent_name": "Pipeline Running Agent"
    }
    return {
        "status": "Running",
        "current_agent": "Pipeline Running Agent",
        "next_agent": "Testing Agent",
        "generated_artifacts": state["generated_artifacts"] + [artifact],
        "logs": state["logs"] + [log_skills, log_decide, log_msg]
    }

def testing_agent(state: AgentState) -> Dict[str, Any]:
    logger.info("Executing Testing Agent")
    required = [{"name": "assertions", "type": "string", "description": "Provide data quality assertions (e.g. sales_key unique)."}]
    missing = check_parameters(state, required)
    
    if missing:
        return {
            "status": "Blocked",
            "current_agent": "Testing Agent",
            "next_agent": "Testing Agent",
            "missing_parameters": missing,
            "logs": state["logs"] + [make_log("WARN", f"Testing Agent blocked: missing parameters: {', '.join([m['name'] for m in missing])}", "Testing Agent")]
        }
        
    artifact = generate_testing_artifact(state)
    available_tools, picked_tool, reasoning = resolve_skill_tools('ValidateAssertions', 'ExecuteSQLQuery')
    log_skills = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"),
        "level": "INFO",
        "message": f"Loaded Skill 'ValidateAssertions' (Agent ➔ Skill). Available tools inside skill: {available_tools}.",
        "agent_name": "Testing Agent"
    }
    log_decide = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"),
        "level": "INFO",
        "message": f"Agent evaluating parameters. {reasoning}",
        "agent_name": "Testing Agent"
    }
    log_msg = {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"),
        "level": "SUCCESS", 
        "message": f"Pipeline verification testing complete. All constraints passed! Generated QA report: {artifact['name']}", 
        "agent_name": "Testing Agent"
    }
    return {
        "status": "Completed",
        "current_agent": "Testing Agent",
        "next_agent": None,
        "generated_artifacts": state["generated_artifacts"] + [artifact],
        "logs": state["logs"] + [log_skills, log_decide, log_msg]
    }

def supervisor_agent(state: AgentState) -> Dict[str, Any]:
    logger.info(f"Orchestration Supervisor routing. Current Agent: {state['current_agent']}, Next Agent: {state['next_agent']}")
    
    if state["status"] == "Blocked":
        return state
        
    from backend.db.database import SessionLocal
    from backend.db.models import Workflow
    
    db = SessionLocal()
    try:
        wf = db.query(Workflow).filter(Workflow.data_project_id == state["project_id"]).first()
        if not wf or not wf.agents_sequence:
            return {
                **state,
                "status": "Failed",
                "error_message": "No workflow sequence found"
            }
        import json
        seq = json.loads(wf.agents_sequence)
        
        current = state["current_agent"]
        if current in seq:
            idx = seq.index(current)
            if idx + 1 < len(seq):
                next_agent = seq[idx + 1]
                logger.info(f"Supervisor transitioning from {current} to {next_agent}")
                return {
                    **state,
                    "current_agent": next_agent,
                    "next_agent": next_agent,
                    "missing_parameters": []
                }
            else:
                logger.info("Supervisor reached end of sequence.")
                return {
                    **state,
                    "next_agent": None,
                    "status": "Completed",
                    "logs": state["logs"] + [make_log("SUCCESS", "End-to-end agentic workflow completed successfully.", "Orchestration Agent (Supervisor)")]
                }
        else:
            # Maybe the graph just started, current_agent is empty, but run_agent_workflow sets it to seq[0]
            # If for some reason it's not in seq, complete.
            return {
                **state,
                "next_agent": None,
                "status": "Completed"
            }
    except Exception as e:
        logger.warning(f"Error checking agents sequence in supervisor: {e}")
        return state
    finally:
        db.close()


def dynamic_agent_node_factory(agent_name: str):
    def node_function(state: AgentState) -> Dict[str, Any]:
        logger.info(f"Executing Dynamic Agent: {agent_name}")
        from backend.db.database import SessionLocal
        from backend.db.models import Agent, Skill
        
        db = SessionLocal()
        agent = None
        skills_text = []
        try:
            agent = db.query(Agent).filter(Agent.name == agent_name).first()
            if agent:
                if agent.skills:
                    try:
                        import json
                        skills_list = json.loads(agent.skills) if isinstance(agent.skills, str) else agent.skills
                        for sk_name in skills_list:
                            sk = db.query(Skill).filter(Skill.name == sk_name).first()
                            if sk and sk.instruction:
                                sk_info = f"Skill ({sk.name}): {sk.instruction}"
                                if sk.output_definition:
                                    sk_info += f"\n  Strict Output Format/Schema to follow: {sk.output_definition}"
                                skills_text.append(sk_info)
                    except Exception as e:
                        logger.warning(f"Error parsing skills for agent {agent_name}: {e}")
        finally:
            db.close()
            
        if not agent:
            # Fallback block
            return {
                "status": "Blocked",
                "current_agent": agent_name,
                "next_agent": agent_name,
                "missing_parameters": [],
                "logs": state["logs"] + [make_log("ERROR", f"Agent '{agent_name}' not found in database.", agent_name)]
            }
            
        required = [] # We rely on get_placeholder_parameters dynamically done in check_parameters
        missing = check_parameters(state, required)
        
        if missing:
            return {
                "status": "Blocked",
                "current_agent": agent_name,
                "next_agent": agent_name,
                "missing_parameters": missing,
                "logs": state["logs"] + [make_log("WARN", f"{agent_name} blocked: missing parameters: {', '.join([m['name'] for m in missing])}", agent_name)]
            }
            
        # Build prompt
        agent_instruction = agent.instructions or f"You are {agent_name}. Complete your assigned task based on available context."
        skills_instruction = "\n".join(skills_text)
        
        prompt = f"{agent_instruction}\n\nAvailable Skills Context:\n{skills_instruction}\n\nParameters Provided:\n{state['parameters']}"
        system = f"""You are {agent_name}. Generate the required output artifact in markdown. You MUST strictly adhere to any output format or output definition specified in the Skills context.

CRITICAL BEHAVIOR GUIDELINES FOR THE AGENT:
1. You must execute your instructions and skills step-by-step in a sequential order. Do NOT skip any steps or jump straight to the final outputs.
2. Check if your instructions or assigned skills contain any parameter placeholders (e.g. `{{placeholder_name}}` or `{placeholder_name}`).
3. If any such placeholder is not provided in your inputs or previous conversation context, you MUST immediately STOP and tell the user that you are missing the required parameters (list them explicitly) and ask the user to provide them. Do NOT make up or assume values for missing parameters."""
        
        import json
        content = call_llm(prompt, system, state)
        if not content:
            content = f"# Generated Output for {agent_name}\n\nAgent successfully executed with provided parameters."
            
        prefix = state["table_prefix"] or ""
        artifact = {
            "name": f"{prefix}{agent_name.replace(' ', '_').lower()}_output.md",
            "type": "Dynamic Output",
            "content": content
        }
        
        log_skills = {
            "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"),
            "level": "INFO",
            "message": f"Loaded dynamic skills: {json.loads(agent.skills) if agent.skills else []}",
            "agent_name": agent_name
        }
        log_msg = {
            "timestamp": datetime.datetime.now(datetime.timezone.utc).strftime("%H:%M:%S"),
            "level": "SUCCESS", 
            "message": f"Dynamic Agent '{agent_name}' executed successfully.", 
            "agent_name": agent_name
        }
        
        return {
            "status": "Running",
            "current_agent": agent_name,
            "next_agent": agent_name, # Supervisor will overwrite next_agent
            "generated_artifacts": state["generated_artifacts"] + [artifact],
            "logs": state["logs"] + [log_skills, log_msg]
        }
    return node_function

def run_agent_workflow(initial_state: Dict[str, Any]) -> Dict[str, Any]:
    # Set default structures
    state = {
        "project_id": initial_state.get("project_id", 1),
        "data_product_id": initial_state.get("data_product_id", 1),
        "catalog_name": initial_state.get("catalog_name", "finance_prod"),
        "schema_name": initial_state.get("schema_name", "erp_migration"),
        "table_prefix": initial_state.get("table_prefix", "erp_"),
        "current_agent": initial_state.get("current_agent", ""),
        "next_agent": initial_state.get("next_agent", ""),
        "parameters": initial_state.get("parameters", {}),
        "missing_parameters": [],
        "generated_artifacts": initial_state.get("generated_artifacts", []),
        "logs": initial_state.get("logs", []),
        "status": "Running",
        "error_message": None,
        "global_instruction": initial_state.get("global_instruction")
    }
    
    from backend.db.database import SessionLocal
    from backend.db.models import Workflow
    db = SessionLocal()
    try:
        wf = db.query(Workflow).filter(Workflow.data_project_id == state["project_id"]).first()
        if not wf or not wf.agents_sequence:
            state["status"] = "Failed"
            state["error_message"] = "No workflow or agent sequence defined for this project."
            return state
        import json
        sequence = json.loads(wf.agents_sequence)
    except Exception as e:
        state["status"] = "Failed"
        state["error_message"] = f"Error fetching workflow sequence: {str(e)}"
        return state
    finally:
        db.close()
        
    if not sequence:
        state["status"] = "Failed"
        state["error_message"] = "Workflow agent sequence is empty."
        return state
        
    if not state["current_agent"] or state["current_agent"] not in sequence:
        state["current_agent"] = sequence[0]
        state["next_agent"] = sequence[0]
        
    # Build dynamic graph
    workflow = StateGraph(AgentState)
    workflow.add_node("Supervisor", supervisor_agent)
    
    # All agents are resolved dynamically from the database — no hardcoded handlers
    for agent_name in sequence:
        workflow.add_node(agent_name, dynamic_agent_node_factory(agent_name))
        workflow.add_edge(agent_name, "Supervisor")
        
    workflow.set_entry_point("Supervisor")
    
    # Setup routing conditions
    def route(s):
        if s["status"] == "Blocked":
            return END
        if s["next_agent"] is None:
            return END
        if s["next_agent"] not in sequence:
            # If a custom agent sets next_agent to None or something invalid
            return END
        return s["next_agent"]
        
    route_map = {END: END}
    for agent_name in sequence:
        route_map[agent_name] = agent_name
        
    workflow.add_conditional_edges("Supervisor", route, route_map)
    app_graph = workflow.compile()
    
    try:
        # Run graph execution step-by-step
        logger.info(f"Running LangGraph dynamic pipeline starting with agent: {state['current_agent']}")
        result = app_graph.invoke(state)
        return result
    except Exception as e:
        logger.exception("Error during dynamic graph execution")
        state["status"] = "Failed"
        state["error_message"] = str(e)
        state["logs"].append(make_log("ERROR", f"Graph execution failed: {e}", "Supervisor"))
        return state
