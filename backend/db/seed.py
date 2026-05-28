import logging
import json
from sqlalchemy.orm import Session
from backend.db.models import DataProduct, DataProject, Skill, Agent, Workflow, SystemLog, Tool, Artifact

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("DatabaseSeed")

API_EXTRACTOR_CODE = """import requests
import json
import time

def extract_api_data(url, auth_config=None, pagination_config=None, incremental_config=None):
    session = requests.Session()
    
    # 1. Setup Authentication
    if auth_config:
        auth_type = auth_config.get("type")
        if auth_type == "Basic":
            session.auth = (auth_config.get("username", ""), auth_config.get("password", ""))
        elif auth_type == "Bearer":
            session.headers.update({"Authorization": f"Bearer {auth_config.get('token', '')}"})
        elif auth_type == "ApiKey":
            if auth_config.get("location") == "header":
                session.headers.update({auth_config.get("name"): auth_config.get("value")})
            else:
                session.params.update({auth_config.get("name"): auth_config.get("value")})

    # 2. Setup Incremental params
    if incremental_config:
        session.params.update({incremental_config.get("param_name"): incremental_config.get("watermark_value")})

    all_results = []
    current_url = url
    page_num = pagination_config.get("start_page", 1) if pagination_config else 1
    offset = pagination_config.get("start_offset", 0) if pagination_config else 0
    
    while True:
        try:
            response = session.get(current_url)
            response.raise_for_status()
            data = response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error fetching data: {e}")
            break
            
        results_key = pagination_config.get("results_key") if pagination_config else None
        current_batch = data.get(results_key, []) if results_key and isinstance(data, dict) else data
        
        if not isinstance(current_batch, list):
            current_batch = [current_batch]
            
        all_results.extend(current_batch)
        
        # 3. Handle Pagination
        if not pagination_config or not current_batch:
            break
            
        pag_type = pagination_config.get("type")
        
        if pag_type == "OffsetLimit":
            limit = pagination_config.get("limit", 100)
            if len(current_batch) < limit:
                break
            offset += limit
            session.params.update({
                pagination_config.get("offset_param", "offset"): offset,
                pagination_config.get("limit_param", "limit"): limit
            })
            
        elif pag_type == "PageNumber":
            if not current_batch:
                break
            page_num += 1
            session.params.update({pagination_config.get("page_param", "page"): page_num})
            
        elif pag_type == "CursorField":
            cursor_field = pagination_config.get("cursor_field", "next_cursor")
            cursor = data.get(cursor_field) if isinstance(data, dict) else None
            if not cursor:
                break
            session.params.update({pagination_config.get("cursor_param", "cursor"): cursor})
            
        elif pag_type == "NextUrl":
            next_url_field = pagination_config.get("next_url_field", "next")
            next_url = data.get(next_url_field) if isinstance(data, dict) else None
            if not next_url:
                break
            current_url = next_url
            
        else:
            break
            
        time.sleep(pagination_config.get("sleep_seconds", 0.5))
        
    return all_results

# --- Execution Block ---
url = inputs.get("url")
auth_config = inputs.get("auth_config")
if isinstance(auth_config, str):
    try: auth_config = json.loads(auth_config)
    except: pass
pagination_config = inputs.get("pagination_config")
if isinstance(pagination_config, str):
    try: pagination_config = json.loads(pagination_config)
    except: pass
incremental_config = inputs.get("incremental_config")
if isinstance(incremental_config, str):
    try: incremental_config = json.loads(incremental_config)
    except: pass

if url:
    print(f"Starting extraction from {url}...")
    results = extract_api_data(url, auth_config, pagination_config, incremental_config)
    print(f"Extraction successful. Retrieved {len(results)} records.")
    if results:
        print(f"Sample data:")
        print(json.dumps(results[:2], indent=2))
else:
    print("Error: No URL provided.")
"""

