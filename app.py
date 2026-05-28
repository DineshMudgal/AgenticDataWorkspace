import os
import uvicorn
from dotenv import load_dotenv

# Load env file if running locally
load_dotenv()

if __name__ == "__main__":
    # Databricks App dynamically sets DATABRICKS_APP_PORT
    port = int(os.environ.get("DATABRICKS_APP_PORT", 8000))
    host = "0.0.0.0"
    
    print(f"Starting AgenticDataWorkspace Server on {host}:{port}...")
    uvicorn.run("backend.main:app", host=host, port=port, reload=True)
