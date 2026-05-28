# AgenticDataWorkspace: Solution Execution & Deployment Guide

This guide details how to configure, run, and build the **AgenticDataWorkspace** platform, including both the FastAPI backend and React Vite client.

---

## 1. Prerequisites

Before running the application, ensure the following tools are installed on your system:

*   **Python**: Version 3.10 or newer.
*   **Node.js & npm**: Node version 18+ and npm version 9+.
*   **C/C++ Build Tools**: Required for compiling native dependencies if using PostgreSQL.

---

## 2. Environment Configuration

The application uses environment variables for LLM integration (Gemini / OpenAI) and database connections. 

Create a `.env` file in the root directory:

```bash
# Workspace Configuration
DATABRICKS_HOST="https://adb-123456789.gcp.databricks.com"
DATABRICKS_TOKEN="dapi-your-token-here"

# AI Orchestration Keys (Optional, fallback logic will trigger if omitted)
GEMINI_API_KEY="AIzaSyYourGeminiApiKeyHere"
OPENAI_API_KEY="sk-proj-YourOpenAIApiKeyHere"

# Database Configuration (Optional, defaults to local SQLite)
# DATABASE_URL="postgresql://user:pass@localhost:5432/agentic_db"
```

---

## 3. Backend Setup & Startup

The backend is built using **FastAPI**, **SQLAlchemy**, and **LangGraph** (for multi-agent coordination).

### Step 3.1: Install Dependencies
Create a virtual environment (recommended) and install the backend packages:

```bash
# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install required python packages
pip install fastapi uvicorn sqlalchemy pydantic python-dotenv
# If using Gemini or OpenAI integrations, install:
pip install google-generativeai openai
# LangGraph state machine packages:
pip install langgraph
```

> [!NOTE]
> Database creation and seeding (with mock data products, projects, and skills) happen automatically on backend startup.

### Step 3.2: Run the Server
Launch the FastAPI development server:

```bash
# Start server in reload mode (runs on port 8000)
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

Verify backend health by visiting: `http://localhost:8000/docs` to see the interactive Swagger UI.

---

## 4. Frontend Setup & Startup

The client interface is built using **React**, **TypeScript**, and **Vite**.

### Step 4.1: Install Node Packages
Navigate to the `frontend/` directory and install dependencies:

```bash
cd frontend
npm install
```

### Step 4.2: Run the Development Server
Run Vite in dev mode. It automatically proxies API requests (`/api/*`) to the backend server running on port 8000:

```bash
npm run dev
```
Open your browser to the URL shown in your terminal (typically `http://localhost:5173`).

---

## 5. Production Build & Local Hosting

If you want FastAPI to serve the built static React files directly (re-creating a production deployment):

1. Compile the React application:
   ```bash
   cd frontend
   npm run build
   ```
   This compiles and outputs the SPA assets to the `static/` directory in the root.
2. Start the FastAPI server:
   ```bash
   cd ..
   uvicorn backend.main:app --host 0.0.0.0 --port 8000
   ```
3. Open `http://localhost:8000` in your web browser. The FastAPI server will serve the React app natively.

---

## 6. Deployment inside Databricks Apps

To deploy the **AgenticDataWorkspace** inside a Databricks App:

1. **Build frontend assets**: Ensure you run `npm run build` so the static directory is up to date.
2. **Configure Databricks App Manifest**: Create an `app.yaml` manifest specifying the FastAPI startup command:
   ```yaml
   command:
     - "uvicorn"
     - "backend.main:app"
     - "--host"
     - "0.0.0.0"
     - "--port"
     - "8000"
   ```
3. **Environment variables**: Bind variables like `GEMINI_API_KEY` and database credentials in the Databricks App configuration console.
4. **Deploy**: Upload the project directory to Databricks Apps using the Databricks CLI or UI.
