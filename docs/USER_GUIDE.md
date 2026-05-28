# AgenticDataWorkspace: User Guide & Onboarding Handbook

Welcome to **AgenticDataWorkspace**! This platform modernizes data pipeline development in Databricks by leveraging a multi-agent AI system built on LangGraph. This guide outlines how to configure products, projects, custom skills, and execution flows.

---

## 1. Core Architecture Overview

AgenticDataWorkspace utilizes 8 specialized agents to design, build, and test your pipelines. Each agent handles a specific stage of the development lifecycle:

| Agent Name | Role & Responsibility |
| :--- | :--- |
| **Orchestration Agent** | LangGraph supervisor coordinating transitions, validation, and user feedback loops. |
| **Requirement Gathering** | Collects business metrics and maps fields to functional requirements. |
| **Discovery Agent** | Connects to source schemas, catalogs, and lists table statistics. |
| **Data Modelling Agent** | Designs target entity-relationship schemas (Star Schema, Delta Tables). |
| **Spec Creation Agent** | Generates source-to-target field level specifications. |
| **Pipeline Generation** | Compiles specs into highly optimized PySpark and SQL notebooks. |
| **Pipeline Running** | Deploys jobs and executes notebooks directly via the Databricks Jobs API. |
| **Testing Agent** | Performs assertions, validates Row Counts, checks Null Constraints, and generates QA reports. |

---

## 2. Onboarding Workflow

To build your first automated PySpark pipeline, follow these steps sequentially:

### Step 1: Register a Data Product
1. Navigate to the **Data Products** tab in the sidebar.
2. Click **Create Data Product** to launch the 2-step setup wizard.
3. **Step 1 (Basic Info):** Input the name and description. Notice the ✨ sparkle icon on the input fields; start typing to receive AI-suggested templates.
4. **Step 2 (Data Governance):** Specify the Unity Catalog owner and tags, then click **Finish & Save**.

### Step 2: Configure a Data Project
1. Navigate to the **Data Projects** tab.
2. Click **New Data Project** to open the 4-step wizard.
3. **Step 1 (Scope):** Select your newly registered Data Product and name the data project.
4. **Step 2 (Workspace URL):** Enter your Databricks Workspace host (e.g., `https://dbc-xxxx.cloud.databricks.com`).
5. **Step 3 (Catalog/Schema Configuration):** Define the Unity Catalog name, target Schema name, and Table Prefix.
6. **Step 4 (Review & Save):** Validate the cascade settings in the summary list, then click **Confirm**.

### Step 3: Author Custom Skills (Tool Studio)
1. Open the **Tool Studio** tab.
2. To teach the AI agents a new routine, input a **Skill Name** (e.g. *Analyze Timestamp Windows*) and **Description**.
3. Under **Instructions**, write the exact rules for the agent (e.g., *Check table columns. If timestamp is found, suggest daily tumbling windows*).
4. Use the **Parameter Builder** to add required parameter variables. Specify their key name, data type (string, integer, boolean, select), and whether they are mandatory.
5. Click **Register Skill** to add it to the Skill Library.
6. Switch to the **Agent Configuration** subtab to assign the skill to a specialized agent.

### Step 4: Execute Workflows (Studio Workbench)
1. Go to the **Studio Workbench** tab.
2. Select your active data project from the dropdown.
3. Click **Trigger Multi-Agent** to start the LangGraph supervisor.
4. If an agent determines that required parameter constraints (configured in Tool Studio) are missing from the current run context, the state will toggle to **Blocked** and prompt you to input the values. Enter them and click **Submit & Resume**.
5. View the live execution sequence in the **State Machine Diagram** and read real-time reasoning logs in the **Reasoning Execution Console**.

---

## 3. Key UI Enhancements

### ✨ AI Suggest
All free-text input fields marked with the sparkle icon leverage background AI completion. Type at least 2 characters to trigger options from the knowledge base, then press **Tab** or click a suggestion to insert it.

### 🛡️ Observability & Auditing
Go to the **Observability & Logs** tab to view historical run traces. You can filter logs by severity level (INFO, WARN, SUCCESS, ERROR) or by the specific agent that generated them, ensuring complete auditing of all Databricks deployments.