def seed_data(db: Session):
    logger.info("Checking database for existing data...")
    if db.query(Tool).first() is not None:
        logger.info("Database is already seeded. Skipping seed process.")
        return

    logger.info("Starting database seeding...")
    # Clean up existing data
    db.query(Workflow).delete()
    db.query(Artifact).delete()
    db.query(DataProject).delete()
    db.query(DataProduct).delete()
    db.query(Agent).delete()
    db.query(Skill).delete()
    db.query(Tool).delete()
    db.commit()

    # 1. Seed Data Products
    logger.info("Seeding data products...")
    api_product = DataProduct(
        name="Enterprise API Ingestion",
        description="Synchronizes data from external REST APIs into Delta Lake Medallion Architecture.",
        type="Ingestion",
        is_enabled=True,
        global_parameters=json.dumps([
            {"name": "api_base_url", "type": "string", "description": "Base URL of the REST API", "default_value": "https://api.data.gov.in"},
            {"name": "auth_token_secret", "type": "string", "description": "Name of the secret scope containing the API key", "default_value": "api-secrets"}
        ]),
        global_instruction="Always implement exponential backoff for rate limits. Store raw JSON payloads in a Bronze table before exploding."
    )
    db.add(api_product)
    db.commit()

    # 2. Seed Data Projects
    logger.info("Seeding data projects...")
    indian_fleet_project = DataProject(
        name="Indian Fleet Ingestion",
        description="Ingests public transport and Indian Fleet data APIs from data.gov.in.",
        data_product_id=api_product.id,
        is_enabled=True,
        parameters=json.dumps({"api_base_url": "https://api.data.gov.in/resource"}),
        databricks_url="https://gcp-workspace.cloud.databricks.com",
        catalog_name="dp_public_res",
        schema_name="gov_indian_fleet",
        table_prefix="fleet_"
    )
    db.add(indian_fleet_project)
    db.commit()

    # 3. Seed Tools
    logger.info("Seeding tools...")
    api_tool = Tool(
        name="sync_rest_api_extraction",
        description="Generic tool for synchronous REST API extraction handling all auth, pagination, and incremental load scenarios.",
        type="python",
        code=API_EXTRACTOR_CODE,
        parameters=json.dumps([
            {"name": "url", "type": "string", "description": "Target endpoint", "required": True},
            {"name": "auth_config", "type": "json", "description": "JSON dict of auth settings (Basic, Bearer, ApiKey)", "required": False},
            {"name": "pagination_config", "type": "json", "description": "JSON dict of pagination settings", "required": False},
            {"name": "incremental_config", "type": "json", "description": "JSON dict of watermark settings", "required": False}
        ]),
        is_enabled=True
    )
    db.add(api_tool)

    file_writer_tool = Tool(
        name="file_writer_tool",
        description="Writes structured text or JSON to a local file in the workspace.",
        type="python",
        code='''import json
def write_file(inputs):
    path = inputs.get("path")
    content = inputs.get("content")
    if not path or not content: return {"error": "path and content are required"}
    try:
        if isinstance(content, dict) or isinstance(content, list):
            content = json.dumps(content, indent=2)
        with open(path, "w") as f:
            f.write(content)
        return {"status": "success", "message": f"Successfully wrote to {path}"}
    except Exception as e:
        return {"error": str(e)}

print(json.dumps(write_file(inputs)))
''',
        parameters=json.dumps([
            {"name": "path", "type": "string", "description": "Absolute path to file", "required": True},
            {"name": "content", "type": "string", "description": "Content to write", "required": True}
        ]),
        is_enabled=True
    )
    db.add(file_writer_tool)

    file_reader_tool = Tool(
        name="file_reader_tool",
        description="Reads structured text or JSON from a local file in the workspace.",
        type="python",
        code='''import json
def read_file(inputs):
    path = inputs.get("path")
    if not path: return {"error": "path is required"}
    try:
        with open(path, "r") as f:
            content = f.read()
        return {"status": "success", "content": content}
    except Exception as e:
        return {"error": str(e)}

print(json.dumps(read_file(inputs)))
''',
        parameters=json.dumps([
            {"name": "path", "type": "string", "description": "Absolute path to file", "required": True}
        ]),
        is_enabled=True
    )
    db.add(file_reader_tool)

    databricks_query_tool = Tool(
        name="execute_databricks_warehouse_query",
        description="Executes a SQL query over a Databricks SQL Warehouse and returns the result schema and data rows.",
        type="python",
        code='''
def run_databricks_query(inputs):
    import os
    import json
    import requests

    query = inputs.get("query")
    warehouse_id = inputs.get("warehouse_id")
    
    host = os.environ.get("DATABRICKS_HOST", "").rstrip("/")
    token = os.environ.get("DATABRICKS_TOKEN")
    
    if not host or not token:
        mock_data = [
            {"id": 1, "name": "IngestionJob_A", "status": "COMPLETED", "records_written": 12500},
            {"id": 2, "name": "BronzeToSilver_B", "status": "COMPLETED", "records_written": 12480},
            {"id": 3, "name": "SilverToGold_C", "status": "COMPLETED", "records_written": 12000}
        ]
        return {
            "status": "success",
            "message": "Executed SQL on Mock Databricks SQL Warehouse (DATABRICKS_HOST/TOKEN not configured)",
            "columns": ["id", "name", "status", "records_written"],
            "rows": mock_data
        }

    url = f"{host}/api/2.0/sql/statements"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    wh_id = warehouse_id or os.environ.get("DATABRICKS_WAREHOUSE_ID")
    if not wh_id:
        try:
            wh_resp = requests.get(f"{host}/api/2.0/sql/warehouses", headers=headers)
            if wh_resp.status_code == 200:
                warehouses = wh_resp.json().get("warehouses", [])
                if warehouses:
                    wh_id = warehouses[0].get("id")
        except:
            pass
            
    if not wh_id:
        return {"error": "Databricks SQL Warehouse ID is required but not configured or found."}
        
    payload = {
        "statement": query,
        "warehouse_id": wh_id
    }
    
    try:
        response = requests.post(url, headers=headers, json=payload, timeout=45)
        if response.status_code == 200:
            res_json = response.json()
            state = res_json.get("status", {}).get("state")
            statement_id = res_json.get("statement_id")
            
            import time
            for _ in range(10):
                if state in ("SUCCEEDED", "FAILED", "CANCELED"):
                    break
                time.sleep(1.0)
                poll_resp = requests.get(f"{host}/api/2.0/sql/statements/{statement_id}", headers=headers)
                if poll_resp.status_code == 200:
                    res_json = poll_resp.json()
                    state = res_json.get("status", {}).get("state")
                else:
                    break
            
            if state == "SUCCEEDED":
                result = res_json.get("result", {})
                schema = result.get("schema", {})
                columns = [col.get("name") for col in schema.get("columns", [])]
                raw_rows = result.get("data_array", [])
                
                rows_dict = []
                for row_val in raw_rows:
                    rows_dict.append(dict(zip(columns, row_val)))
                    
                return {
                    "status": "success",
                    "columns": columns,
                    "rows": rows_dict[:100],
                    "statement_id": statement_id
                }
            else:
                err_msg = res_json.get("status", {}).get("error", {}).get("message", "Unknown error")
                return {"error": f"SQL execution state: {state}. Error: {err_msg}"}
        else:
            return {"error": f"HTTP {response.status_code}: {response.text}"}
    except Exception as e:
        return {"error": str(e)}

print(json.dumps(run_databricks_query(inputs)))
''',
        parameters=json.dumps([
            {"name": "query", "type": "string", "description": "SQL statement to run", "required": True},
            {"name": "warehouse_id", "type": "string", "description": "Databricks SQL Warehouse ID", "required": False}
        ]),
        is_enabled=True
    )
    db.add(databricks_query_tool)

    databricks_push_tool = Tool(
        name="push_file_to_databricks_workspace",
        description="Imports / pushes local workspace files directly into a Databricks Workspace folder.",
        type="python",
        code='''
def push_to_databricks_workspace(inputs):
    import os
    import json
    import base64
    import requests

    workspace_path = inputs.get("workspace_path")
    file_content = inputs.get("file_content")
    file_language = inputs.get("language", "PYTHON").upper()
    overwrite = inputs.get("overwrite", True)

    if not workspace_path or not file_content:
        return {"error": "workspace_path and file_content are required"}

    host = os.environ.get("DATABRICKS_HOST", "").rstrip("/")
    token = os.environ.get("DATABRICKS_TOKEN")

    if not host or not token:
        return {
            "status": "success",
            "message": f"Successfully pushed file to mock Databricks Workspace path: {workspace_path} (Credentials not configured)",
            "path": workspace_path,
            "language": file_language,
            "bytes_written": len(file_content)
        }

    url = f"{host}/api/2.0/workspace/import"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    encoded_content = base64.b64encode(file_content.encode("utf-8")).decode("utf-8")

    payload = {
        "path": workspace_path,
        "format": "SOURCE",
        "language": file_language,
        "content": encoded_content,
        "overwrite": overwrite
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=20)
        if response.status_code == 200:
            return {
                "status": "success",
                "message": f"Successfully pushed file to Databricks Workspace path: {workspace_path}",
                "path": workspace_path,
                "language": file_language,
                "bytes_written": len(file_content)
            }
        else:
            return {"error": f"HTTP {response.status_code}: {response.text}"}
    except Exception as e:
        return {"error": str(e)}

print(json.dumps(push_to_databricks_workspace(inputs)))
''',
        parameters=json.dumps([
            {"name": "workspace_path", "type": "string", "description": "Target workspace path in Databricks (e.g. /Shared/import_job)", "required": True},
            {"name": "file_content", "type": "string", "description": "String content of file to upload", "required": True},
            {"name": "language", "type": "string", "description": "Language format: PYTHON, SQL, SCALA, or R", "required": False},
            {"name": "overwrite", "type": "boolean", "description": "Whether to overwrite if file already exists", "required": False}
        ]),
        is_enabled=True
    )
    db.add(databricks_push_tool)

    db.commit()

    # 4. Seed Skills
    logger.info("Seeding skills...")
    skills = [
        Skill(
            name="fetch_data_gov_specs",
            description="Fetches data specifications and sample data from data.gov APIs using ApiKey authentication.",
            instruction="Use the sync_rest_api_extraction tool to hit the data.gov API endpoint. Ensure you configure auth_config for ApiKey auth where location=query and name='api-key'. Extract and return the JSON schema and available fields to build a data model.",
            parameters=json.dumps([{"name": "endpoint", "type": "string", "required": True}]),
            tools=json.dumps(["sync_rest_api_extraction"]),
            is_enabled=True
        ),
        Skill(
            name="analyze_api_schema",
            description="Dynamically parse standard API formats (JSON/XML) from payloads.",
            instruction="Analyze the payload returned by the extraction tool. Identify the root node for records, data types for each field, and handle any nested structs or arrays.",
            parameters=json.dumps([{"name": "payload", "type": "string", "required": True}]),
            tools=json.dumps([]),
            is_enabled=True
        ),
        Skill(
            name="create_json_schema",
            description="Generates a standardized JSON specification for data models.",
            instruction="Create a technical JSON file mapping source fields to target Medallion fields. Use the file_writer_tool to save this to data_specification.json.",
            parameters=json.dumps([{"name": "fields", "type": "string", "required": True}]),
            tools=json.dumps(["file_writer_tool"]),
            is_enabled=True
        ),
        Skill(
            name="generate_medallion_ddl",
            description="Generates Databricks DDL for Silver and Gold layers.",
            instruction="Generate SQL DDL. Use DELTA format. Ensure Silver and Gold represent flattened/modeled schemas based on data_specification.json.",
            parameters=json.dumps([{"name": "schema_json", "type": "string", "required": True}]),
            tools=json.dumps([]),
            is_enabled=True
        ),
        Skill(
            name="generate_bronze_schema_enforcement",
            description="Generates Databricks DDL for Bronze schema enforcement.",
            instruction="Generate SQL DDL for the Bronze layer using the exact source schema types. This is used for schema evolution and enforcement in Auto Loader or Structured Streaming.",
            parameters=json.dumps([{"name": "schema_json", "type": "string", "required": True}]),
            tools=json.dumps([]),
            is_enabled=True
        ),
        Skill(
            name="generate_medallion_dml",
            description="Generates Databricks DML for transforming data across Medallion layers.",
            instruction="Write INSERT INTO, MERGE INTO, or PySpark DataFrame transformations to move data from Landing to Bronze, Bronze to Silver, and Silver to Gold.",
            parameters=json.dumps([{"name": "target_schema", "type": "string", "required": True}]),
            tools=json.dumps([]),
            is_enabled=True
        )
    ]
    db.add_all(skills)
    db.commit()

    # 5. Seed Agents
    logger.info("Seeding agents...")
    agents = [
        Agent(
            name="Requirement Agent",
            role="Business Analyst",
            skills=json.dumps([]),
            tools=json.dumps([]),
            instructions="Your job is to elicit data ingestion requirements from the user. You define the objectives, source API, and target Medallion architecture expectations.",
            is_enabled=True
        ),
        Agent(
            name="DiscoveryAgent",
            role="Data Profiler",
            skills=json.dumps(["fetch_data_gov_specs", "analyze_api_schema"]),
            tools=json.dumps(["sync_rest_api_extraction"]),
            instructions="You are responsible for discovering the source API schema. Connect to the data.gov APIs using the fetch_data_gov_specs skill to inspect the data structure and output a proposed data model.",
            is_enabled=True
        ),
        Agent(
            name="Data Modeller Agent",
            role="Data Architect",
            skills=json.dumps(["create_json_schema"]),
            tools=json.dumps(["file_writer_tool"]),
            instructions="Take the profiled payload from the DiscoveryAgent and translate it into formal technical specifications. Output data_specification.json and data_model.md using your file writer tool.",
            is_enabled=True
        ),
        Agent(
            name="DDL Generation Agent",
            role="Infrastructure Engineer",
            skills=json.dumps(["generate_medallion_ddl", "generate_bronze_schema_enforcement"]),
            tools=json.dumps(["file_reader_tool"]),
            instructions="Read data_specification.json. Generate Schema Enforcement DDL for the Bronze Layer, and Flattened/Aggregated DDL for the Silver and Gold Layers.",
            is_enabled=True
        ),
        Agent(
            name="DML Generation Agent",
            role="Data Engineer",
            skills=json.dumps(["generate_medallion_dml"]),
            tools=json.dumps(["file_reader_tool"]),
            instructions="Read data_specification.json. Generate the Delta MERGE / INSERT scripts for migrating data from Landing -> Bronze -> Silver -> Gold.",
            is_enabled=True
        )
    ]
    db.add_all(agents)
    db.commit()

    # 6. Seed Workflows for each Project
    logger.info("Seeding workflows...")
    
    discovery_seq = json.dumps([
        "Requirement Agent",
        "DiscoveryAgent", 
        "Data Modeller Agent"
    ])
    build_seq = json.dumps([
        "DDL Generation Agent",
        "DML Generation Agent"
    ])
    
    missing = [{"name": "api_key", "type": "string", "description": "Provide the API Key for data.gov.in."}]

    w1 = Workflow(
        name="1. Discovery Phase",
        description="Extract requirements, hit source API, and generate data_specification.json.",
        data_product_id=api_product.id,
        data_project_id=indian_fleet_project.id,
        agents_sequence=discovery_seq,
        status="Blocked",
        is_enabled=True,
        current_agent="Requirement Agent",
        next_agent="DiscoveryAgent",
        missing_parameters=json.dumps(missing),
        schedule_enabled=False
    )
    
    w2 = Workflow(
        name="2. Build Phase",
        description="Reads data_specification.json and outputs DDL and DML scripts for Databricks.",
        data_product_id=api_product.id,
        data_project_id=indian_fleet_project.id,
        agents_sequence=build_seq,
        status="Ready",
        is_enabled=True,
        current_agent="DDL Generation Agent",
        next_agent="DML Generation Agent",
        missing_parameters=json.dumps([]),
        schedule_enabled=False
    )
        
    db.add(w1)
    db.add(w2)
    db.commit()

    logger.info("Database seeding complete!")
