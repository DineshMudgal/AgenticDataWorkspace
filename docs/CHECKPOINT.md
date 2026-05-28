# System Checkpoint & Context Memory Store

This document acts as a persistent memory and system reference point for subsequent AI agent invocations. It outlines the codebase layout, architectural components, database schema relationships, and runtime flows of the **AgenticDataWorkspace** platform.

---

## 1. Architectural Layout

AgenticDataWorkspace is organized as a decoupled web application comprising a FastAPI backend, a React SPA client, and a LangGraph-powered multi-agent orchestration runtime.

```
AgenticDataWorkspace/
├── backend/
│   ├── agents/
│   │   └── graph.py             # LangGraph state machine & dynamic node factory
│   ├── db/
│   │   ├── database.py          # SQLAlchemy engine, connection pool & DB yield
│   │   ├── models.py            # SQLAlchemy database models
│   │   └── seed.py              # Initial demo data & custom tool mock codes
│   ├── routes/
│   │   ├── products_projects.py # Routes for DataProduct and DataProject
│   │   ├── agents_skills_tools.py # Routes for Tool, Skill, and Agent Studio
│   │   ├── workflows_executions.py # Routes for Workflow execution runs & suggestions
│   │   └── system.py            # Routes for settings logs stream & system log database
│   ├── config.py                # Environment & dynamic database settings sync
│   ├── helpers.py               # Shared utility functions (obfuscation, ReAct sandbox)
│   ├── logging_config.py        # Log formatter, secret masking, & database log handler
│   ├── main.py                  # API router aggregator & startup lifecycle hook
│   └── scheduler.py             # Daemon background workflow cron execution thread
├── docs/
│   ├── CHECKPOINT.md            # [This File] Context memory store reference
│   ├── RELEASE_NOTES.md         # Current release feature list
│   ├── RUN_GUIDE.md             # Compilation, setup & execution instructions
│   └── USER_GUIDE.md            # Functional walkthrough & tutorial guide
├── frontend/                    # React Vite TypeScript frontend
│   ├── src/
│   │   ├── components/          # React modules (Dashboard, Studios, Workbench)
│   │   ├── App.tsx              # Sidebar, active tabs and API fetching hooks
│   │   ├── types.ts             # TypeScript entity interfaces
│   │   └── index.css            # Custom CSS styling tokens
│   └── vite.config.ts           # Development server proxy configurations (/api/*)
├── static/                      # Compiled frontend static build assets
├── app.py                       # Databricks App local server startup execution hook
├── app.yaml                     # Databricks App deployment manifest
└── requirements.txt             # Project Python dependencies
```

---

## 2. Database Schema Reference

The database connection defaults to PostgreSQL (`DB_URL` env variable), falling back dynamically to a local SQLite database (`sqlite:///agentic_workspace.db`) on failure.

### Entities & Columns

#### 1. `DataProduct` (`data_products`)
- Mapped to a governance unit/data domain.
- Columns: `id`, `name`, `description`, `uc_owner` (Unity Catalog Owner), `tags`, `type` (e.g., Ingestion), `global_parameters` (JSON array of parameters), `global_instruction`, `is_enabled`, `owner_group`.

#### 2. `DataProject` (`data_projects`)
- A specific workspace deployment linked to a `DataProduct`.
- Columns: `id`, `name`, `description`, `data_product_id` (FK), `is_enabled`, `parameters` (JSON dict), `databricks_url`, `catalog_name`, `schema_name`, `table_prefix`, `instructions`.

#### 3. `Tool` (`tools`)
- Lower-level execution functions written in Python, SQL, or configured as API endpoints.
- Columns: `id`, `name`, `description`, `type` (python/sql/api), `code`, `parameters` (JSON array), `is_enabled`.

#### 4. `Skill` (`skills`)
- A higher-level task capability instructing an agent on how to execute. Inherits/associates multiple custom `Tool` names.
- Columns: `id`, `name`, `description`, `instruction` (prompt directives), `parameters` (JSON array), `output_definition`, `tools` (JSON array of tool names), `is_enabled`.

