# Implementation Plan: Ingesting data.gov.in Datasets via Data Product Studio (Revised)

Provide a complete configuration, execution, and testing plan using the modernized Agentic Studio wizard interfaces to orchestrate the ingestion of 4 target datasets from `api.data.gov.in`.

## User Review Required

> [!IMPORTANT]
> - All names of Agents, Skills, Workflows, and Data Products will be **strictly space-less** (using CamelCase or PascalCase).
> - We will create **generic, reusable skills** and bundle them into a **domain-specific Agent** (`IndiaOpenDataIngestionAgent`) to represent the ingestion context.
> - The `BuildWorkflow` will only consist of the specification and generation agents (`SpecCreationAgent` and `PipelineGenerationAgent`), excluding any execution runtime steps.

## Open Questions

None. We are ready to proceed with these updates.

## Proposed Changes

### 1. Refactor Backend Agent Names to Be Space-less
We will replace the hardcoded agent names with space-less PascalCase equivalents in `backend/agents/graph.py` and `backend/main.py`:
- `"Requirement Gathering Agent"` ➔ `"RequirementGatheringAgent"`
- `"Discovery Agent"` ➔ `"DiscoveryAgent"`
- `"Data Modelling Agent"` ➔ `"DataModellingAgent"`
- `"Spec Creation Agent"` ➔ `"SpecCreationAgent"`
- `"Pipeline Generation Agent"` ➔ `"PipelineGenerationAgent"`
- `"Pipeline Running Agent"` ➔ `"PipelineRunningAgent"`
- `"Testing Agent"` ➔ `"TestingAgent"`

### 2. Configure Database Entities via UI (Browser Subagent)
We will launch the browser subagent, open `http://localhost:5173`, and register:

#### A. Generic Skills
- `FetchRESTAPIData` (uses `sync_rest_api_extraction` tool)
- `AnalyzeAPISchema` (profiling)
- `CreateJSONSchema` (uses `file_writer_tool` to write `source_schema.json`)
- `GenerateMedallionDDL` (landing/bronze/silver/gold Delta DDLs)
- `GenerateMedallionDML` (transformation scripts)

#### B. Domain-Specific Ingestion Agent
- `IndiaOpenDataIngestionAgent`: Link all 5 generic skills above to this agent.

#### C. Standard ReAct Agents (CamelCase)
Create the CamelCase agents required for workflow routing:
- `RequirementGatheringAgent`
- `DiscoveryAgent`
- `DataModellingAgent`
- `SpecCreationAgent`
- `PipelineGenerationAgent`

#### D. Data Product
- `IndiaOpenDataIngestion` (no spaces)
  - Global Parameter: `api_key` = `579b464db66ec23bdd0000012245586ae923491754abd6ea088e6010`

#### E. Data Projects
Create four projects under `IndiaOpenDataIngestion` (space-less names):
- `CoastalFleetIngestion` (Resource: `0d53d83c-fc74-43b7-a7de-ddf005b62755`)
- `RealtimeAirQualityIndexIngestion` (Resource: `3b01bcb8-0b14-4abf-b6f2-c1bfd384ba69`)
- `PollutionIndexCepiScoresIngestion` (Resource: `579cf1f-7e3b-4b15-b29a-87cf7b7c7a08`)
- `DailyMandiPricesIngestion` (Resource: `9ef84268-d588-465a-a308-a864a43d0070`)

#### F. Workflows
Create three space-less workflows:
1. `DiscoveryWorkflow`
   - Sequence: `RequirementGatheringAgent` ➔ `DiscoveryAgent`
2. `DataModellingWorkflow`
   - Sequence: `DataModellingAgent`
3. `BuildWorkflow`
   - Sequence: `SpecCreationAgent` ➔ `PipelineGenerationAgent`

## Verification Plan

### Manual Verification & Artifacts
- Execute the workflows via the UI.
- Verify that `source_schema.json`, DDLs, and DMLs are successfully generated.
- Capture screenshots and save them in the `testing/` folder in the workspace.
