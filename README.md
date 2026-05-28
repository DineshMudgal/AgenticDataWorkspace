# AgenticDataWorkspace 🚀

**AgenticDataWorkspace** is an enterprise-grade platform designed to automate and orchestrate the design, ingestion, modeling, and quality verification of data pipelines in Databricks. By utilizing a multi-agent AI coordinator built on **LangGraph**, the system guides users through registering data domains, generating star schemas, compiling PySpark code, executing Databricks jobs, and validating assertions in a unified sandbox.

---

## 🌌 Platform Architecture

The platform is built around a multi-agent coordination design pattern. A supervisor orchestrator coordinates transitions between specialized agent personas, ensuring that each step of the pipeline development lifecycle is executed sequentially:

1. **Requirement Gathering**: Metrics collection and field-level metadata mapping.
2. **Discovery Agent**: Source schema connection and null-data risk profiling.
3. **Data Modelling Agent**: Star schema design (facts/dimensions) enforcing Kimball models.
4. **Spec Creation Agent**: Detailed source-to-target specifications mapping.
5. **Pipeline Generation**: Optimized PySpark DataFrame and Delta Live Tables (DLT) code compilation.
6. **Pipeline Running**: Compute cluster spin-up and notebook execution via the Databricks Jobs API.
7. **Testing Agent**: QA assertions suite and data quality validation reports.

---

## 🛠 Technology Stack

### Backend
*   **FastAPI**: Modern, high-performance web framework for Python.
*   **LangGraph & LangChain**: Coordination state machine for multi-agent ReAct workflows.
*   **SQLAlchemy**: Object-Relational Mapping (ORM) framework.
*   **SQLite / PostgreSQL**: Dynamic database adapters (auto-connection pool fallback).
*   **Google GenAI SDK**: Gemini-2.5-flash model integration for reasoning and smart offline fallback suggestion synthesis.
*   **Uvicorn**: ASGI server implementation.

### Frontend
*   **React (v18+) & TypeScript**: Type-safe SPA client interface.
*   **Vite**: Frontend toolchain and asset bundler.
*   **Vanilla CSS**: Premium styling system incorporating modern dark modes, glassmorphism card templates, and smooth micro-animations.

---

## 📦 Getting Started

### Prerequisites
*   Python 3.10+
*   Node.js 18+ and npm 9+

### Installation & Local Setup

#### 1. Clone the Repository and Set Up Environment Variables
Create a `.env` file in the root directory:
```env
# Databricks App configurations
DATABRICKS_HOST="https://adb-123456789.gcp.databricks.com"
DATABRICKS_TOKEN="dapi-your-token-here"

# AI LLM Provider Configuration (gemini, databricks, azure_openai, or azure_ai_foundry)
LLM_PROVIDER="gemini"
GEMINI_API_KEY="AIzaSyYourGeminiApiKeyHere"
GEMINI_MODEL="gemini-2.5-flash"

# Optional Database Override (Defaults to local SQLite)
# DB_URL="postgresql://user:password@localhost:5432/agentic_db"
```

#### 2. Install Python Packages and Start Backend
```bash
# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start FastAPI application in reload mode
python app.py
```
The server will start on `http://localhost:8000`. You can visit `http://localhost:8000/docs` to view the interactive API swagger documentation.

#### 3. Install NPM Packages and Start Frontend
In a new terminal window:
```bash
cd frontend

# Install Node modules
npm install

# Start Vite dev server with proxy configuration
npm run dev
```
Open your browser and navigate to `http://localhost:5173`.

---

## 🚀 Production Build & Deployment

### Local Production Server Compilation
To build the frontend SPA and serve it directly via the FastAPI application:
```bash
# Compile React application
cd frontend
npm run build

# Start production server
cd ..
python app.py
```
Open `http://localhost:8000` to interact with the production version.

### Databricks Apps Deployment
The repository includes an `app.yaml` manifest. To launch within Databricks:
1. Ensure frontend compiled assets are updated in `/static` (`npm run build`).
2. Verify `app.yaml` structure:
   ```yaml
   command:
     - python
     - app.py
   ```
3. Deploy the application directory using the Databricks CLI or Databricks App console, binding environment secrets directly.

---

## 📚 Documentation Reference
Detailed execution instructions and tutorials can be found in the `docs/` directory:
- [Run Guide](file:///home/dinesh/Projects/AgenticDataWorkspace/docs/RUN_GUIDE.md): Extended startup steps and system prerequisite commands.
- [User Guide](file:///home/dinesh/Projects/AgenticDataWorkspace/docs/USER_GUIDE.md): Wizard registration steps and studio onboarding instructions.
- [Release Notes](file:///home/dinesh/Projects/AgenticDataWorkspace/docs/RELEASE_NOTES.md): Functional capabilities and version stability details.
- [System Checkpoint](file:///home/dinesh/Projects/AgenticDataWorkspace/docs/CHECKPOINT.md): DB schemas and runtime coordination reference.