#### 5. `Agent` (`agents`)
- Custom AI personas defined by `role` and `instructions`, equipped with `skills` and inherited `tools`.
- Columns: `id`, `name`, `role`, `skills` (JSON array of skill names), `tools` (JSON array of tool names), `instructions`, `introduction` (generated welcome text), `is_enabled`.

#### 6. `Workflow` (`workflows`)
- Orchestration sequence containing an ordered array of agents to execute.
- Columns: `id`, `name`, `description`, `data_product_id`, `data_project_id` (FK), `agents_sequence` (JSON array of agent names), `status` (Idle/Running/Blocked/Completed/Failed), `is_enabled`, `parameters` (runtime checkpoints), `missing_parameters` (JSON array of blocked placeholders), `user_parameters`, `current_agent`, `next_agent`, `history_logs` (JSON array), `schedule_cron`, `schedule_enabled`, `last_run_at`.

#### 7. `WorkflowExecution` (`workflow_executions`)
- Historic logs tracking individual workflow execution sessions.
- Columns: `id`, `execution_id` (UUIDv4), `workflow_id` (FK), `status`, `trigger_query`, `input_parameters` (JSON), `agent_outputs` (JSON mapping agent name to output text), `error_message`, `started_at`, `completed_at`.

#### 8. `Artifact` (`artifacts`)
- Output specifications, scripts, log traces, or test reports generated by agents.
- Columns: `id`, `name`, `type`, `content`, `data_project_id` (FK), `execution_id` (FK), `agent_name` (generator agent), `status` (Draft/Deployed), `metadata_json`.

#### 9. `SystemLog` (`system_logs`)
- Logic-level reasoning console traces showing agent actions and transitions.
- Columns: `id`, `timestamp`, `level` (INFO/WARN/SUCCESS/ERROR), `message`, `details`, `agent_name`, `project_id`.

#### 10. `ServerLog` (`server_logs`)
- HTTP server and Python logging output captured by the logging config.
- Columns: `id`, `timestamp`, `level`, `logger_name`, `message`, `module`, `func_name`, `line_no`.

#### 11. `SystemSetting` (`system_settings`)
- Dynamic config environment setups.
- Columns: `key` (PK), `value`, `is_secret`.

---

## 3. Dynamic Runtime Flows

### Chained Agent Context Execution
When `POST /api/workflows/{wf_id}/execute` is triggered, the backend sequentially steps through the workflow's `agents_sequence`:
1. The system loads the selected Agent's instructions and custom skills.
2. The agent prompt is enriched with:
   - Input parameters merged from the UI, Project, and Product.
   - Outputs generated by the previous agent in the sequence (`chain_context`).
3. An execution ReAct loop runs (`execute_actual_react_loop`), resolving tool availability to the union of tools attached to the agent's skills.
4. Output is generated, saved as a new `Artifact`, mapped to `WorkflowExecution`, and passed as input context to the next agent in line.

### LangGraph State Machine Loop
When `POST /api/projects/{project_id}/run` is triggered, the LangGraph supervisor state machine is initialized:
1. `run_agent_workflow` builds a dynamic graph compile using `StateGraph(AgentState)`.
2. A `Supervisor` node controls sequencing by reading the database sequence.
3. If any required parameters are found missing during state node checks (`check_parameters`), the graph transition toggles to `Blocked` and execution exits, waiting for human input parameter merge.
4. Upon successful completion, state variables are flushed back to the database.

### Background Workflow Scheduler
- The scheduler runs on a daemonized thread, waking up every 10 seconds to scan active cron workflows.
- On scheduled hits, it merges project parameters and runs the LangGraph multi-agent loop in the background.

---

## 4. Observability and Masking
- **Secret Sanitization**: Database insert hooks automatically detect values matching environment keys like `GEMINI_API_KEY`, `DATABRICKS_TOKEN`, `AZURE_OPENAI_API_KEY`, or `AZURE_FOUNDRY_API_KEY` and replace them showing only the first 6 and last 4 characters.
- **Log Streaming**: An Server-Sent Events (SSE) router handles tailing `agentic_workspace.log` in real time, pushing streams to the React Observability panel.
