import sys
import os
import json

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from db.database import SessionLocal
from db.models import Tool

db = SessionLocal()
tool = db.query(Tool).filter(Tool.name == 'sync_rest_api_extraction').first()

if tool:
    execution_block = """

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
    if "# --- Execution Block ---" not in tool.code:
        tool.code += execution_block
        db.commit()
        print("Tool patched successfully.")
    else:
        print("Tool already patched.")
else:
    print("Tool not found.")
db.close()
