export interface DataProduct {
  id: number;
  name: string;
  description: string;
  uc_owner?: string;
  tags?: string;
  type?: string; // Ingestion, Migration, Warehousing, Governance
  global_parameters?: string; // JSON string of SkillParameter[]
  global_instruction?: string;
  is_enabled: boolean;
  owner_group?: string;
  
  // Audit properties
  created_by?: string;
  created_at: string;
  updated_by?: string;
  updated_at?: string;
}

export interface DataProject {
  id: number;
  name: string;
  description: string;
  data_product_id: number;
  databricks_url: string;
  catalog_name: string;
  schema_name: string;
  table_prefix: string;
  instructions?: string;
  is_enabled: boolean;
  parameters?: string; // JSON string of parameter values overrides
  
  // Audit properties
  created_by?: string;
  created_at: string;
  updated_by?: string;
  updated_at?: string;
}

export interface SkillParameter {
  name: string;
  type: 'string' | 'integer' | 'boolean' | 'list' | 'number';
  description: string;
  required: boolean;
  default_value?: string;
}

export interface Tool {
  id: number;
  name: string;
  description: string;
  type: string; // python, sql, api
  code: string;
  parameters: string; // JSON string of SkillParameter[]
  is_enabled: boolean;
  created_by?: string;
  created_at?: string;
  updated_by?: string;
  updated_at?: string;
}

export interface Skill {
  id: number;
  name: string;
  description: string;
  instruction: string;
  parameters: string; // JSON string of SkillParameter[]
  output_definition?: string;
  tools: string[]; // Parsed array of tool names associated with this skill
  is_enabled: boolean;
  
  // Audit properties
  created_by?: string;
  created_at: string;
  updated_by?: string;
  updated_at?: string;
}

export interface Agent {
  id: number;
  name: string;
  role: string;
  skills: string[]; // Parsed array of skill names
  tools: string[]; // Parsed array of tool names
  instructions: string;
  introduction?: string;
  is_enabled: boolean;
  
  // Audit properties
  created_by?: string;
  created_at?: string;
  updated_by?: string;
  updated_at?: string;
}

export interface Workflow {
  id: number;
  name: string;
  description: string;
  data_product_id: number;
  data_project_id: number;
  agents_sequence: string[];
  status: string; // Idle, Running, Blocked, Completed, Failed
  is_enabled: boolean;
  parameters: Record<string, any>;
  missing_parameters: { name: string; type: string; description: string; required: boolean }[];
  current_agent: string;
  next_agent: string | null;
  history_logs: { level: string; message: string; agent_name?: string }[];
  resolved_parameters?: { name: string; type: string; description: string; required: boolean; default_value?: any }[];
  schedule_cron?: string | null;
  schedule_enabled?: boolean;
  last_run_at?: string | null;

  // Audit properties
  created_by?: string;
  created_at: string;
  updated_by?: string;
  updated_at?: string;
}

export interface Artifact {
  id: number;
  name: string;
  type: string; // Schema, Specification, PySpark Code, etc.
  content: string;
  data_project_id: number;
  status: string;
  metadata_json: string; // JSON detail
  
  // Audit properties
  created_by?: string;
  created_at: string;
  updated_by?: string;
  updated_at?: string;
}

export interface SystemLog {
  id: number;
  timestamp: string;
  level: string;
  message: string;
  details: string;
  agent_name: string;
  project_id: number;
  
  // Audit properties
  created_by?: string;
  created_at?: string;
  updated_by?: string;
  updated_at?: string;
}

export interface SuggestRequest {
  field: string;
  context: string;
  value: string;
}

export type ActiveTab =
  | 'home'
  | 'products'
  | 'projects'
  | 'tools'
  | 'skills'
  | 'agents'
  | 'workflows'
  | 'orchestration'
  | 'orchestration-schedules'
  | 'orchestration-history'
  | 'history'
  | 'nexus'
  | 'observability'
  | 'settings'
  | 'help';
